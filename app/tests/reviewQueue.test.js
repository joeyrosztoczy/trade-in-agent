import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from '../src/server.js';
import { closePool } from '../src/db.js';
import { runWorkerBatch } from '../src/worker.js';

process.env.CONTRACT_VALIDATE_RESPONSES = '1';
process.env.OPENAI_VISION_MODE = 'fixture';
process.env.DEMO_VALUATION_ENABLED = 'true';
process.env.DEMO_VALUATION_MODE = 'fixture';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/online-combine-examples.json'), 'utf8'));
const reviewDatabase = prepareDatabase();

test('review queue renders sidecar cases after async evidence processing and packet generation', { skip: reviewDatabase.skip }, async () => {
  const { server, baseUrl } = await startTestServer();
  const example = fixtureData.examples[0];

  try {
    const created = await request(baseUrl, '/trade-cases', {
      method: 'POST',
      expectedStatus: 201,
      body: {
        createdBy: 'review-queue-test',
        sourceConversationId: `review-queue-test-${Date.now()}`,
        machine: example.machine
      }
    });

    const batch = await request(baseUrl, `/trade-cases/${created.body.id}/evidence/batch`, {
      method: 'POST',
      expectedStatus: 201,
      body: {
        processingMode: 'async',
        items: example.photos.slice(0, 4).map((photo, index) => ({
          uploadedBy: 'review-queue-test',
          mediaType: photo.mediaType || 'photo',
          storageUri: photo.url,
          checklistSlot: photo.slot,
          contentType: String(photo.url).includes('.webp') ? 'image/webp' : 'image/jpeg',
          sourceAttachmentId: `review-queue-test-${index}-${Date.now()}`,
          metadata: {
            exampleId: example.id,
            sourceName: example.sourceName,
            sourceUrl: example.sourceUrl,
            dealer: example.dealer,
            sourceLocation: example.machine.location,
            listingFacts: example.listingFacts
          }
        }))
      }
    });
    assert.equal(batch.body.registeredCount, 4);
    assert.equal(batch.body.queuedCount, 4);

    const worker = await runWorkerBatch({ claimLimit: 8, concurrency: 4, perCaseConcurrency: 2, logger: console });
    assert.equal(worker.failed, 0);
    assert.ok(worker.completed >= 4);

    const processedCase = await request(baseUrl, `/trade-cases/${created.body.id}`);
    assert.equal(
      processedCase.body.evidenceItems.filter(item => item.analysisStatus === 'complete').length,
      4,
      'async worker should complete visual analysis on claimed evidence'
    );
    assert.equal(
      processedCase.body.evidenceItems.filter(item => item.qualityStatus === 'accepted').length,
      4,
      'fixture visual analysis should mark usable listing photos as accepted'
    );

    const routing = await request(baseUrl, `/trade-cases/${created.body.id}/routing`, { method: 'POST', body: {} });
    assert.equal(routing.body.tradeCaseId, created.body.id);

    const packet = await request(baseUrl, `/trade-cases/${created.body.id}/packet`, {
      method: 'POST',
      expectedStatus: 201,
      body: {}
    });
    assert.equal(packet.body.tradeCaseId, created.body.id);
    assert.ok(packet.body.packet.demoValuation, 'expected demo valuation posture in packet');

    const queue = await request(baseUrl, '/review/cases?limit=25');
    const item = queue.body.items.find(candidate => candidate.id === created.body.id);
    assert.ok(item, 'seeded case should appear in review queue');
    assert.equal(item.sourceUrl, example.sourceUrl);
    assert.ok(item.evidence.length > 0);
    assert.ok(item.evidence.some(evidence => evidence.status === 'accepted'), 'review queue should expose accepted evidence tiles');
    assert.ok(item.reviewLines.some(line => line.label === 'Recon posture'));

    const detail = await request(baseUrl, `/review/cases/${created.body.id}`);
    assert.equal(detail.body.id, created.body.id);
    assert.ok(detail.body.packet.markdown.includes('Trade Evaluation Draft Packet'));
    assert.equal(detail.body.evidenceItems.length, 4);

    const action = await request(baseUrl, `/review/cases/${created.body.id}/actions`, {
      method: 'POST',
      expectedStatus: 201,
      body: {
        actionType: 'request_more_evidence',
        reviewer: 'review-queue-test',
        note: 'Need the rest of the required baseline slots before approval.'
      }
    });
    assert.equal(action.body.ok, true);
    assert.equal(action.body.case.reviewStatus, 'field_collection');
    assert.ok(action.body.case.actions.length >= 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await closePool();
  }
});

async function startTestServer() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    server,
    baseUrl: `http://${address.address}:${address.port}`
  };
}

async function request(baseUrl, pathname, { method = 'GET', body, expectedStatus = 200 } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  assert.equal(response.status, expectedStatus, `${method} ${pathname} returned ${response.status}: ${text}`);
  return { response, body: parsed };
}

function prepareDatabase() {
  const result = spawnSync(process.execPath, ['scripts/migrate.js'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: process.env
  });
  if (result.status !== 0) {
    const message = `review queue database unavailable; migrations failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
    if (process.env.REVIEW_QUEUE_TEST_REQUIRED === '1' || process.env.REVIEW_QUEUE_TEST_REQUIRED === 'true') {
      throw new Error(message);
    }
    return { skip: message };
  }
  return { skip: false };
}
