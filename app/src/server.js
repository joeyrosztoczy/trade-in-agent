import http from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  addEvidence,
  addEvidenceBatch,
  analyzeEvidence,
  archiveTradeCase,
  createTradeCase,
  generatePacket,
  generateGuidance,
  getActiveTradeCase,
  getChecklistStatus,
  getProcessingStatus,
  getReviewCase,
  getRoutingStatus,
  getTradeCase,
  healthCheck,
  listReviewCases,
  listTradeCases,
  recordReviewAction,
  updateEvidence,
  updateTradeCase
} from './repository.js';
import { closePool } from './db.js';
import { API_VERSION, ContractSchemas } from './contracts/index.js';
import { validateRequestBody, validateResponseBody } from './http/validation.js';

const PORT = Number(process.env.PORT || 8788);
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ALLOW_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};

function send(res, status, body, headers = {}, responseSchema = null) {
  const responseBody = typeof body === 'string' ? body : validateResponseBody(responseSchema, body);
  const payload = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody, null, 2);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
    ...headers
  });
  res.end(payload);
}

async function readContractJson(req, schema) {
  return validateRequestBody(schema, await readJson(req));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2_000_000) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
  }
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Request body must be valid JSON');
    error.statusCode = 400;
    throw error;
  }
}

function routeParts(url) {
  return url.pathname.split('/').filter(Boolean);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const requestId = randomUUID();
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const parts = routeParts(url);

      if (req.method === 'OPTIONS') {
        return send(res, 204, '');
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        const health = await healthCheck();
        return send(res, 200, { ...health, apiVersion: API_VERSION, service: 'trade-in-agent-sidecar', requestId }, {}, ContractSchemas.HealthResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 1 && req.method === 'POST') {
        return send(res, 201, await createTradeCase(await readContractJson(req, ContractSchemas.CreateTradeCaseRequest)), {}, ContractSchemas.TradeCaseResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 1 && req.method === 'GET') {
        return send(res, 200, { items: await listTradeCases({ includeArchived: url.searchParams.get('includeArchived') === 'true' }) }, {}, ContractSchemas.ListTradeCasesResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 2 && parts[1] === 'active' && req.method === 'GET') {
        const sourceConversationId = url.searchParams.get('sourceConversationId');
        if (!sourceConversationId) return send(res, 400, { error: 'sourceConversationId is required', requestId });
        const tradeCase = await getActiveTradeCase(sourceConversationId);
        if (!tradeCase) return send(res, 404, { error: 'Active trade case not found', requestId });
        return send(res, 200, tradeCase, {}, ContractSchemas.ActiveTradeCaseResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 2 && req.method === 'GET') {
        const tradeCase = await getTradeCase(parts[1]);
        if (!tradeCase) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, tradeCase, {}, ContractSchemas.TradeCaseResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 2 && req.method === 'PATCH') {
        const tradeCase = await updateTradeCase(parts[1], await readContractJson(req, ContractSchemas.UpdateTradeCaseRequest));
        if (!tradeCase) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, tradeCase, {}, ContractSchemas.TradeCaseResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 2 && req.method === 'DELETE') {
        const archived = await archiveTradeCase(parts[1]);
        if (!archived) return send(res, 404, { error: 'Trade case not found or already archived', requestId });
        return send(res, 200, { ok: true, id: archived.id, archivedAt: archived.archived_at }, {}, ContractSchemas.ArchiveResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'archive' && req.method === 'POST') {
        const archived = await archiveTradeCase(parts[1]);
        if (!archived) return send(res, 404, { error: 'Trade case not found or already archived', requestId });
        return send(res, 200, { ok: true, id: archived.id, archivedAt: archived.archived_at }, {}, ContractSchemas.ArchiveResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'evidence' && req.method === 'POST') {
        const evidence = await addEvidence(parts[1], await readContractJson(req, ContractSchemas.EvidenceCreateRequest));
        if (!evidence) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 201, evidence, {}, ContractSchemas.EvidenceResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 4 && parts[2] === 'evidence' && parts[3] === 'batch' && req.method === 'POST') {
        const evidence = await addEvidenceBatch(parts[1], await readContractJson(req, ContractSchemas.EvidenceBatchCreateRequest));
        if (!evidence) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 201, evidence, {}, ContractSchemas.EvidenceBatchCreateResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 4 && parts[2] === 'evidence' && req.method === 'PATCH') {
        const evidence = await updateEvidence(parts[1], parts[3], await readContractJson(req, ContractSchemas.EvidenceUpdateRequest));
        if (!evidence) return send(res, 404, { error: 'Evidence item not found', requestId });
        return send(res, 200, evidence, {}, ContractSchemas.EvidenceResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 5 && parts[2] === 'evidence' && parts[4] === 'analyze' && req.method === 'POST') {
        const analysis = await analyzeEvidence(parts[1], parts[3], await readContractJson(req, ContractSchemas.AnalyzeEvidenceRequest));
        if (!analysis) return send(res, 404, { error: 'Trade case or evidence item not found', requestId });
        return send(res, 200, analysis, {}, ContractSchemas.AnalyzeEvidenceResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'checklist' && req.method === 'GET') {
        const checklist = await getChecklistStatus(parts[1]);
        if (!checklist) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, checklist, {}, ContractSchemas.ChecklistResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'processing-status' && req.method === 'GET') {
        const status = await getProcessingStatus(parts[1]);
        if (!status) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, status, {}, ContractSchemas.ProcessingStatusResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'guidance' && req.method === 'POST') {
        const guidance = await generateGuidance(parts[1]);
        if (!guidance) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, guidance, {}, ContractSchemas.GuidanceResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'routing' && req.method === 'POST') {
        const routing = await getRoutingStatus(parts[1]);
        if (!routing) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, routing, {}, ContractSchemas.RoutingResponse);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'packet' && req.method === 'POST') {
        const packet = await generatePacket(parts[1]);
        if (!packet) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 201, packet, {}, ContractSchemas.PacketResponse);
      }

      if (parts[0] === 'review' && parts.length === 2 && parts[1] === 'cases' && req.method === 'GET') {
        const reviewCases = await listReviewCases({
          includeArchived: url.searchParams.get('includeArchived') === 'true',
          limit: url.searchParams.get('limit') || 100
        });
        return send(res, 200, reviewCases, {}, ContractSchemas.ReviewQueueResponse);
      }

      if (parts[0] === 'review' && parts.length === 3 && parts[1] === 'cases' && req.method === 'GET') {
        const reviewCase = await getReviewCase(parts[2]);
        if (!reviewCase) return send(res, 404, { error: 'Review case not found', requestId });
        return send(res, 200, reviewCase, {}, ContractSchemas.ReviewCaseDetailResponse);
      }

      if (parts[0] === 'review' && parts.length === 4 && parts[1] === 'cases' && parts[3] === 'actions' && req.method === 'POST') {
        const reviewCase = await recordReviewAction(parts[2], await readContractJson(req, ContractSchemas.ReviewActionRequest));
        if (!reviewCase) return send(res, 404, { error: 'Review case not found', requestId });
        return send(res, 201, { ok: true, case: reviewCase }, {}, ContractSchemas.ReviewActionResponse);
      }

      return send(res, 404, { error: 'Not found', requestId });
    } catch (error) {
      const status = error.statusCode || 500;
      return send(res, status, {
        error: error.message || String(error),
        code: error.code,
        issues: error.issues,
        requestId
      });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`trade-in-agent-sidecar listening on http://0.0.0.0:${PORT}`);
  });

  process.on('SIGTERM', async () => {
    server.close();
    await closePool();
    process.exit(0);
  });
}
