import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProcessingAcknowledgementMessage } from '../src/presentation.js';
import { runWithConcurrency } from '../src/worker.js';

test('processing acknowledgement tells field users work is happening in the background', () => {
  const message = buildProcessingAcknowledgementMessage({
    caseNumber: 'TIA-ABC12345',
    registeredCount: 12,
    queuedCount: 12,
    checklist: {
      unitType: 'combine',
      nextRecommendedSlots: ['serial_plate', 'cab_display_hours', 'feeder_house']
    }
  });

  assert.match(message, /Trade case TIA-ABC12345 is open/);
  assert.match(message, /I added 12 new items/);
  assert.match(message, /processing 12 in the background/);
  assert.match(message, /You can keep sending photos or video/);
  assert.match(message, /Serial plate/);
  assert.doesNotMatch(message, /\bserial_plate\b/);
});

test('worker scheduler runs jobs concurrently while respecting per-case limits', async () => {
  const jobs = [
    { id: 'a1', tradeCaseId: 'case-a' },
    { id: 'a2', tradeCaseId: 'case-a' },
    { id: 'a3', tradeCaseId: 'case-a' },
    { id: 'b1', tradeCaseId: 'case-b' },
    { id: 'b2', tradeCaseId: 'case-b' }
  ];
  let active = 0;
  let maxActive = 0;
  const activeByCase = new Map();
  const maxActiveByCase = new Map();

  const results = await runWithConcurrency(jobs, {
    concurrency: 3,
    perGroupLimit: 2,
    groupKey: job => job.tradeCaseId
  }, async job => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    const caseActive = (activeByCase.get(job.tradeCaseId) || 0) + 1;
    activeByCase.set(job.tradeCaseId, caseActive);
    maxActiveByCase.set(job.tradeCaseId, Math.max(maxActiveByCase.get(job.tradeCaseId) || 0, caseActive));
    await delay(25);
    activeByCase.set(job.tradeCaseId, (activeByCase.get(job.tradeCaseId) || 1) - 1);
    active -= 1;
    return job.id;
  });

  assert.deepEqual(results, ['a1', 'a2', 'a3', 'b1', 'b2']);
  assert.ok(maxActive > 1, 'expected jobs to run concurrently');
  assert.ok(maxActive <= 3, 'global concurrency limit should be respected');
  assert.ok((maxActiveByCase.get('case-a') || 0) <= 2, 'per-case limit should be respected');
  assert.ok((maxActiveByCase.get('case-b') || 0) <= 2, 'per-case limit should be respected');
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
