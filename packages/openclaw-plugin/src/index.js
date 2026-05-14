const API_VERSION = 'trade-in-sidecar/v1';
const DEFAULT_BASE_URL = 'http://127.0.0.1:8788';
const DEFAULT_TIMEOUT_MS = 240_000;

const Type = {
  Object(properties = {}, options = {}) {
    return { type: 'object', properties, ...options };
  },
  String(options = {}) {
    return { type: 'string', ...options };
  },
  Number(options = {}) {
    return { type: 'number', ...options };
  },
  Boolean(options = {}) {
    return { type: 'boolean', ...options };
  },
  Array(items, options = {}) {
    return { type: 'array', items, ...options };
  },
  Optional(schema) {
    return schema;
  }
};

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getPluginConfig(api) {
  const pluginConfig = api?.pluginConfig;
  if (pluginConfig && typeof pluginConfig === 'object' && !Array.isArray(pluginConfig)) return pluginConfig;
  const configEntry = api?.config?.plugins?.entries?.['trade-in-agent']?.config;
  if (configEntry && typeof configEntry === 'object' && !Array.isArray(configEntry)) return configEntry;
  return {};
}

function getBaseUrl(api) {
  return (
    safeString(getPluginConfig(api).baseUrl) ||
    safeString(process.env.TRADE_IN_SIDECAR_URL) ||
    safeString(process.env.TRADE_IN_AGENT_BASE_URL) ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, '');
}

function getTimeoutMs(api) {
  const candidate = Number(getPluginConfig(api).timeoutMs ?? process.env.TRADE_IN_TIMEOUT_MS ?? process.env.TRADE_IN_AGENT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : DEFAULT_TIMEOUT_MS;
}

function textResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function pickDefined(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

async function sidecarRequest(api, route, { method = 'GET', body, allowNotFound = false, contractKind } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getTimeoutMs(api));
  let response;
  let text;

  try {
    response = await fetch(`${getBaseUrl(api)}${route.startsWith('/') ? route : `/${route}`}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Trade-in sidecar request timed out after ${getTimeoutMs(api)}ms: ${method} ${route}`);
    }
    throw new Error(`Trade-in sidecar request failed: ${method} ${route}: ${error?.message || String(error)}`);
  } finally {
    clearTimeout(timer);
  }

  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { text };
  }

  if (!response.ok) {
    if (allowNotFound && response.status === 404) {
      return { found: false, status: response.status, error: payload?.error || 'not_found' };
    }
    throw new Error(`Trade-in sidecar ${method} ${route} failed (${response.status}): ${payload?.error || text || response.statusText}`);
  }

  validateMinimalContract(contractKind, payload);
  return payload;
}

function validateMinimalContract(kind, payload) {
  const enabled = process.env.TRADE_IN_VALIDATE_CONTRACT === '1' ||
    process.env.TRADE_IN_VALIDATE_CONTRACT === 'true' ||
    process.env.NODE_ENV === 'test';
  if (!enabled || !kind) return;
  if (kind === 'case' && (!payload?.id || !payload?.caseNumber)) {
    throw new Error('Trade-in sidecar response contract failed: case id and caseNumber are required.');
  }
  if (kind === 'guidance' && (!payload?.caseNumber || !payload?.suggestedNextMessage)) {
    throw new Error('Trade-in sidecar response contract failed: guidance caseNumber and suggestedNextMessage are required.');
  }
  if (kind === 'packet' && (!payload?.caseNumber || !payload?.markdown)) {
    throw new Error('Trade-in sidecar response contract failed: packet caseNumber and markdown are required.');
  }
}

function resolveSourceConversationId(ctx, params = {}) {
  return safeString(params.sourceConversationId) ||
    safeString(ctx?.deliveryContext?.to) ||
    safeString(ctx?.sessionKey);
}

