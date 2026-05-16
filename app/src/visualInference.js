import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getChecklist, normalizeUnitType } from './checklists.js';

const PROMPT_VERSION = 'phase-two-field-evidence-v2';

function defaultFixture(evidence = {}, tradeCase = {}, request = {}) {
  const slot = evidence.checklistSlot || 'unknown';
  const machine = tradeCase.machine || {};
  const slotLabel = describeSlot(machine.unitType, slot);
  const isDark = String(evidence.notes || evidence.storageUri || '').toLowerCase().includes('dark');
  const isStartupVideo = evidence.mediaType === 'video' || slot === 'startup_video';
  const sampledFrameCount = Array.isArray(request.sampledFrames) ? request.sampledFrames.length : 0;
  const qualityStatus = isDark ? 'needs_retake' : isStartupVideo && sampledFrameCount <= 1 ? 'weak' : 'accepted';
  const uncertainty = [
    'Fixture mode does not perform real image analysis.'
  ];
  if (isStartupVideo) {
    uncertainty.push('Startup video is represented by sampled frame evidence only; audio, smoke under load, warning tones, and true cold-start behavior are not verified.');
  }

  return {
    provider: 'fixture',
    model: 'fixture-vision',
    mode: 'fixture',
    promptVersion: PROMPT_VERSION,
    normalized: {
      analysisStatus: 'complete',
      qualityStatus,
      checklistSlot: slot,
      checklistSlotConfidence: slot === 'unknown' ? 0.2 : 0.82,
      visibleConditionFindings: [
        {
          section: slot,
          finding: `Fixture visual review for ${machine.make || 'machine'} ${machine.model || ''} ${slotLabel}: no major visible issue recorded.`,
          severity: 'info',
          confidence: 0.55,
          needsFollowUp: false
        }
      ],
      evidenceQualityFindings: [
        {
          issue: qualityStatus === 'needs_retake'
            ? 'Fixture review marked the image as too dark for reliable condition review.'
            : qualityStatus === 'weak'
              ? 'Fixture review marked the startup video evidence as usable only with low confidence from sampled frames.'
            : 'Fixture review marked the image as usable for field evidence.',
          recommendation: qualityStatus === 'needs_retake'
            ? 'Ask for a brighter retake of this checklist slot.'
            : qualityStatus === 'weak'
              ? 'Ask for a short startup clip that captures cold start, idle, exhaust, warning lights, and any abnormal sound if safe to record.'
            : 'Continue collecting the remaining baseline evidence.'
        }
      ],
      uncertainty,
      retakeReason: qualityStatus === 'needs_retake' ? 'Image appears too dark for useful review.' : null,
      nextEvidenceNeeded: []
    },
    rawResponse: { fixture: true }
  };
}

function describeSlot(unitType, slot) {
  const normalizedUnitType = normalizeUnitType(unitType || 'combine');
  const label = getChecklist(normalizedUnitType).find(([definitionSlot]) => definitionSlot === slot)?.[1];
  return label || humanizeToken(slot);
}

export async function analyzeEvidenceMedia({ evidence, tradeCase, request = {} }) {
  const mode = process.env.OPENAI_VISION_MODE || (process.env.OPENAI_API_KEY ? 'live' : 'fixture');
  if (mode === 'fixture') return defaultFixture(evidence, tradeCase, request);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is required for live visual inference');
    error.statusCode = 503;
    throw error;
  }

  const model = selectVisionModel(request);
  const media = resolveMediaInputs(request, evidence);
  const content = [
    {
      type: 'input_text',
      text: buildPrompt({ evidence, tradeCase, request })
    }
  ];

  for (const item of media.slice(0, 6)) {
    const imageUrls = await resolveImageInputsForMedia(item);
    for (const imageUrl of imageUrls) {
      if (imageUrl) {
        content.push({ type: 'input_image', image_url: imageUrl, detail: 'auto' });
      }
    }
  }

  if (content.length === 1) {
    const error = unsupportedMediaError(evidence.mediaType === 'video'
      ? 'Video evidence was received, but no sampled frames were available for visual inference. Install ffmpeg on the VM or ask the rep for still photos of the highest-priority missing sections.'
      : 'No analyzable image input was available for visual inference.');
    throw error;
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content
        }
      ]
    })
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(raw.error?.message || `OpenAI visual inference failed with ${response.status}`);
    error.statusCode = 502;
    throw error;
  }

  return {
    provider: 'openai',
    model,
    mode: 'live',
    promptVersion: PROMPT_VERSION,
    normalized: normalizeModelOutput(extractOutputText(raw), evidence),
    rawResponse: raw
  };
}

export function selectVisionModel(request = {}) {
  const defaultModel = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4-mini';
  const reviewModel = process.env.OPENAI_VISION_REVIEW_MODEL || 'gpt-5.4';
  const requestedModel = request.model || request.openaiModel;
  if (requestedModel) return requestedModel;

  const analysisMode = String(request.analysisMode || request.analysis_mode || '').toLowerCase();
  const escalationRequested = request.escalate === true ||
    request.useReviewModel === true ||
    request.highRisk === true ||
    ['review', 'review_grade', 'high_risk', 'escalation', 'technician_escalation'].includes(analysisMode);

  return escalationRequested ? reviewModel : defaultModel;
}

