import { z } from 'zod';
import {
  AnalysisJobStatus,
  AnalysisStatus,
  FindingType,
  MediaType,
  QualityStatus,
  ReviewStatus,
  RiskSeverity,
  Route,
  RouteCategory,
  UnitType
} from './enums.js';

const Json = z.any();
const DateLike = z.preprocess(value => value instanceof Date ? value.toISOString() : value, z.string());
const NullableString = z.string().nullable().optional();
const NullableNumber = z.number().nullable().optional();

function looseObject(shape) {
  return z.object(shape).passthrough();
}

export const ErrorResponse = looseObject({
  error: z.string(),
  code: z.string().optional(),
  issues: z.array(Json).optional(),
  requestId: z.string().optional()
});

export const HealthResponse = looseObject({
  ok: z.boolean(),
  apiVersion: z.string().optional(),
  databaseTime: DateLike.optional(),
  analysisQueue: looseObject({
    available: z.boolean(),
    queued: z.number().optional(),
    processing: z.number().optional(),
    failedRetryable: z.number().optional(),
    failedTerminal: z.number().optional(),
    succeeded: z.number().optional(),
    cancelled: z.number().optional(),
    error: z.string().optional()
  }).nullable().optional(),
  service: z.string().optional(),
  requestId: z.string().optional()
});

export const Machine = looseObject({
  unitType: UnitType.or(z.string().min(1)).nullable().optional(),
  make: NullableString,
  model: NullableString,
  modelYear: NullableNumber,
  serialOrPin: NullableString,
  engineHours: NullableNumber,
  separatorHours: NullableNumber,
  location: NullableString,
  attachmentsOrOptions: NullableString
});

export const MachineInput = looseObject({
  unitType: UnitType.or(z.string().min(1)).optional(),
  unit_type: UnitType.or(z.string().min(1)).optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  modelYear: z.number().nullable().optional(),
  model_year: z.number().nullable().optional(),
  serialOrPin: z.string().nullable().optional(),
  serial_or_pin: z.string().nullable().optional(),
  engineHours: z.number().nullable().optional(),
  engine_hours: z.number().nullable().optional(),
  separatorHours: z.number().nullable().optional(),
  separator_hours: z.number().nullable().optional(),
  location: z.string().nullable().optional(),
  attachmentsOrOptions: z.string().nullable().optional(),
  attachments_or_options: z.string().nullable().optional()
});

export const TradeCase = looseObject({
  id: z.string(),
  caseNumber: z.string(),
  createdAt: DateLike.optional(),
  updatedAt: DateLike.optional(),
  createdBy: z.string(),
  sourceConversationId: z.string().nullable().optional(),
  status: z.string(),
  route: Route.or(z.string()),
  confidence: z.number().nullable().optional(),
  assignedReviewer: z.string().nullable().optional(),
  reviewStatus: ReviewStatus.or(z.string()).optional(),
  reviewNotes: z.string().nullable().optional(),
  reviewUpdatedAt: DateLike.nullable().optional(),
  routeReason: z.string().nullable().optional(),
  riskFlags: z.array(Json).optional(),
  routingDecision: Json.optional(),
  archivedAt: DateLike.nullable().optional(),
  active: z.boolean().optional(),
  machine: Machine.nullable().optional(),
  evidenceItems: z.array(z.lazy(() => EvidenceItem)).optional()
});

export const CreateTradeCaseRequest = looseObject({
  createdBy: z.string().optional(),
  created_by: z.string().optional(),
  sourceConversationId: z.string().nullable().optional(),
  source_conversation_id: z.string().nullable().optional(),
  status: z.string().optional(),
  route: Route.or(z.string()).optional(),
  confidence: z.number().nullable().optional(),
  assignedReviewer: z.string().nullable().optional(),
  assigned_reviewer: z.string().nullable().optional(),
  machine: MachineInput.optional()
});

export const UpdateTradeCaseRequest = looseObject({
  status: z.string().optional(),
  route: Route.or(z.string()).optional(),
  confidence: z.number().nullable().optional(),
  assignedReviewer: z.string().nullable().optional(),
  assigned_reviewer: z.string().nullable().optional(),
  sourceConversationId: z.string().nullable().optional(),
  source_conversation_id: z.string().nullable().optional(),
  reviewStatus: ReviewStatus.or(z.string()).optional(),
  review_status: ReviewStatus.or(z.string()).optional(),
  reviewNotes: z.string().nullable().optional(),
  review_notes: z.string().nullable().optional(),
  routeReason: z.string().nullable().optional(),
  route_reason: z.string().nullable().optional(),
  riskFlags: z.array(Json).optional(),
  risk_flags_json: z.array(Json).optional(),
  routingDecision: Json.optional(),
  routing_decision_json: Json.optional(),
  machine: MachineInput.optional()
});

