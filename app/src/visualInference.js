import fs from 'node:fs/promises';
import path from 'node:path';

const PROMPT_VERSION = 'phase-two-field-evidence-v1';

function defaultFixture(evidence = {}, tradeCase = {}) {
  const slot = evidence.checklistSlot || 'unknown';
  const machine = tradeCase.machine || {};
  const isDark = String(evidence.notes || evidence.storageUri || '').toLowerCase().includes('dark');
  const qualityStatus = isDark ? 'needs_retake' : 'accepted';

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
          finding: `Fixture visual review for ${machine.make || 'machine'} ${machine.model || ''} ${slot}: no major visible issue recorded.`,
          severity: 'info',
          confidence: 0.55,
          needsFollowUp: false
        }
      ],
      evidenceQualityFindings: [
        {
          issue: qualityStatus === 'needs_retake'
            ? 'Fixture review marked the image as too dark for reliable condition review.'
            : 'Fixture review marked the image as usable for field evidence.',
          recommendation: qualityStatus === 'needs_retake'
            ? 'Ask for a brighter retake of this checklist slot.'
            : 'Continue collecting the remaining baseline evidence.'
        }
      ],
      uncertainty: [
        'Fixture mode does not perform real image analysis.'
      ],
      retakeReason: qualityStatus === 'needs_retake' ? 'Image appears too dark for useful review.' : null,
      nextEvidenceNeeded: []
    },
    rawResponse: { fixture: true }
  };
}

export async function analyzeEvidenceMedia({ evidence, tradeCase, request = {} }) {
  const mode = process.env.OPENAI_VISION_MODE || (process.env.OPENAI_API_KEY ? 'live' : 'fixture');
  if (mode === 'fixture') return defaultFixture(evidence, tradeCase);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is required for live visual inference');
    error.statusCode = 503;
    throw error;
  }

  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini';
  const media = resolveMediaInputs(request, evidence);
  const content = [
    {
      type: 'input_text',
      text: buildPrompt({ evidence, tradeCase, request })
    }
  ];

  for (const item of media.slice(0, 6)) {
    const imageUrl = await resolveImageUrl(item.storageUri || item.storage_uri, item.contentType || item.content_type);
    if (imageUrl) {
      content.push({ type: 'input_image', image_url: imageUrl, detail: 'auto' });
    }
  }

  if (content.length === 1) {
    const error = new Error('No analyzable image input was available for visual inference');
    error.statusCode = 400;
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

async function resolveImageUrl(storageUri, contentType = 'image/jpeg') {
  if (!storageUri) return null;
  if (/^https?:\/\//i.test(storageUri) || /^data:image\//i.test(storageUri)) return storageUri;
  if (/^teams:\/\//i.test(storageUri)) return null;

  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const candidate = path.isAbsolute(storageUri) ? storageUri : path.resolve(root, storageUri);
  try {
    const data = await fs.readFile(candidate);
    return `data:${contentType || 'image/jpeg'};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
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
    uncertainty: Array.isArray(parsed.uncertainty) ? parsed.uncertainty.map(String) : [],
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
