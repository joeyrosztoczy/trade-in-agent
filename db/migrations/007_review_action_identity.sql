ALTER TABLE review_actions
  ADD COLUMN IF NOT EXISTS reviewer_entra_object_id TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_display_name TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_email TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_upn TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_role TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_tenant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_review_actions_reviewer_email
  ON review_actions(reviewer_email);

CREATE INDEX IF NOT EXISTS idx_review_actions_reviewer_tenant_id
  ON review_actions(reviewer_tenant_id);
