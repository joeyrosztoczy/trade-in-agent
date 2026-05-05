const baseUrl = process.env.SIDECAR_URL || 'http://127.0.0.1:8788';
const liveSmokeImageUrl = process.env.OPENAI_VISION_SMOKE_IMAGE_URL || 'https://api.nga.gov/iiif/a2e6da57-3cd1-4235-b20e-95dcaefed6c8/full/!800,800/0/default.jpg';
const liveVision = process.env.OPENAI_VISION_MODE === 'live';

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

const health = await request('/health');
if (!health.ok) throw new Error('Health check did not return ok');

const tradeCase = await request('/trade-cases', {
  method: 'POST',
  body: JSON.stringify({
    createdBy: 'smoke-test',
    sourceConversationId: `smoke-${Date.now()}`,
    machine: {
      unitType: 'combine',
      make: 'John Deere',
      model: 'S780',
      modelYear: 2021,
      serialOrPin: 'SMOKE-PIN',
      engineHours: 1200,
      separatorHours: 850,
      location: 'Smoke test location'
    }
  })
});

await request(`/trade-cases/${tradeCase.id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'draft',
    machine: {
      attachmentsOrOptions: 'Smoke test options'
    }
  })
});

const batch = await request(`/trade-cases/${tradeCase.id}/evidence/batch`, {
  method: 'POST',
  body: JSON.stringify({
    items: [
      {
        uploadedBy: 'smoke-test',
        mediaType: 'photo',
        storageUri: liveVision ? liveSmokeImageUrl : 'fixtures/media/front-45-placeholder.jpg',
        originalFileName: liveVision ? 'live-smoke-image.jpg' : 'front-45-placeholder.jpg',
        contentType: 'image/jpeg',
        sourceMessageId: 'smoke-message-1',
        sourceAttachmentId: 'smoke-attachment-1',
        checklistSlot: 'front_45',
        qualityStatus: 'pending',
        analysisStatus: 'pending',
        notes: 'Smoke test evidence'
      }
    ]
  })
});

const evidenceId = batch.items[0].id;
const analysis = await request(`/trade-cases/${tradeCase.id}/evidence/${evidenceId}/analyze`, {
  method: 'POST',
  body: JSON.stringify({
    analysisMode: 'field_evidence_quality',
    checklistSlot: 'front_45'
  })
});
if (analysis.analysis.analysisStatus !== 'complete') throw new Error('Visual analysis did not complete');

const checklist = await request(`/trade-cases/${tradeCase.id}/checklist`);
if (checklist.requiredCount <= 0) throw new Error('Checklist did not include required slots');
if (!checklist.missingSlots.includes('rear_45')) throw new Error('Checklist did not report expected missing slot');
if (!liveVision && !checklist.visibleConditionFindings.length) throw new Error('Checklist did not include visual findings');

const guidance = await request(`/trade-cases/${tradeCase.id}/guidance`, { method: 'POST', body: '{}' });
if (!guidance.suggestedNextMessage.includes('Next:')) throw new Error('Guidance did not include next-step message');
if (!guidance.caseNumber || !guidance.suggestedNextMessage.includes(guidance.caseNumber)) {
  throw new Error('Guidance did not include visible case number');
}

const packet = await request(`/trade-cases/${tradeCase.id}/packet`, { method: 'POST', body: '{}' });
const packetJson = packet.packet;
for (const key of ['machine', 'evidenceCompleteness', 'route', 'recommendation']) {
  if (!(key in packetJson)) throw new Error(`Packet missing ${key}`);
}
if (!packet.markdown.includes('Trade Evaluation Draft Packet')) {
  throw new Error('Packet markdown missing expected title');
}

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  tradeCaseId: tradeCase.id,
  caseNumber: guidance.caseNumber,
  checklist: {
    requiredCount: checklist.requiredCount,
    completeCount: checklist.completeCount,
    missingCount: checklist.missingCount,
    visibleFindingCount: checklist.visibleConditionFindings.length
  },
  guidance: guidance.suggestedNextMessage,
  packetId: packet.id,
  route: packetJson.route
}, null, 2));
