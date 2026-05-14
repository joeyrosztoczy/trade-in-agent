import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool } from '../src/db.js';
import { generatePacket } from '../src/repository.js';
import { runWorkerBatch } from '../src/worker.js';

process.env.OPENAI_VISION_MODE ||= 'fixture';
process.env.DEMO_VALUATION_ENABLED ||= 'true';
process.env.DEMO_VALUATION_MODE ||= 'fixture';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const dataPath = path.resolve(__dirname, '../data/online-combine-examples.json');
const baseUrl = process.env.SIDECAR_URL || 'http://127.0.0.1:8788';
const outputRoot = process.env.QA_OUTPUT_DIR || path.resolve(repoRoot, 'qa-output/review-queue-e2e');
const args = new Set(process.argv.slice(2));
const shouldProcess = !args.has('--no-process');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const runId = new Date().toISOString().replace(/[:.]/g, '-');

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname} failed (${response.status}): ${text}`);
  }
  return body;
}

async function main() {
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  const examples = limit ? data.examples.slice(0, limit) : data.examples;
  if (examples.length < 12 && !limit) throw new Error('Fixture dataset must contain at least 12 combine examples.');

  await request('/health');
  await fs.mkdir(path.join(outputRoot, runId), { recursive: true });

  const existingCases = await request('/trade-cases?includeArchived=true');
  const byConversation = new Map(existingCases.items.map(item => [item.sourceConversationId, item]));
  const results = [];

  for (const example of examples) {
    const sourceConversationId = `fixture:review-queue-e2e:${example.id}`;
    const tradeCase = byConversation.get(sourceConversationId) || await request('/trade-cases', {
      method: 'POST',
      body: {
        createdBy: `review-queue-e2e:${example.dealer}`,
        sourceConversationId,
        machine: example.machine
      }
    });

    if (byConversation.has(sourceConversationId)) {
      await request(`/trade-cases/${tradeCase.id}`, {
        method: 'PATCH',
        body: { machine: example.machine }
      });
    }

    const batch = await request(`/trade-cases/${tradeCase.id}/evidence/batch`, {
      method: 'POST',
      body: {
        processingMode: 'async',
        items: evidenceItemsForExample(example)
      }
    });

    results.push({
      exampleId: example.id,
      sourceUrl: example.sourceUrl,
      tradeCaseId: tradeCase.id,
      caseNumber: tradeCase.caseNumber,
      registeredCount: batch.registeredCount,
      queuedCount: batch.queuedCount
    });
  }

  const workerBatches = shouldProcess ? await drainWorkerQueue() : [];
  for (const result of results) {
    const routing = await request(`/trade-cases/${result.tradeCaseId}/routing`, { method: 'POST', body: {} });
    const packet = await generatePacket(result.tradeCaseId);
    Object.assign(result, {
      route: routing.route,
      reviewStatus: routing.reviewStatus,
      confidence: routing.confidence,
      packetId: packet?.id || null,
      packetReady: routing.packetReady
    });
  }

  const queue = await request('/review/cases?limit=100');
  const summary = {
    ok: true,
    runId,
    generatedAt: new Date().toISOString(),
    baseUrl,
    fixtureDataset: dataPath,
    examplesProcessed: results.length,
    workerBatches,
    results,
    reviewQueue: {
      generatedAt: queue.generatedAt,
      itemCount: queue.items.length,
      summary: queue.summary,
      seededCaseNumbers: results.map(result => result.caseNumber)
    }
  };

  const outputPath = path.join(outputRoot, runId, 'summary.json');
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, outputPath }, null, 2));
}

function evidenceItemsForExample(example) {
  return (example.photos || []).map((photo, index) => ({
    uploadedBy: `fixture:${example.id}`,
    mediaType: photo.mediaType || 'photo',
    storageUri: photo.url,
    checklistSlot: photo.slot,
    notes: [photo.caption, photo.notes].filter(Boolean).join(' - '),
    originalFileName: originalFileName(photo.url, example.id, index),
    contentType: contentTypeFor(photo),
    sourceMessageId: `fixture:${example.id}`,
    sourceAttachmentId: `${example.id}:${photo.slot}:${index}`,
    metadata: {
      exampleId: example.id,
      listingId: example.listingId,
      sourceName: example.sourceName,
      sourceLabel: example.sourceName,
      sourceUrl: example.sourceUrl,
      listingUrl: example.sourceUrl,
      sourceLocation: example.machine?.location || null,
      dealer: example.dealer,
      listingFacts: example.listingFacts || {},
      capturedAt: example.capturedAt || null,
      caption: photo.caption || null,
      sourceVideoUrl: photo.sourceVideoUrl || null
    }
  }));
}

async function drainWorkerQueue() {
  const batches = [];
  for (let index = 0; index < 20; index += 1) {
    const result = await runWorkerBatch({
      workerId: `review-queue-e2e-${process.pid}`,
      claimLimit: 24,
      concurrency: Number(process.env.TRADE_IN_ANALYSIS_CONCURRENCY || 8),
      perCaseConcurrency: Number(process.env.TRADE_IN_ANALYSIS_PER_CASE_CONCURRENCY || 2),
      logger: console
    });
    batches.push({
      claimed: result.claimed,
      completed: result.completed,
      failed: result.failed
    });
    if (!result.claimed) break;
  }
  return batches;
}

function originalFileName(url, id, index) {
  try {
    const parsed = new URL(url);
    return path.basename(parsed.pathname) || `${id}-${index}.jpg`;
  } catch {
    return `${id}-${index}.jpg`;
  }
}

function contentTypeFor(photo = {}) {
  if (photo.mediaType === 'video') return 'video/mp4';
  if (String(photo.url || '').toLowerCase().includes('.webp')) return 'image/webp';
  if (String(photo.url || '').toLowerCase().includes('.png')) return 'image/png';
  return 'image/jpeg';
}

try {
  await main();
} finally {
  await closePool();
}