function buildPrompt({ evidence, tradeCase, request }) {
  const machine = request.machineContext || tradeCase.machine || {};
  return `You are helping a John Deere dealership sales rep collect field evidence for a trade-in evaluation.

Return only valid JSON with keys:
analysisStatus, qualityStatus, checklistSlot, checklistSlotConfidence, visibleConditionFindings, evidenceQualityFindings, uncertainty, retakeReason, nextEvidenceNeeded.

Use these enums:
qualityStatus: accepted, weak, needs_retake, duplicate, rejected.
severity: info, watch, concern, severe.

Separate what is visibly supported by the image from what cannot be verified.
Do not estimate trade value. Do not claim a full mechanical diagnosis.
For startup_video or other video evidence, you may receive sampled frames rather than the full video/audio stream. Do not claim audio quality, true cold-start behavior, warning tones, smoke timing, idle smoothness, or abnormal sound unless the provided evidence directly supports it. If the frames do not show enough startup context, mark qualityStatus as weak, add a clear uncertainty, and ask for a short video that captures cold start, idle, exhaust, warning lights, and abnormal sound if safe to record.

Machine context:
${JSON.stringify(machine)}

Evidence context:
${JSON.stringify({
    mediaType: evidence.mediaType,
    storageUri: evidence.storageUri,
    sampledFrameCount: Array.isArray(request.sampledFrames) ? request.sampledFrames.length : 0,
    checklistSlot: request.checklistSlot || evidence.checklistSlot,
    notes: evidence.notes
  })}`;
}

function resolveMediaInputs(request, evidence) {
  const explicitMedia = Array.isArray(request.media) ? request.media : [];
  const sampledFrames = Array.isArray(request.sampledFrames)
    ? request.sampledFrames.map(frame => ({
        ...frame,
        mediaType: 'photo',
        sourceVideoUri: frame.sourceVideoUri || evidence.storageUri
      }))
    : [];

  if (sampledFrames.length) return sampledFrames;
  if (explicitMedia.length) {
    return explicitMedia.flatMap(item => {
      if (Array.isArray(item.sampledFrames) && item.sampledFrames.length) {
        return item.sampledFrames.map(frame => ({
          ...frame,
          mediaType: 'photo',
          sourceVideoUri: frame.sourceVideoUri || item.storageUri
        }));
      }
      return item;
    });
  }
  return [evidence];
}

export async function resolveImageInputsForMedia(item = {}) {
  const storageUri = item.storageUri || item.storage_uri;
  const mediaType = String(item.mediaType || item.media_type || '').toLowerCase();
  const contentType = String(item.contentType || item.content_type || '').toLowerCase();
  const looksLikeVideo = mediaType === 'video' || contentType.startsWith('video/') || /\.(mp4|mov|m4v|webm)(\?.*)?$/i.test(String(storageUri || ''));

  if (!looksLikeVideo) {
    const imageUrl = await resolveImageUrl(storageUri, item.contentType || item.content_type || 'image/jpeg');
    return imageUrl ? [imageUrl] : [];
  }

  return sampleVideoFrames(item);
}

