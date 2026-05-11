CREATE TABLE IF NOT EXISTS evidence_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_case_id UUID NOT NULL REFERENCES trade_cases(id) ON DELETE CASCADE,
  evidence_item_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_type TEXT NOT NULL DEFAULT 'field_evidence_quality',
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 100,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timeout_at TIMESTAMPTZ,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_analysis_jobs_unique_active
  ON evidence_analysis_jobs(evidence_item_id, job_type)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_evidence_analysis_jobs_trade_case_id
  ON evidence_analysis_jobs(trade_case_id);

CREATE INDEX IF NOT EXISTS idx_evidence_analysis_jobs_evidence_item_id
  ON evidence_analysis_jobs(evidence_item_id);

CREATE INDEX IF NOT EXISTS idx_evidence_analysis_jobs_ready
  ON evidence_analysis_jobs(status, next_attempt_at, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_evidence_items_analysis_status
  ON evidence_items(analysis_status);
