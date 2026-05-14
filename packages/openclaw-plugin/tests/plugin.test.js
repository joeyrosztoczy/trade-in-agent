import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../src/index.js';

test('plugin exposes trade-in sidecar metadata', () => {
  assert.equal(plugin.id, 'trade-in-agent');
  assert.match(plugin.description, /trade-in-sidecar\/v1/);
});

test('plugin exposes a first-class async field upload tool', () => {
  const tools = collectTools();
  const names = tools.map(tool => tool.name);

  assert.ok(names.includes('trade_case_register_field_uploads'));
  assert.ok(names.includes('trade_in_register_field_uploads'));

  const addEvidence = tools.find(tool => tool.name === 'trade_case_add_evidence');
  assert.ok(addEvidence);
  assert.equal(addEvidence.parameters.properties.processingMode, undefined);

  const start = tools.find(tool => tool.name === 'trade_case_start');
  assert.ok(start);
  assert.equal(start.parameters.properties.processingMode, undefined);
  assert.equal(start.parameters.properties.analysisMode, undefined);

  const analyze = tools.find(tool => tool.name === 'trade_case_analyze_evidence');
  assert.ok(analyze);
  assert.ok(analyze.parameters.properties.allowSynchronousAnalysis);
});

test('plugin queues field evidence and demotes analysis to async by default', async () => {
  const tools = collectTools();
  const addEvidence = tools.find(tool => tool.name === 'trade_case_add_evidence');
  const analyze = tools.find(tool => tool.name === 'trade_case_analyze_evidence');
  const requests = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const request = {
      url: String(url),
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : undefined
    };
    requests.push(request);

    let payload = { ok: true };
    if (request.url.includes('/evidence/batch')) {
      payload = {
        tradeCaseId: 'case-1',
        caseNumber: 'TIA-ASYNC',
        items: [],
        registeredCount: 1,
        queuedCount: 1,
        jobs: [],
        processingSummary: {},
        nextEvidenceRequests: [],
        message: 'Trade case TIA-ASYNC: 1 upload is processing.'
      };
    } else if (request.url.includes('/analyze')) {
      payload = {
        tradeCaseId: 'case-1',
        caseNumber: 'TIA-ASYNC',
        evidenceId: 'evidence-1',
        jobId: 'job-1',
        analysisStatus: request.body?.processingMode === 'sync' ? 'complete' : 'queued',
        job: { id: 'job-1', status: request.body?.processingMode === 'sync' ? 'succeeded' : 'queued' },
        processingSummary: {}
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload)
    };
  };

  try {
    await addEvidence.execute('call-1', {
      tradeCaseId: 'case-1',
      processingMode: 'sync',
      items: [{ mediaType: 'photo', storageUri: '/tmp/front.jpg' }]
    });
    assert.equal(requests.at(-1).body.processingMode, 'async');

    await analyze.execute('call-2', {
      tradeCaseId: 'case-1',
      evidenceId: 'evidence-1',
      processingMode: 'sync'
    });
    assert.equal(requests.at(-1).body.processingMode, 'async');
    assert.equal(requests.at(-1).body.async, true);
    assert.equal(requests.at(-1).body.queue, true);

    await analyze.execute('call-3', {
      tradeCaseId: 'case-1',
      evidenceId: 'evidence-1',
      processingMode: 'sync',
      allowSynchronousAnalysis: true
    });
    assert.equal(requests.at(-1).body.processingMode, 'sync');
    assert.equal(requests.at(-1).body.async, undefined);
    assert.equal(requests.at(-1).body.queue, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function collectTools() {
  const tools = [];
  const ctx = {
    deliveryContext: { to: 'teams:conversation' },
    requesterSenderId: 'user-1',
    sessionKey: 'session-1'
  };
  const api = {
    registerTool(definition) {
      tools.push(typeof definition === 'function' ? definition(ctx) : definition);
    }
  };

  plugin.register(api);
  return tools;
}
