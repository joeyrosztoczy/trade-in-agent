import { API_VERSION } from './enums.js';
import { ContractSchemas } from './schemas.js';

export const endpointContracts = [
  {
    operationId: 'trade_in_health',
    stableToolName: 'trade_case_health',
    legacyToolName: 'trade_in_health',
    method: 'GET',
    path: '/health',
    summary: 'Check sidecar and database health.',
    responseSchema: 'HealthResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_start_case',
    stableToolName: 'trade_case_start',
    legacyToolName: 'trade_in_start_case',
    method: 'POST',
    path: '/trade-cases',
    summary: 'Create a durable trade-in case.',
    requestSchema: 'CreateTradeCaseRequest',
    responseSchema: 'TradeCaseResponse',
    successStatus: 201
  },
  {
    operationId: 'trade_in_list_cases',
    stableToolName: 'trade_case_list',
    legacyToolName: null,
    method: 'GET',
    path: '/trade-cases',
    summary: 'List trade-in cases.',
    responseSchema: 'ListTradeCasesResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_get_active_case',
    stableToolName: 'trade_case_active',
    legacyToolName: 'trade_in_get_active_case',
    method: 'GET',
    path: '/trade-cases/active',
    summary: 'Get the active case for a source conversation.',
    responseSchema: 'ActiveTradeCaseResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_get_case',
    stableToolName: 'trade_case_get',
    legacyToolName: 'trade_in_get_case',
    method: 'GET',
    path: '/trade-cases/{tradeCaseId}',
    summary: 'Get a trade-in case by id.',
    responseSchema: 'TradeCaseResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_update_case',
    stableToolName: 'trade_case_update',
    legacyToolName: 'trade_in_update_case',
    method: 'PATCH',
    path: '/trade-cases/{tradeCaseId}',
    summary: 'Update trade-in case metadata or machine details.',
    requestSchema: 'UpdateTradeCaseRequest',
    responseSchema: 'TradeCaseResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_archive_case',
    stableToolName: 'trade_case_archive',
    legacyToolName: 'trade_in_archive_case',
    method: 'DELETE',
    path: '/trade-cases/{tradeCaseId}',
    summary: 'Archive a trade-in case.',
    responseSchema: 'ArchiveResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_archive_case_post',
    stableToolName: 'trade_case_archive_post',
    legacyToolName: 'trade_in_archive_case',
    method: 'POST',
    path: '/trade-cases/{tradeCaseId}/archive',
    summary: 'Archive a trade-in case with a POST action.',
    responseSchema: 'ArchiveResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_add_evidence',
    stableToolName: 'trade_case_add_evidence_item',
    legacyToolName: null,
    method: 'POST',
    path: '/trade-cases/{tradeCaseId}/evidence',
    summary: 'Register one evidence item.',
    requestSchema: 'EvidenceCreateRequest',
    responseSchema: 'EvidenceResponse',
    successStatus: 201
  },
  {
    operationId: 'trade_in_register_evidence',
    stableToolName: 'trade_case_add_evidence',
    legacyToolName: 'trade_in_register_evidence',
    method: 'POST',
    path: '/trade-cases/{tradeCaseId}/evidence/batch',
    summary: 'Register a batch of Teams/OpenClaw evidence items.',
    requestSchema: 'EvidenceBatchCreateRequest',
    responseSchema: 'EvidenceBatchCreateResponse',
    successStatus: 201
  },
  {
    operationId: 'trade_in_update_evidence',
    stableToolName: 'trade_case_update_evidence',
    legacyToolName: null,
    method: 'PATCH',
    path: '/trade-cases/{tradeCaseId}/evidence/{evidenceId}',
    summary: 'Update one evidence item.',
    requestSchema: 'EvidenceUpdateRequest',
    responseSchema: 'EvidenceResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_analyze_evidence',
    stableToolName: 'trade_case_analyze_evidence',
    legacyToolName: 'trade_in_analyze_evidence',
    method: 'POST',
    path: '/trade-cases/{tradeCaseId}/evidence/{evidenceId}/analyze',
    summary: 'Analyze one registered evidence item or enqueue analysis.',
    requestSchema: 'AnalyzeEvidenceRequest',
    responseSchema: 'AnalyzeEvidenceResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_get_checklist',
    stableToolName: 'trade_case_checklist',
    legacyToolName: 'trade_in_get_checklist',
    method: 'GET',
    path: '/trade-cases/{tradeCaseId}/checklist',
    summary: 'Get evidence checklist completeness.',
    responseSchema: 'ChecklistResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_processing_status',
    stableToolName: 'trade_case_processing_status',
    legacyToolName: null,
    method: 'GET',
    path: '/trade-cases/{tradeCaseId}/processing-status',
    summary: 'Get async evidence processing status for a case.',
    responseSchema: 'ProcessingStatusResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_get_guidance',
    stableToolName: 'trade_case_guidance',
    legacyToolName: 'trade_in_get_guidance',
    method: 'POST',
    path: '/trade-cases/{tradeCaseId}/guidance',
    summary: 'Get sales-rep next-step guidance.',
    responseSchema: 'GuidanceResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_routing',
    stableToolName: 'trade_case_routing',
    legacyToolName: null,
    method: 'POST',
    path: '/trade-cases/{tradeCaseId}/routing',
    summary: 'Compute and persist review routing.',
    responseSchema: 'RoutingResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_generate_packet',
    stableToolName: 'trade_case_packet',
    legacyToolName: 'trade_in_generate_packet',
    method: 'POST',
    path: '/trade-cases/{tradeCaseId}/packet',
    summary: 'Generate a reviewer-facing trade-in packet.',
    responseSchema: 'PacketResponse',
    successStatus: 201
  },
  {
    operationId: 'trade_in_review_queue',
    stableToolName: 'trade_case_review_queue',
    legacyToolName: null,
    method: 'GET',
    path: '/review/cases',
    summary: 'List sidecar-backed reviewer queue tickets.',
    responseSchema: 'ReviewQueueResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_review_case',
    stableToolName: 'trade_case_review_get',
    legacyToolName: null,
    method: 'GET',
    path: '/review/cases/{tradeCaseId}',
    summary: 'Get a reviewer queue ticket with evidence, findings, packet, and action history.',
    responseSchema: 'ReviewCaseDetailResponse',
    successStatus: 200
  },
  {
    operationId: 'trade_in_review_action',
    stableToolName: 'trade_case_review_action',
    legacyToolName: null,
    method: 'POST',
    path: '/review/cases/{tradeCaseId}/actions',
    summary: 'Record a reviewer decision or note for a trade-in case.',
    requestSchema: 'ReviewActionRequest',
    responseSchema: 'ReviewActionResponse',
    successStatus: 201
  }
];

export function getEndpointContract(method, pathTemplate) {
  const normalizedMethod = String(method || '').toUpperCase();
  return endpointContracts.find(contract =>
    contract.method === normalizedMethod && contract.path === pathTemplate
  );
}

export function schemaByName(name) {
  return ContractSchemas[name];
}

export { API_VERSION };
