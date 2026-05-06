const baseUrl = process.env.SIDECAR_URL || 'http://127.0.0.1:8788';
const liveSmokeImageUrl = process.env.OPENAI_VISION_SMOKE_IMAGE_URL || 'https://photos.machinefinder.com/96/11033496/73087499_large_48294.jpg';
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
if (guidance.route !== 'needs_more_evidence') throw new Error(`Expected field collection route, got ${guidance.route}`);
if (!guidance.nextEvidenceRequests.length) throw new Error('Guidance did not include targeted next evidence requests');
if (!guidance.reviewStatus) throw new Error('Guidance did not include review status');

const routing = await request(`/trade-cases/${tradeCase.id}/routing`, { method: 'POST', body: '{}' });
if (routing.route !== guidance.route) throw new Error('Routing endpoint disagreed with guidance route');
if (!Array.isArray(routing.riskFlags)) throw new Error('Routing endpoint did not include risk flags');

const packet = await request(`/trade-cases/${tradeCase.id}/packet`, { method: 'POST', body: '{}' });
const packetJson = packet.packet;
for (const key of ['machine', 'evidenceCompleteness', 'route', 'reviewStatus', 'riskFlags', 'recommendation']) {
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
  route: packetJson.route,
  reviewStatus: packetJson.reviewStatus,
  confidence: packetJson.confidence,
  nextEvidenceRequests: guidance.nextEvidenceRequests
}, null, 2));