function resolveCreatedBy(ctx, params = {}) {
  return safeString(params.createdBy) ||
    (safeString(ctx?.requesterSenderId) ? `teams:${safeString(ctx.requesterSenderId)}` : '') ||
    safeString(ctx?.agentId) ||
    'openclaw';
}

function machineParameters() {
  return Type.Object({
    unitType: Type.Optional(Type.String({ description: 'Equipment type, for example combine or high_hp_tractor.' })),
    make: Type.Optional(Type.String()),
    model: Type.Optional(Type.String()),
    modelYear: Type.Optional(Type.Number()),
    serialOrPin: Type.Optional(Type.String()),
    engineHours: Type.Optional(Type.Number()),
    separatorHours: Type.Optional(Type.Number()),
    location: Type.Optional(Type.String()),
    attachmentsOrOptions: Type.Optional(Type.String())
  }, { additionalProperties: false });
}

function evidenceItemParameters() {
  return Type.Object({
    uploadedBy: Type.Optional(Type.String()),
    mediaType: Type.Optional(Type.String({ description: 'photo, video, document, field_note, or file.' })),
    storageUri: Type.Optional(Type.String({ description: 'OpenClaw managed media path, local path, allowed URL, or durable media reference.' })),
    checklistSlot: Type.Optional(Type.String({ description: 'Checklist slot such as front_45, rear_45, serial_plate, cab_display_hours, or startup_video.' })),
    qualityStatus: Type.Optional(Type.String()),
    analysisStatus: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
    originalFileName: Type.Optional(Type.String()),
    contentType: Type.Optional(Type.String()),
    sourceMessageId: Type.Optional(Type.String()),
    sourceAttachmentId: Type.Optional(Type.String()),
    checklistSlotConfidence: Type.Optional(Type.Number()),
    metadata: Type.Optional(Type.Object({}, { additionalProperties: true }))
  }, { additionalProperties: false });
}

function caseParameters() {
  return {
    createdBy: Type.Optional(Type.String()),
    sourceConversationId: Type.Optional(Type.String({ description: 'Teams conversation id. Defaults to the current Teams target when available.' })),
    status: Type.Optional(Type.String()),
    route: Type.Optional(Type.String()),
    confidence: Type.Optional(Type.Number()),
    assignedReviewer: Type.Optional(Type.String()),
    machine: Type.Optional(machineParameters())
  };
}

function analysisParameters() {
  return {
    analysisMode: Type.Optional(Type.String()),
    checklistSlot: Type.Optional(Type.String()),
    processingMode: Type.Optional(Type.String({ description: 'Use sync only with allowSynchronousAnalysis for internal/dev QA. Teams field uploads queue async by default.' })),
    async: Type.Optional(Type.Boolean()),
    queue: Type.Optional(Type.Boolean()),
    allowSynchronousAnalysis: Type.Optional(Type.Boolean({ description: 'Internal/dev override. Set true with processingMode sync only when a turn must wait for one evidence item.' })),
    model: Type.Optional(Type.String()),
    openaiModel: Type.Optional(Type.String()),
    escalate: Type.Optional(Type.Boolean()),
    useReviewModel: Type.Optional(Type.Boolean()),
    highRisk: Type.Optional(Type.Boolean()),
    machineContext: Type.Optional(machineParameters()),
    media: Type.Optional(Type.Array(evidenceItemParameters())),
    sampledFrames: Type.Optional(Type.Array(Type.Object({
      storageUri: Type.String(),
      contentType: Type.Optional(Type.String()),
      sourceVideoUri: Type.Optional(Type.String())
    }, { additionalProperties: false })))
  };
}

function createPayload(ctx, params = {}) {
  return pickDefined({
    createdBy: resolveCreatedBy(ctx, params),
    sourceConversationId: resolveSourceConversationId(ctx, params) || null,
    status: params.status,
    route: params.route,
    confidence: params.confidence,
    assignedReviewer: params.assignedReviewer,
    machine: pickDefined(params.machine || { unitType: 'combine' })
  });
}

