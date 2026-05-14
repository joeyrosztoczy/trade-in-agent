import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from '../src/server.js';
import { closePool } from '../src/db.js';
import { API_VERSION, ContractSchemas } from '../src/contracts/index.js';

process.env.CONTRACT_VALIDATE_RESPONSES = '1';
process.env.OPENAI_VISION_MODE = process.env.CONTRACT_TEST_OPENAI_VISION_MODE || 'fixture';
process.env.DEMO_VALUATION_MODE = process.env.CONTRACT_TEST_DEMO_VALUATION_MODE || 'fixture';
process.env.DEMO_VALUATION_ENABLED = process.env.CONTRACT_TEST_DEMO_VALUATION_ENABLED || 'false';

const contractDatabase = prepareContractDatabase();

test('sidecar endpoints honor the versioned contract', { skip: contractDatabase.skip }, async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const health = await request(baseUrl, '/health');
    assertSchema('HealthResponse', health.body);
    assert.equal(health.body.ok, true);

    const invalid = await request(baseUrl, '/trade-cases', {
      method: 'POST',
      body: { createdBy: 42, machine: { unitType: 'combine' } },
      expectedStatus: 400
    });
    assert.equal(invalid.body.code, 'contract_validation_failed');
    assertSchema('ErrorResponse', invalid.body);

    const sourceConversationId = `contract-test-${Date.now()}`;
    const created = await request(baseUrl, '/trade-cases', {
      method: 'POST',
      expectedStatus: 201,
      body: {
        createdBy: 'contract-test',
        sourceConversationId,
        machine: {
          unitType: 'combine',
          make: 'John Deere',
          model: 'S780',
          modelYear: 2021,
          serialOrPin: 'CONTRACT-PIN',
          engineHours: 1200,
          separatorHours: 850
        }
      }
    });
    assertSchema('TradeCaseResponse', created.body);
    assert.match(created.body.caseNumber, /^TIA-/);

    const active = await request(baseUrl, `/trade-cases/active?sourceConversationId=${encodeURIComponent(sourceConversationId)}`);
    assertSchema('ActiveTradeCaseResponse', active.body);
    assert.equal(active.body.id, created.body.id);

    const listed = await request(baseUrl, '/trade-cases');
    assertSchema('ListTradeCasesResponse', listed.body);
    assert.ok(listed.body.items.some(item => item.id === created.body.id));

    const updated = await request(baseUrl, `/trade-cases/${created.body.id}`, {
      method: 'PATCH',
      body: {
        machine: {
          attachmentsOrOptions: 'Contract-test options'
        }
      }
    });
    assertSchema('TradeCaseResponse', updated.body);
    assert.equal(updated.body.machine.attachmentsOrOptions, 'Contract-test options');

    const evidence = await request(baseUrl, `/trade-cases/${created.body.id}/evidence`, {
      method: 'POST',
      expectedStatus: 201,
      body: {
        uploadedBy: 'contract-test',
        mediaType: 'photo',
        storageUri: 'fixtures/media/contract-front-45.jpg',
        originalFileName: 'contract-front-45.jpg',
        contentType: 'image/jpeg',
        sourceMessageId: 'contract-message-1',
        sourceAttachmentId: `contract-front-${Date.now()}`,
        checklistSlot: 'front_45',
        qualityStatus: 'pending',
        analysisStatus: 'pending'
      }
    });
    assertSchema('EvidenceResponse', evidence.body);

    const batch = await request(baseUrl, `/trade-cases/${created.body.id}/evidence/batch`, {
      method: 'POST',
      expectedStatus: 201,
      body: {
        processingMode: 'async',
        items: [
          {
            uploadedBy: 'contract-test',
            mediaType: 'photo',
            storageUri: 'fixtures/media/contract-rear-45.jpg',
            originalFileName: 'contract-rear-45.jpg',
            contentType: 'image/jpeg',
            sourceMessageId: 'contract-message-2',
            sourceAttachmentId: `contract-rear-${Date.now()}`,
            checklistSlot: 'rear_45'
          }
        ]
      }
    });
    assertSchema('EvidenceBatchCreateResponse', batch.body);
    assert.equal(batch.body.registeredCount, 1);
    assert.equal(batch.body.queuedCount, 1);
    assert.match(batch.body.message, new RegExp(batch.body.caseNumber));

    const patchedEvidence = await request(baseUrl, `/trade-cases/${created.body.id}/evidence/${evidence.body.id}`, {
      method: 'PATCH',
      body: {
        notes: 'Contract test visible front 45 evidence'
      }
    });
    assertSchema('EvidenceResponse', patchedEvidence.body);
    assert.equal(patchedEvidence.body.notes, 'Contract test visible front 45 evidence');

    const analysis = await request(baseUrl, `/trade-cases/${created.body.id}/evidence/${evidence.body.id}/analyze`, {
      method: 'POST',
      body: {
        processingMode: 'sync',
        analysisMode: 'field_evidence_quality',
        checklistSlot: 'front_45'
      }
    });
    assertSchema('AnalyzeEvidenceResponse', analysis.body);
    assert.equal(analysis.body.analysis.analysisStatus, 'complete');

    const checklist = await request(baseUrl, `/trade-cases/${created.body.id}/checklist`);
    assertSchema('ChecklistResponse', checklist.body);
    assert.ok(checklist.body.requiredCount > 0);

    const processing = await request(baseUrl, `/trade-cases/${created.body.id}/processing-status`);
    assertSchema('ProcessingStatusResponse', processing.body);
    assert.equal(processing.body.caseNumber, created.body.caseNumber);

    const guidance = await request(baseUrl, `/trade-cases/${created.body.id}/guidance`, { method: 'POST', body: {} });
    assertSchema('GuidanceResponse', guidance.body);
    assert.equal(guidance.body.caseNumber, created.body.caseNumber);
    assert.match(guidance.body.suggestedNextMessage, new RegExp(created.body.caseNumber));

    const routing = await request(baseUrl, `/trade-cases/${created.body.id}/routing`, { method: 'POST', body: {} });
    assertSchema('RoutingResponse', routing.body);
    assert.equal(routing.body.route, guidance.body.route);

    const packet = await request(baseUrl, `/trade-cases/${created.body.id}/packet`, {
      method: 'POST',
      body: {},
      expectedStatus: 201
    });
    assertSchema('PacketResponse', packet.body);
    assert.match(packet.body.markdown, /Trade Evaluation Draft Packet/);

    const archiveViaPost = await request(baseUrl, `/trade-cases/${created.body.id}/archive`, { method: 'POST', body: {} });
    assertSchema('ArchiveResponse', archiveViaPost.body);
    assert.equal(archiveViaPost.body.ok, true);

    const deleteTarget = await request(baseUrl, '/trade-cases', {
      method: 'POST',
      expectedStatus: 201,
      body: {
        createdBy: 'contract-test',
        sourceConversationId: `${sourceConversationId}-delete`,
        machine: { unitType: 'combine' }
      }
    });
    const archiveViaDelete = await request(baseUrl, `/trade-cases/${deleteTarget.body.id}`, { method: 'DELETE' });
    assertSchema('ArchiveResponse', archiveViaDelete.body);
    assert.equal(archiveViaDelete.body.ok, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await closePool();
  }
});

function assertSchema(name, value) {
  const schema = ContractSchemas[name];
  assert.ok(schema, `missing contract schema ${name}`);
  const parsed = schema.safeParse(value);
  assert.equal(parsed.success, true, `${name} did not validate: ${JSON.stringify(parsed.error?.issues || [])}`);
}

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

async function request(baseUrl, path, { method = 'GET', body, expectedStatus = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  assert.equal(response.status, expectedStatus, `${method} ${path} returned ${response.status}: ${text}`);
  return { response, body: parsed };
}

function prepareContractDatabase() {
  const result = spawnSync(process.execPath, ['scripts/migrate.js'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: process.env
  });
  if (result.status !== 0) {
    const message = `contract database unavailable; migrations failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
    if (process.env.CONTRACT_TEST_REQUIRED === '1' || process.env.CONTRACT_TEST_REQUIRED === 'true') {
      throw new Error(message);
    }
    return { skip: message };
  }
  return { skip: false };
}

test('contract metadata exposes the expected API version', () => {
  assert.equal(API_VERSION, 'trade-in-sidecar/v1');
});
