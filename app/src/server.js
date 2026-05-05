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
  getRoutingStatus,
  getTradeCase,
  healthCheck,
  listTradeCases,
  updateEvidence,
  updateTradeCase
} from './repository.js';
import { closePool } from './db.js';

const PORT = Number(process.env.PORT || 8788);

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(payload);
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

      if (req.method === 'GET' && url.pathname === '/health') {
        const health = await healthCheck();
        return send(res, 200, { ...health, service: 'trade-in-agent-sidecar', requestId });
      }

      if (parts[0] === 'trade-cases' && parts.length === 1 && req.method === 'POST') {
        return send(res, 201, await createTradeCase(await readJson(req)));
      }

      if (parts[0] === 'trade-cases' && parts.length === 1 && req.method === 'GET') {
        return send(res, 200, { items: await listTradeCases({ includeArchived: url.searchParams.get('includeArchived') === 'true' }) });
      }

      if (parts[0] === 'trade-cases' && parts.length === 2 && parts[1] === 'active' && req.method === 'GET') {
        const sourceConversationId = url.searchParams.get('sourceConversationId');
        if (!sourceConversationId) return send(res, 400, { error: 'sourceConversationId is required', requestId });
        const tradeCase = await getActiveTradeCase(sourceConversationId);
        if (!tradeCase) return send(res, 404, { error: 'Active trade case not found', requestId });
        return send(res, 200, tradeCase);
      }

      if (parts[0] === 'trade-cases' && parts.length === 2 && req.method === 'GET') {
        const tradeCase = await getTradeCase(parts[1]);
        if (!tradeCase) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, tradeCase);
      }

      if (parts[0] === 'trade-cases' && parts.length === 2 && req.method === 'PATCH') {
        const tradeCase = await updateTradeCase(parts[1], await readJson(req));
        if (!tradeCase) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, tradeCase);
      }

      if (parts[0] === 'trade-cases' && parts.length === 2 && req.method === 'DELETE') {
        const archived = await archiveTradeCase(parts[1]);
        if (!archived) return send(res, 404, { error: 'Trade case not found or already archived', requestId });
        return send(res, 200, { ok: true, id: archived.id, archivedAt: archived.archived_at });
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'archive' && req.method === 'POST') {
        const archived = await archiveTradeCase(parts[1]);
        if (!archived) return send(res, 404, { error: 'Trade case not found or already archived', requestId });
        return send(res, 200, { ok: true, id: archived.id, archivedAt: archived.archived_at });
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'evidence' && req.method === 'POST') {
        const evidence = await addEvidence(parts[1], await readJson(req));
        if (!evidence) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 201, evidence);
      }

      if (parts[0] === 'trade-cases' && parts.length === 4 && parts[2] === 'evidence' && parts[3] === 'batch' && req.method === 'POST') {
        const evidence = await addEvidenceBatch(parts[1], await readJson(req));
        if (!evidence) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 201, evidence);
      }

      if (parts[0] === 'trade-cases' && parts.length === 4 && parts[2] === 'evidence' && req.method === 'PATCH') {
        const evidence = await updateEvidence(parts[1], parts[3], await readJson(req));
        if (!evidence) return send(res, 404, { error: 'Evidence item not found', requestId });
        return send(res, 200, evidence);
      }

      if (parts[0] === 'trade-cases' && parts.length === 5 && parts[2] === 'evidence' && parts[4] === 'analyze' && req.method === 'POST') {
        const analysis = await analyzeEvidence(parts[1], parts[3], await readJson(req));
        if (!analysis) return send(res, 404, { error: 'Trade case or evidence item not found', requestId });
        return send(res, 200, analysis);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'checklist' && req.method === 'GET') {
        const checklist = await getChecklistStatus(parts[1]);
        if (!checklist) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, checklist);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'guidance' && req.method === 'POST') {
        const guidance = await generateGuidance(parts[1]);
        if (!guidance) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, guidance);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'routing' && req.method === 'POST') {
        const routing = await getRoutingStatus(parts[1]);
        if (!routing) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 200, routing);
      }

      if (parts[0] === 'trade-cases' && parts.length === 3 && parts[2] === 'packet' && req.method === 'POST') {
        const packet = await generatePacket(parts[1]);
        if (!packet) return send(res, 404, { error: 'Trade case not found', requestId });
        return send(res, 201, packet);
      }

      return send(res, 404, { error: 'Not found', requestId });
    } catch (error) {
      const status = error.statusCode || 500;
      return send(res, status, { error: error.message || String(error), requestId });
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
