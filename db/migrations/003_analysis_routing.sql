ALTER TABLE trade_cases
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'field_collection',
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS review_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS route_reason TEXT,
  ADD COLUMN IF NOT EXISTS risk_flags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS routing_decision_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_trade_cases_review_status
  ON trade_cases(review_status);

CREATE INDEX IF NOT EXISTS idx_trade_cases_route
  ON trade_cases(route);