export const ListTradeCasesResponse = looseObject({
  items: z.array(TradeCase)
});

export const ActiveTradeCaseResponse = TradeCase;
export const TradeCaseResponse = TradeCase;

export const EvidenceItem = looseObject({
  id: z.string(),
  tradeCaseId: z.string(),
  uploadedAt: DateLike.optional(),
  uploadedBy: z.string(),
  mediaType: MediaType.or(z.string()),
  storageUri: z.string().nullable().optional(),
  checklistSlot: z.string().nullable().optional(),
  qualityStatus: QualityStatus.or(z.string()),
  analysisStatus: AnalysisStatus.or(z.string()),
  originalFileName: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
  sourceAttachmentId: z.string().nullable().optional(),
  metadata: Json.optional(),
  checklistSlotConfidence: z.number().nullable().optional(),
  notes: z.string().nullable().optional()
});

export const EvidenceCreateRequest = looseObject({
  uploadedBy: z.string().optional(),
  uploaded_by: z.string().optional(),
  mediaType: MediaType.or(z.string()).optional(),
  media_type: MediaType.or(z.string()).optional(),
  storageUri: z.string().nullable().optional(),
  storage_uri: z.string().nullable().optional(),
  checklistSlot: z.string().nullable().optional(),
  checklist_slot: z.string().nullable().optional(),
  qualityStatus: QualityStatus.or(z.string()).optional(),
  quality_status: QualityStatus.or(z.string()).optional(),
  analysisStatus: AnalysisStatus.or(z.string()).optional(),
  analysis_status: AnalysisStatus.or(z.string()).optional(),
  notes: z.string().nullable().optional(),
  originalFileName: z.string().nullable().optional(),
  original_file_name: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
  content_type: z.string().nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
  source_message_id: z.string().nullable().optional(),
  sourceAttachmentId: z.string().nullable().optional(),
  source_attachment_id: z.string().nullable().optional(),
  metadata: Json.optional(),
  metadata_json: Json.optional(),
  checklistSlotConfidence: z.number().nullable().optional(),
  checklist_slot_confidence: z.number().nullable().optional()
});

export const EvidenceUpdateRequest = EvidenceCreateRequest;
export const EvidenceResponse = EvidenceItem;

export const EvidenceBatchCreateRequest = looseObject({
  processingMode: z.enum(['sync', 'async']).optional(),
  processing_mode: z.enum(['sync', 'async']).optional(),
  jobType: z.string().optional(),
  job_type: z.string().optional(),
  priority: z.number().optional(),
  maxAttempts: z.number().optional(),
  max_attempts: z.number().optional(),
  analysisMode: z.string().optional(),
  analysis_mode: z.string().optional(),
  media: Json.optional(),
  machineContext: MachineInput.optional(),
  items: z.array(EvidenceCreateRequest).optional(),
  evidence: z.array(EvidenceCreateRequest).optional()
}).refine(value => Array.isArray(value.items) || Array.isArray(value.evidence), {
  message: 'items or evidence is required',
  path: ['items']
});

export const AnalysisJob = looseObject({
  id: z.string(),
  tradeCaseId: z.string(),
  evidenceItemId: z.string(),
  createdAt: DateLike.optional(),
  updatedAt: DateLike.optional(),
  jobType: z.string(),
  status: AnalysisJobStatus.or(z.string()),
  priority: z.number(),
  attempts: z.number(),
  maxAttempts: z.number(),
  lockedBy: z.string().nullable().optional(),
  lockedAt: DateLike.nullable().optional(),
  startedAt: DateLike.nullable().optional(),
  completedAt: DateLike.nullable().optional(),
  nextAttemptAt: DateLike.nullable().optional(),
  timeoutAt: DateLike.nullable().optional(),
  payload: Json.optional(),
  result: Json.optional(),
  error: z.string().nullable().optional()
});

export const EvidenceBatchCreateResponse = looseObject({
  tradeCaseId: z.string(),
  caseNumber: z.string(),
  items: z.array(EvidenceItem),
  registeredCount: z.number(),
  queuedCount: z.number(),
  jobs: z.array(AnalysisJob).optional(),
  processingSummary: Json.optional(),
  nextEvidenceRequests: z.array(Json).optional(),
  message: z.string().optional()
});