async function openOrCreateTradeCase(api, ctx, params = {}, { forceNew = false } = {}) {
  const sourceConversationId = resolveSourceConversationId(ctx, params);
  let tradeCase = null;
  let action = 'created';

  if (params.tradeCaseId) {
    tradeCase = await sidecarRequest(api, `/trade-cases/${encodeURIComponent(params.tradeCaseId)}`, {
      contractKind: 'case'
    });
    return { tradeCase, action: 'resumed', sourceConversationId };
  }

  if (!forceNew && sourceConversationId) {
    const active = await sidecarRequest(api, `/trade-cases/active?sourceConversationId=${encodeURIComponent(sourceConversationId)}`, {
      allowNotFound: true,
      contractKind: 'case'
    });
    if (active?.found !== false) {
      tradeCase = active;
      action = 'resumed';
    }
  }

  if (!tradeCase) {
    tradeCase = await sidecarRequest(api, '/trade-cases', {
      method: 'POST',
      body: createPayload(ctx, { ...params, sourceConversationId }),
      contractKind: 'case'
    });
  }

  return { tradeCase, action, sourceConversationId };
}

function fieldUploadReply({ action, tradeCase, registeredEvidence, guidance }) {
  const caseNumber = tradeCase?.caseNumber || registeredEvidence?.caseNumber || guidance?.caseNumber;
  const message = registeredEvidence?.message ||
    guidance?.suggestedNextMessage ||
    (caseNumber ? `Trade case ${caseNumber} is open. I have started processing the uploaded evidence.` : 'I have started processing the uploaded evidence.');

  return {
    ok: true,
    apiVersion: API_VERSION,
    action,
    tradeCase,
    registeredEvidence,
    guidance,
    fieldReply: {
      caseNumber,
      id: tradeCase?.id,
      message,
      mustReplyNow: true,
      doNotAnalyzeInThisTurn: true,
      nextTool: 'trade_case_processing_status'
    }
  };
}

function registerContextualTool(api, names, definitionFactory) {
  for (const name of names) {
    api.registerTool(ctx => ({ ...definitionFactory(ctx, name), name }), { name });
  }
}

function registerStaticTool(api, names, definitionFactory) {
  for (const name of names) {
    api.registerTool({ ...definitionFactory(name), name });
  }
}

