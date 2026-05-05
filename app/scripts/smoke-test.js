const baseUrl = process.env.SIDECAR_URL || 'http://127.0.0.1:8788';

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

await request(`/trade-cases/${tradeCase.id}/evidence`, {
  method: 'POST',
  body: JSON.stringify({
    uploadedBy: 'smoke-test',
    mediaType: 'photo',
    storageUri: 'fixtures/media/front-45-placeholder.jpg',
    checklistSlot: 'front_45',
    qualityStatus: 'accepted',
    analysisStatus: 'pending',
    notes: 'Smoke test evidence'
  })
});

const checklist = await request(`/trade-cases/${tradeCase.id}/checklist`);
if (checklist.requiredCount <= 0) throw new Error('Checklist did not include required slots');
if (!checklist.missingSlots.includes('rear_45')) throw new Error('Checklist did not report expected missing slot');

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
  checklist: {
    requiredCount: checklist.requiredCount,
    completeCount: checklist.completeCount,
    missingCount: checklist.missingCount
  },
  packetId: packet.id,
  route: packetJson.route
}, null, 2));
