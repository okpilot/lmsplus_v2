-- Document exam_config_distributions as intentionally ephemeral (no deleted_at).
-- Distributions are replaced wholesale on each admin save (DELETE + re-INSERT).
-- Audit trail is maintained via the parent exam_configs.updated_at timestamp.
-- This follows the same pattern as quiz_drafts — ephemeral config, not auditable records.

COMMENT ON TABLE exam_config_distributions IS
  'Ephemeral config: replaced on each save (DELETE + re-INSERT). '
  'No deleted_at — audit trail via parent exam_configs.updated_at. '
  'Exempt from soft-delete rule per quiz_drafts precedent.';

-- Also add a partial unique index for the duplicate-session guard
-- (defense-in-depth alongside the EXISTS check in start_exam_session)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_exam_session
  ON quiz_sessions (student_id, subject_id)
  WHERE mode = 'mock_exam' AND ended_at IS NULL AND deleted_at IS NULL;
