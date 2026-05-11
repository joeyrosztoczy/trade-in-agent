import { closePool } from '../src/db.js';
import { runWorkerBatch } from '../src/worker.js';

const baseUrl = process.env.SIDECAR_URL || 'http://127.0.0.1:8788';
const smokeImageUrl = process.env.OPENAI_VISION_SMOKE_IMAGE_URL || 'https://photos.machinefinder.com/96/11033496/73087499_large_48294.jpg';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${text}`);
  }
  return body;
}

try {
  const health = await request('/health');
  if (!health.ok) throw new Error('Health check did not return ok');

  const tradeCase = await request('/trade-cases', {
    method: 'POST',
    body: JSON.stringify({
      createdBy: 'async-smoke-test',
      sourceConversationId: `async-smoke-${Date.now()}`,
      machine: {
        unitType: 'combine',
        make: 'John Deere',
        model: 'S780',
        modelYear: 2021,
        serialOrPin: 'ASYNC-SMOKE-PIN',
        engineHours: 1200,
        separatorHours: 850,
        location: 'Async smoke test'
      }
    })
  });

  const batch = await request(`/trade-cases/${tradeCase.id}/evidence/batch`, {
    method: 'POST',
    body: JSON.stringify({
      processingMode: 'async',
      items: [
        {
          uploadedBy: 'async-smoke-test',
          mediaType: 'photo',
          storageUri: smokeImageUrl,
          originalFileName: 'async-smoke-front-45.jpg',
          contentType: 'image/jpeg',
          sourceMessageId: 'async-smoke-message-1',
          sourceAttachmentId: `async-smoke-attachment-front-${Date.now()}`,
          checklistSlot: 'front_45',
          notes: 'Async smoke front 45 photo'
        },
        {
          uploadedBy: 'async-smoke-test',
          mediaType: 'photo',
          storageUri: smokeImageUrl,
          originalFileName: 'async-smoke-rear-45.jpg',
          contentType: 'image/jpeg',
          sourceMessageId: 'async-smoke-message-1',
          sourceAttachmentId: `async-smoke-attachment-rear-${Date.now()}`,
          checklistSlot: 'rear_45',
          notes: 'Async smoke rear 45 photo'
        }
      ]
    })
  });

  if (batch.registeredCount !== 2) throw new Error(`Expected 2 registered items, got ${batch.registeredCount}`);
  if (batch.queuedCount !== 2) throw new Error(`Expected 2 queued jobs, got ${batch.queuedCount}`);
  if (!batch.message?.includes(batch.caseNumber)) throw new Error('Async acknowledgement did not include case number');

  let status = await request(`/trade-cases/${tradeCase.id}/processing-status`);
  for (let attempt = 0; attempt < 20 && status.summary.complete < 2; attempt += 1) {
    await runWorkerBatch({ workerId: 'async-smoke-test', claimLimit: 4, concurrency: 2, perCaseConcurrency: 2 });
    await delay(250);
    status = await request(`/trade-cases/${tradeCase.id}/processing-status`);
  }

  if (status.summary.complete < 2) {
    throw new Error(`Async jobs did not complete: ${JSON.stringify(status.summary)}`);
  }

  const guidance = await request(`/trade-cases/${tradeCase.id}/guidance`, { method: 'POST', body: '{}' });
  if (!guidance.caseNumber || !guidance.suggestedNextMessage.includes(guidance.caseNumber)) {
    throw new Error('Guidance did not include visible case number');
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    tradeCaseId: tradeCase.id,
    caseNumber: batch.caseNumber,
    acknowledgement: batch.message,
    processingSummary: status.summary,
    guidance: guidance.suggestedNextMessage
  }, null, 2));
} finally {
  await closePool();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