export async function resolveImageUrl(storageUri, contentType = 'image/jpeg') {
  if (!storageUri) return null;
  if (/^https?:\/\//i.test(storageUri) || /^data:image\//i.test(storageUri)) return storageUri;
  if (/^teams:\/\//i.test(storageUri)) return null;

  const candidate = await resolveLocalMediaPath(storageUri);
  if (!candidate) return null;
  try {
    const data = await fs.readFile(candidate);
    return `data:${contentType || 'image/jpeg'};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function resolveLocalMediaPath(storageUri) {
  if (!storageUri || /^https?:\/\//i.test(storageUri) || /^data:image\//i.test(storageUri) || /^teams:\/\//i.test(storageUri)) {
    return null;
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const mediaRoot = process.env.OPENCLAW_MEDIA_ROOT || '/home/openclaw/.openclaw/media';
  const raw = String(storageUri);
  if (raw.includes('\0')) return null;

  const mediaInboundRoot = path.resolve(mediaRoot, 'inbound');
  let allowedRoots = [repoRoot, mediaRoot].filter(Boolean);
  let candidate;

  try {
    if (/^media:\/\/inbound\//i.test(raw)) {
      const mediaId = decodeURIComponent(raw.replace(/^media:\/\/inbound\//i, ''));
      candidate = path.resolve(mediaInboundRoot, mediaId);
      allowedRoots = [mediaInboundRoot];
    } else if (/^file:\/\//i.test(raw)) {
      candidate = fileURLToPath(raw);
    } else {
      candidate = path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
    }
  } catch {
    return null;
  }

  try {
    const lstat = await fs.lstat(candidate);
    if (lstat.isSymbolicLink()) return null;
    const realCandidate = await fs.realpath(candidate);
    const realRoots = await Promise.all(allowedRoots.map(async root => {
      try {
        return await fs.realpath(root);
      } catch {
        return path.resolve(root);
      }
    }));
    const allowed = realRoots.some(root => realCandidate === root || realCandidate.startsWith(`${root}${path.sep}`));
    return allowed ? realCandidate : null;
  } catch {
    return null;
  }
}

export async function sampleVideoFrames(item = {}) {
  const storageUri = item.storageUri || item.storage_uri;
  const videoPath = await resolveLocalMediaPath(storageUri);
  if (!videoPath) {
    throw unsupportedMediaError('Video evidence was received, but the sidecar could not resolve it under the allowlisted OpenClaw media root.');
  }

  const frameCount = Math.max(1, Math.min(Number(process.env.TRADE_IN_VIDEO_FRAME_COUNT || 3), 6));
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trade-in-video-'));
  const outputPattern = path.join(tmpDir, 'frame-%03d.jpg');
  try {
    await execFilePromise(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      videoPath,
      '-vf',
      `fps=1/${Math.max(1, Number(process.env.TRADE_IN_VIDEO_FRAME_INTERVAL_SECONDS || 5))}`,
      '-frames:v',
      String(frameCount),
      outputPattern
    ], { timeout: Number(process.env.TRADE_IN_FFMPEG_TIMEOUT_MS || 30000) });

    let files = await readSampledFrameFiles(tmpDir, frameCount);
    if (!files.length) {
      await execFilePromise(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        '0',
        '-i',
        videoPath,
        '-frames:v',
        '1',
        path.join(tmpDir, 'fallback-001.jpg')
      ], { timeout: Number(process.env.TRADE_IN_FFMPEG_TIMEOUT_MS || 30000) });
      files = await readSampledFrameFiles(tmpDir, frameCount);
    }
    if (!files.length) throw unsupportedMediaError('Video evidence was received, but ffmpeg did not produce any usable sampled frames.');
    const frames = [];
    for (const file of files) {
      const data = await fs.readFile(path.join(tmpDir, file));
      frames.push(`data:image/jpeg;base64,${data.toString('base64')}`);
    }
    return frames;
  } catch (error) {
    if (error?.statusCode === 422) throw error;
    throw unsupportedMediaError(`Video evidence was received, but frame sampling failed: ${error.message || error}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function readSampledFrameFiles(tmpDir, frameCount) {
  return (await fs.readdir(tmpDir)).filter(file => file.endsWith('.jpg')).sort().slice(0, frameCount);
}

function execFilePromise(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.message = [error.message, stderr].filter(Boolean).join(': ');
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function unsupportedMediaError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.analysisStatus = 'unsupported';
  error.qualityStatus = 'weak';
  return error;
}

function extractOutputText(raw) {
  if (typeof raw.output_text === 'string') return raw.output_text;
  const chunks = [];
  for (const item of raw.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}

function normalizeModelOutput(text, evidence) {
  let parsed = {};
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    parsed = {};
  }

  const qualityStatus = normalizeQualityStatus(parsed.qualityStatus);
  return {
    analysisStatus: 'complete',
    qualityStatus,
    checklistSlot: parsed.checklistSlot || evidence.checklistSlot || null,
    checklistSlotConfidence: clampConfidence(parsed.checklistSlotConfidence),
    visibleConditionFindings: normalizeFindings(parsed.visibleConditionFindings, 'condition'),
    evidenceQualityFindings: normalizeQualityFindings(parsed.evidenceQualityFindings),
    uncertainty: Array.isArray(parsed.uncertainty) ? parsed.uncertainty.map(textValue).filter(Boolean) : [],
    retakeReason: parsed.retakeReason || null,
    nextEvidenceNeeded: Array.isArray(parsed.nextEvidenceNeeded) ? parsed.nextEvidenceNeeded.map(String) : []
  };
}

function normalizeQualityStatus(value) {
  return ['accepted', 'weak', 'needs_retake', 'duplicate', 'rejected'].includes(value) ? value : 'weak';
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function normalizeFindings(items, fallbackType) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 12).map(item => ({
    section: item.section || null,
    finding: String(item.finding || item.issue || ''),
    severity: ['info', 'watch', 'concern', 'severe'].includes(item.severity) ? item.severity : 'info',
    confidence: clampConfidence(item.confidence),
    needsFollowUp: Boolean(item.needsFollowUp),
    recommendation: item.recommendation || null,
    findingType: item.findingType || fallbackType
  })).filter(item => item.finding);
}

function normalizeQualityFindings(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 12).map(item => ({
    issue: String(item.issue || item.finding || ''),
    recommendation: item.recommendation || null
  })).filter(item => item.issue);
}

function textValue(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'number' || typeof item === 'boolean') return String(item);
  return String(
    item.uncertainty ||
    item.limitation ||
    item.issue ||
    item.finding ||
    item.reason ||
    item.recommendation ||
    JSON.stringify(item)
  );
}

function humanizeToken(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}
