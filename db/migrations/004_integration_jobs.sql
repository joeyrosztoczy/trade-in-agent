CREATE TABLE IF NOT EXISTS integration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_case_id UUID NOT NULL REFERENCES trade_cases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_type TEXT NOT NULL,
  target_system TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_integration_jobs_trade_case_id
  ON integration_jobs(trade_case_id);

CREATE INDEX IF NOT EXISTS idx_integration_jobs_status
  ON integration_jobs(status);

CREATE INDEX IF NOT EXISTS idx_integration_jobs_target_system
  ON integration_jobs(target_system);
