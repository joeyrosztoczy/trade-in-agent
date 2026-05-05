CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS trade_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  source_conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  route TEXT NOT NULL DEFAULT 'draft',
  confidence NUMERIC(5, 2),
  assigned_reviewer TEXT,
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_case_id UUID NOT NULL UNIQUE REFERENCES trade_cases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unit_type TEXT NOT NULL,
  make TEXT,
  model TEXT,
  model_year INTEGER,
  serial_or_pin TEXT,
  engine_hours NUMERIC(10, 1),
  separator_hours NUMERIC(10, 1),
  location TEXT,
  attachments_or_options TEXT
);

CREATE TABLE IF NOT EXISTS evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_case_id UUID NOT NULL REFERENCES trade_cases(id) ON DELETE CASCADE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by TEXT NOT NULL,
  media_type TEXT NOT NULL,
  storage_uri TEXT,
  checklist_slot TEXT,
  quality_status TEXT NOT NULL DEFAULT 'pending',
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_case_id UUID NOT NULL REFERENCES trade_cases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  packet_json JSONB NOT NULL,
  packet_markdown TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trade_cases_status ON trade_cases(status);
CREATE INDEX IF NOT EXISTS idx_evidence_items_trade_case_id ON evidence_items(trade_case_id);
CREATE INDEX IF NOT EXISTS idx_packets_trade_case_id ON packets(trade_case_id);