export const AnalyzeEvidenceRequest = looseObject({
  async: z.boolean().optional(),
  queue: z.boolean().optional(),
  processingMode: z.enum(['sync', 'async']).optional(),
  processing_mode: z.enum(['sync', 'async']).optional(),
  allowSynchronousAnalysis: z.boolean().optional(),
  allow_synchronous_analysis: z.boolean().optional(),
  analysisMode: z.string().optional(),
  analysis_mode: z.string().optional(),
  checklistSlot: z.string().nullable().optional(),
  checklist_slot: z.string().nullable().optional(),
  model: z.string().optional(),
  openaiModel: z.string().optional(),
  openai_model: z.string().optional(),
  escalate: z.boolean().optional(),
  useReviewModel: z.boolean().optional(),
  use_review_model: z.boolean().optional(),
  highRisk: z.boolean().optional(),
  high_risk: z.boolean().optional(),
  machineContext: MachineInput.optional(),
  machine_context: MachineInput.optional(),
  media: z.array(EvidenceCreateRequest).optional(),
  sampledFrames: z.array(Json).optional(),
  sampled_frames: z.array(Json).optional()
});

export const VisualFinding = looseObject({
  id: z.string().optional(),
  tradeCaseId: z.string().optional(),
  evidenceItemId: z.string().nullable().optional(),
  createdAt: DateLike.optional(),
  findingType: FindingType.or(z.string()).optional(),
  section: z.string().nullable().optional(),
  finding: z.string().optional(),
  severity: RiskSeverity.or(z.string()).nullable().optional(),
  confidence: z.number().nullable().optional(),
  needsFollowUp: z.boolean().optional(),
  recommendation: z.string().nullable().optional()
});

export const AnalyzeEvidenceResponse = looseObject({
  evidence: EvidenceItem.optional(),
  analysis: Json.optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  mode: z.string().optional(),
  tradeCaseId: z.string().optional(),
  caseNumber: z.string().optional(),
  evidenceId: z.string().optional(),
  jobId: z.string().optional(),
  analysisStatus: AnalysisStatus.or(z.string()).optional(),
  job: AnalysisJob.optional(),
  processingSummary: Json.optional()
});

export const ChecklistItem = looseObject({
  slot: z.string(),
  description: z.string(),
  requiredForBaseline: z.boolean(),
  status: z.string(),
  evidenceItemId: z.string().nullable().optional(),
  qualityStatus: QualityStatus.or(z.string()).nullable().optional(),
  analysisStatus: AnalysisStatus.or(z.string()).nullable().optional()
});

export const ChecklistResponse = looseObject({
  unitType: UnitType.or(z.string()),
  requiredCount: z.number(),
  completeCount: z.number(),
  acceptedCount: z.number(),
  weakCount: z.number(),
  retakeCount: z.number(),
  duplicateCount: z.number(),
  rejectedCount: z.number(),
  missingCount: z.number(),
  complete: z.boolean(),
  acceptedSlots: z.array(z.string()),
  weakSlots: z.array(z.string()),
  retakeSlots: z.array(z.string()),
  duplicateSlots: z.array(z.string()),
  missingSlots: z.array(z.string()),
  nextRecommendedSlots: z.array(z.string()),
  items: z.array(ChecklistItem),
  visibleConditionFindings: z.array(VisualFinding).optional(),
  evidenceQualityFindings: z.array(VisualFinding).optional(),
  uncertaintyFindings: z.array(VisualFinding).optional()
});

export const RiskFlag = looseObject({
  code: z.string(),
  severity: RiskSeverity.or(z.string()),
  message: z.string(),
  category: z.string().optional()
});

export const EvidenceRequest = looseObject({
  slot: z.string(),
  description: z.string(),
  reason: z.string().optional(),
  priority: z.enum(['high', 'normal', 'low']).or(z.string()).optional()
});

export const GuidanceResponse = looseObject({
  tradeCaseId: z.string(),
  caseNumber: z.string(),
  route: Route.or(z.string()),
  routeCategory: RouteCategory.or(z.string()).optional(),
  reviewStatus: ReviewStatus.or(z.string()),
  confidence: z.number(),
  packetReady: z.boolean(),
  routeReason: z.string(),
  riskFlags: z.array(RiskFlag),
  acceptedEvidenceSlots: z.array(z.string()),
  acceptedEvidenceSummary: z.array(z.string()),
  visibleConditionSummary: z.array(z.string()),
  retakeRequestSlots: z.array(z.string()),
  retakeRequests: z.array(EvidenceRequest),
  missingEvidenceRequestSlots: z.array(z.string()),
  missingEvidenceRequests: z.array(EvidenceRequest),
  nextEvidenceRequests: z.array(EvidenceRequest),
  targetedFollowUpQuestions: z.array(z.string()),
  escalationReasons: z.array(z.string()),
  uncertaintyAndLimitations: z.array(z.string()),
  suggestedNextMessage: z.string(),
  checklist: ChecklistResponse
});

