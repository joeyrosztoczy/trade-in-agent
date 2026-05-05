ALTER TABLE trade_cases
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_trade_cases_source_conversation_id
  ON trade_cases(source_conversation_id)
  WHERE archived_at IS NULL;

ALTER TABLE evidence_items
  ADD COLUMN IF NOT EXISTS original_file_name TEXT,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS source_message_id TEXT,
  ADD COLUMN IF NOT EXISTS source_attachment_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS checklist_slot_confidence NUMERIC(4, 3);

CREATE TABLE IF NOT EXISTS visual_inference_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_item_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  trade_case_id UUID NOT NULL REFERENCES trade_cases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  mode TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_response_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS analysis_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_case_id UUID NOT NULL REFERENCES trade_cases(id) ON DELETE CASCADE,
  evidence_item_id UUID REFERENCES evidence_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finding_type TEXT NOT NULL,
  section TEXT,
  finding TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  confidence NUMERIC(4, 3),
  needs_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
  recommendation TEXT
);

CREATE INDEX IF NOT EXISTS idx_visual_inference_results_evidence_item_id
  ON visual_inference_results(evidence_item_id);

CREATE INDEX IF NOT EXISTS idx_analysis_findings_trade_case_id
  ON analysis_findings(trade_case_id);

CREATE INDEX IF NOT EXISTS idx_analysis_findings_evidence_item_id
  ON analysis_findings(evidence_item_id);