export default {
  id: 'trade-in-agent',
  name: 'Trade-In Agent',
  description: `Stable tools for the ${API_VERSION} Trade-In Agent sidecar contract.`,
  register(api) {
    registerStaticTool(api, ['trade_case_health', 'trade_in_health'], name => ({
      description: 'Check whether the local Trade-In Agent sidecar and database are healthy.',
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        return textResult(await sidecarRequest(api, '/health'));
      }
    }));

    registerContextualTool(api, ['trade_case_start', 'trade_in_start_or_resume', 'trade_in_start_case'], (ctx, name) => ({
      description: 'Create or resume a durable trade-in case and return guidance. If evidence is supplied, register it async and reply without waiting for visual inference.',
      parameters: Type.Object({
        ...caseParameters(),
        evidenceItems: Type.Optional(Type.Array(evidenceItemParameters()))
      }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        const { tradeCase, action } = await openOrCreateTradeCase(api, ctx, params, {
          forceNew: name === 'trade_in_start_case'
        });

        let registeredEvidence = null;
        const evidenceItems = Array.isArray(params.evidenceItems) ? params.evidenceItems : [];
        if (evidenceItems.length) {
          registeredEvidence = await sidecarRequest(api, `/trade-cases/${encodeURIComponent(tradeCase.id)}/evidence/batch`, {
            method: 'POST',
            body: pickDefined({
              processingMode: 'async',
              items: evidenceItems.map(pickDefined)
            })
          });
        }

        const guidance = await sidecarRequest(api, `/trade-cases/${encodeURIComponent(tradeCase.id)}/guidance`, {
          method: 'POST',
          contractKind: 'guidance'
        });

        return textResult({
          ok: true,
          apiVersion: API_VERSION,
          action,
          tradeCase,
          registeredEvidence,
          fieldReply: registeredEvidence ? fieldUploadReply({ action, tradeCase, registeredEvidence, guidance }).fieldReply : undefined,
          guidance
        });
      }
    }));

    registerContextualTool(api, ['trade_case_active', 'trade_in_get_active_case'], ctx => ({
      description: 'Get the active trade-in case for the current or supplied Teams conversation.',
      parameters: Type.Object({
        sourceConversationId: Type.Optional(Type.String())
      }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        const sourceConversationId = resolveSourceConversationId(ctx, params);
        if (!sourceConversationId) throw new Error('sourceConversationId is required when the Teams conversation id is unavailable.');
        return textResult(await sidecarRequest(api, `/trade-cases/active?sourceConversationId=${encodeURIComponent(sourceConversationId)}`, {
          allowNotFound: true,
          contractKind: 'case'
        }));
      }
    }));

    registerStaticTool(api, ['trade_case_get', 'trade_in_get_case'], () => ({
      description: 'Get a trade-in case by id.',
      parameters: Type.Object({ tradeCaseId: Type.String() }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        return textResult(await sidecarRequest(api, `/trade-cases/${encodeURIComponent(params.tradeCaseId)}`, { contractKind: 'case' }));
      }
    }));

    registerStaticTool(api, ['trade_case_update', 'trade_in_update_case'], () => ({
      description: 'Update trade-in case metadata or machine details.',
      parameters: Type.Object({
        tradeCaseId: Type.String(),
        ...caseParameters(),
        reviewStatus: Type.Optional(Type.String()),
        reviewNotes: Type.Optional(Type.String()),
        routeReason: Type.Optional(Type.String())
      }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        const { tradeCaseId, ...body } = params;
        return textResult(await sidecarRequest(api, `/trade-cases/${encodeURIComponent(tradeCaseId)}`, {
          method: 'PATCH',
          body: pickDefined(body),
          contractKind: 'case'
        }));
      }
    }));

    registerContextualTool(api, ['trade_case_register_field_uploads', 'trade_in_register_field_uploads'], ctx => ({
      description: 'Primary Teams field-upload tool: create/resume the trade case if needed, register all uploaded photos/videos async, and return the immediate sales-rep acknowledgement. Do not call analysis in the same turn.',
      parameters: Type.Object({
        tradeCaseId: Type.Optional(Type.String()),
        ...caseParameters(),
        items: Type.Array(evidenceItemParameters())
      }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        const items = Array.isArray(params.items) ? params.items : [];
        if (!items.length) throw new Error('items is required for trade_case_register_field_uploads.');

        const { tradeCase, action } = await openOrCreateTradeCase(api, ctx, params);
        const registeredEvidence = await sidecarRequest(api, `/trade-cases/${encodeURIComponent(tradeCase.id)}/evidence/batch`, {
          method: 'POST',
          body: {
            processingMode: 'async',
            items: items.map(pickDefined)
          }
        });
        const guidance = await sidecarRequest(api, `/trade-cases/${encodeURIComponent(tradeCase.id)}/guidance`, {
          method: 'POST',
          contractKind: 'guidance'
        });

        return textResult(fieldUploadReply({ action, tradeCase, registeredEvidence, guidance }));
      }
    }));

    registerStaticTool(api, ['trade_case_add_evidence', 'trade_in_register_evidence'], () => ({
      description: 'Register Teams attachments, OpenClaw media paths, URLs, or notes as trade-in evidence. Always queues async processing for field uploads and returns immediately.',
      parameters: Type.Object({
        tradeCaseId: Type.String(),
        items: Type.Array(evidenceItemParameters())
      }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        return textResult(await sidecarRequest(api, `/trade-cases/${encodeURIComponent(params.tradeCaseId)}/evidence/batch`, {
          method: 'POST',
          body: {
            processingMode: 'async',
            items: (params.items || []).map(pickDefined)
          }
        }));
      }
    }));

    registerStaticTool(api, ['trade_case_analyze_evidence', 'trade_in_analyze_evidence'], () => ({
      description: 'Internal/reviewer tool for one evidence item. Queues async by default; only waits for sync analysis when allowSynchronousAnalysis is true and processingMode is sync. Do not use after normal Teams uploads.',
      parameters: Type.Object({
        tradeCaseId: Type.String(),
        evidenceId: Type.String(),
        ...analysisParameters()
      }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        const {
          tradeCaseId,
          evidenceId,
          allowSynchronousAnalysis,
          processingMode,
          processing_mode: processingModeSnake,
          async: _async,
          queue: _queue,
          ...body
        } = params;
        const requestedMode = String(processingMode || processingModeSnake || '').toLowerCase();
        const requestBody = allowSynchronousAnalysis === true && requestedMode === 'sync'
          ? pickDefined({ ...body, processingMode: 'sync' })
          : pickDefined({ ...body, processingMode: 'async', async: true, queue: true });
        return textResult(await sidecarRequest(api, `/trade-cases/${encodeURIComponent(tradeCaseId)}/evidence/${encodeURIComponent(evidenceId)}/analyze`, {
          method: 'POST',
          body: requestBody
        }));
      }
    }));

    registerStaticTool(api, ['trade_case_checklist', 'trade_in_get_checklist'], () => ({
      description: 'Get evidence checklist completeness and evidence findings.',
      parameters: Type.Object({ tradeCaseId: Type.String() }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        return textResult(await sidecarRequest(api, `/trade-cases/${encodeURIComponent(params.tradeCaseId)}/checklist`));
      }
    }));

    registerStaticTool(api, ['trade_case_processing_status', 'trade_in_processing_status'], () => ({
      description: 'Get async evidence processing status for a trade-in case.',
      parameters: Type.Object({ tradeCaseId: Type.String() }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        return textResult(await sidecarRequest(api, `/trade-cases/${encodeURIComponent(params.tradeCaseId)}/processing-status`));
      }
    }));

    registerStaticTool(api, ['trade_case_guidance', 'trade_in_get_guidance'], () => ({
      description: 'Get case-aware next-step guidance for a sales rep in the field.',
      parameters: Type.Object({ tradeCaseId: Type.String() }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        return textResult(await sidecarRequest(api, `/trade-cases/${encodeURIComponent(params.tradeCaseId)}/guidance`, {
          method: 'POST',
          contractKind: 'guidance'
        }));
      }
    }));

    registerStaticTool(api, ['trade_case_routing'], () => ({
      description: 'Compute and persist review routing for a trade-in case.',
      parameters: Type.Object({ tradeCaseId: Type.String() }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        return textResult(await sidecarRequest(api, `/trade-cases/${encodeURIComponent(params.tradeCaseId)}/routing`, { method: 'POST' }));
      }
    }));

    registerStaticTool(api, ['trade_case_packet', 'trade_in_generate_packet'], () => ({
      description: 'Generate a draft reviewer handoff packet for a trade-in case.',
      parameters: Type.Object({ tradeCaseId: Type.String() }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        return textResult(await sidecarRequest(api, `/trade-cases/${encodeURIComponent(params.tradeCaseId)}/packet`, {
          method: 'POST',
          contractKind: 'packet'
        }));
      }
    }));

    registerStaticTool(api, ['trade_case_archive', 'trade_in_archive_case'], () => ({
      description: 'Archive a trade-in case when explicitly requested or during QA cleanup.',
      parameters: Type.Object({ tradeCaseId: Type.String() }, { additionalProperties: false }),
      async execute(_id, params = {}) {
        return textResult(await sidecarRequest(api, `/trade-cases/${encodeURIComponent(params.tradeCaseId)}/archive`, { method: 'POST' }));
      }
    }));
  }
};
