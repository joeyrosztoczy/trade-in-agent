CREATE TABLE IF NOT EXISTS review_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_case_id UUID NOT NULL REFERENCES trade_cases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewer TEXT NOT NULL DEFAULT 'local-reviewer',
  action_type TEXT NOT NULL,
  note TEXT,
  review_status TEXT,
  route TEXT,
  packet_id UUID REFERENCES packets(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_review_actions_trade_case_id
  ON review_actions(trade_case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_actions_action_type
  ON review_actions(action_type);
