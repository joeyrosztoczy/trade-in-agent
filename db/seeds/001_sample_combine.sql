INSERT INTO trade_cases (
  id, created_by, source_conversation_id, status, route, confidence, assigned_reviewer
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'local-seed',
  'seed-conversation',
  'draft',
  'draft',
  NULL,
  NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO machines (
  trade_case_id, unit_type, make, model, model_year, serial_or_pin,
  engine_hours, separator_hours, location, attachments_or_options
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'combine',
  'John Deere',
  'S780',
  2021,
  'PLACEHOLDER-PIN',
  1250.0,
  890.0,
  'Placeholder location',
  'Placeholder options'
)
ON CONFLICT (trade_case_id) DO NOTHING;

INSERT INTO evidence_items (
  id, trade_case_id, uploaded_by, media_type, storage_uri,
  checklist_slot, quality_status, analysis_status, notes
)
VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'local-seed', 'photo', 'fixtures/media/front-45-placeholder.jpg', 'front_45', 'accepted', 'pending', 'Seed placeholder'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'local-seed', 'photo', 'fixtures/media/rear-45-placeholder.jpg', 'rear_45', 'accepted', 'pending', 'Seed placeholder'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'local-seed', 'photo', 'fixtures/media/serial-plate-placeholder.jpg', 'serial_plate', 'accepted', 'pending', 'Seed placeholder'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'local-seed', 'photo', 'fixtures/media/cab-display-placeholder.jpg', 'cab_display_hours', 'accepted', 'pending', 'Seed placeholder'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 'local-seed', 'video', 'fixtures/media/startup-placeholder.mp4', 'startup_video', 'accepted', 'pending', 'Seed placeholder')
ON CONFLICT DO NOTHING;
