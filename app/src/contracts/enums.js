import { z } from 'zod';

export const API_VERSION = 'trade-in-sidecar/v1';
export const API_TITLE = 'Trade-In Agent Sidecar API';

export const UnitType = z.enum(['combine', 'high_hp_tractor']);

export const MediaType = z.enum([
  'photo',
  'image',
  'video',
  'document',
  'field_note',
  'file'
]);

export const QualityStatus = z.enum([
  'pending',
  'accepted',
  'weak',
  'needs_retake',
  'duplicate',
  'rejected'
]);

export const AnalysisStatus = z.enum([
  'pending',
  'queued',
  'processing',
  'complete',
  'unsupported',
  'failed',
  'error'
]);

export const Route = z.enum([
  'draft',
  'needs_more_evidence',
  'fast_path_candidate',
  'standard_review',
  'escalation_required',
  'technician_inspection_required'
]);

export const RouteCategory = z.enum([
  'draft',
  'collection',
  'fast',
  'standard',
  'escalation'
]);

export const ReviewStatus = z.enum([
  'field_collection',
  'ready_for_fast_review',
  'ready_for_standard_review',
  'central_review_hold',
  'technician_inspection_required'
]);

export const RiskSeverity = z.enum([
  'info',
  'watch',
  'concern',
  'severe'
]);

export const FindingType = z.enum([
  'condition',
  'evidence_quality',
  'uncertainty'
]);

export const AnalysisJobStatus = z.enum([
  'queued',
  'processing',
  'succeeded',
  'failed_retryable',
  'failed_terminal',
  'cancelled'
]);