export const RoutingResponse = looseObject({
  tradeCaseId: z.string(),
  caseNumber: z.string(),
  generatedAt: DateLike,
  route: Route.or(z.string()),
  routeCategory: RouteCategory.or(z.string()),
  reviewStatus: ReviewStatus.or(z.string()),
  confidence: z.number(),
  packetReady: z.boolean(),
  routeReason: z.string(),
  riskFlags: z.array(RiskFlag),
  nextEvidenceRequests: z.array(EvidenceRequest),
  targetedFollowUpQuestions: z.array(z.string()),
  escalationReasons: z.array(z.string()),
  confidenceFactors: Json.optional(),
  checklist: ChecklistResponse
});

export const ProcessingStatusResponse = looseObject({
  tradeCaseId: z.string(),
  caseNumber: z.string(),
  generatedAt: DateLike,
  summary: Json,
  evidence: z.array(EvidenceItem.extend({ job: AnalysisJob.nullable().optional() }).passthrough()),
  latestGuidance: GuidanceResponse,
  message: z.string()
});

export const PacketResponse = looseObject({
  id: z.string(),
  tradeCaseId: z.string(),
  caseNumber: z.string(),
  packet: Json,
  markdown: z.string(),
  createdAt: DateLike
});

export const ReviewQueueCase = looseObject({
  id: z.string(),
  caseNumber: z.string(),
  createdAt: DateLike.optional(),
  updatedAt: DateLike.optional(),
  unit: z.string(),
  modelYear: z.number().nullable().optional(),
  type: z.string(),
  serial: z.string(),
  hours: z.string(),
  customer: z.string(),
  location: z.string(),
  stage: z.string(),
  route: z.string(),
  routeKey: z.string().optional(),
  age: z.string(),
  risk: z.enum(['low', 'medium', 'high']).or(z.string()),
  riskScore: z.number(),
  reviewStatus: z.string().optional(),
  reviewStatusLabel: z.string().optional(),
  confidence: z.string(),
  proposedTrade: z.number().nullable().optional(),
  lowValue: z.number().nullable().optional(),
  highValue: z.number().nullable().optional(),
  reconBudget: z.number().nullable().optional(),
  reconLow: z.number().nullable().optional(),
  reconHigh: z.number().nullable().optional(),
  specs: z.array(z.tuple([z.string(), z.any()])),
  riskFactors: z.array(z.tuple([z.string(), z.number(), z.string()])),
  evidence: z.array(Json),
  reviewLines: z.array(Json),
  summary: z.string(),
  source: Json.optional(),
  sourceUrl: z.string().nullable().optional(),
  listingFacts: Json.optional(),
  packet: Json.nullable().optional(),
  processingSummary: Json.optional(),
  checklist: ChecklistResponse.optional(),
  latestAction: Json.nullable().optional()
});

export const ReviewQueueResponse = looseObject({
  generatedAt: DateLike,
  summary: Json,
  items: z.array(ReviewQueueCase)
});

export const ReviewCaseDetailResponse = ReviewQueueCase.extend({
  evidenceItems: z.array(EvidenceItem).optional(),
  findings: z.array(VisualFinding).optional(),
  actions: z.array(Json).optional()
}).passthrough();

export const ReviewActionRequest = looseObject({
  actionType: z.string().optional(),
  action_type: z.string().optional(),
  reviewer: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewed_by: z.string().optional(),
  note: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  reviewStatus: z.string().nullable().optional(),
  review_status: z.string().nullable().optional(),
  route: Route.or(z.string()).nullable().optional(),
  packetId: z.string().nullable().optional(),
  packet_id: z.string().nullable().optional(),
  payload: Json.optional(),
  metadata: Json.optional()
});

export const ReviewActionResponse = looseObject({
  ok: z.boolean(),
  case: ReviewCaseDetailResponse
});

export const ArchiveResponse = looseObject({
  ok: z.boolean(),
  id: z.string(),
  archivedAt: DateLike
});

export const ContractSchemas = {
  ErrorResponse,
  HealthResponse,
  Machine,
  MachineInput,
  CreateTradeCaseRequest,
  TradeCaseResponse,
  ListTradeCasesResponse,
  ActiveTradeCaseResponse,
  UpdateTradeCaseRequest,
  EvidenceCreateRequest,
  EvidenceUpdateRequest,
  EvidenceResponse,
  EvidenceBatchCreateRequest,
  EvidenceBatchCreateResponse,
  AnalyzeEvidenceRequest,
  AnalyzeEvidenceResponse,
  ChecklistResponse,
  ProcessingStatusResponse,
  GuidanceResponse,
  RoutingResponse,
  PacketResponse,
  ReviewQueueCase,
  ReviewQueueResponse,
  ReviewCaseDetailResponse,
  ReviewActionRequest,
  ReviewActionResponse,
  ArchiveResponse
};
