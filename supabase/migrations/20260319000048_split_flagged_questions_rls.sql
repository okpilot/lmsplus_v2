-- Fix: FOR ALL policy with WITH CHECK (deleted_at IS NULL) blocks the
-- legitimate soft-delete path (UPDATE SET deleted_at = now()). WITH CHECK
-- evaluates the NEW row, so the non-null deleted_at fails the check.
-- Split into per-command policies as CodeRabbit review recommended.

DROP POLICY flagged_questions_student_all ON flagged_questions;

-- SELECT: only see own non-deleted flags
CREATE POLICY flagged_questions_student_select ON flagged_questions
  FOR SELECT
  USING (student_id = auth.uid() AND deleted_at IS NULL);

-- INSERT: can only create flags for self, must not pre-populate deleted_at
CREATE POLICY flagged_questions_student_insert ON flagged_questions
  FOR INSERT
  WITH CHECK (student_id = auth.uid() AND deleted_at IS NULL);

-- UPDATE: can only update own visible (non-deleted) flags, ownership enforced on new row
-- WITH CHECK allows deleted_at to be set (soft-delete path)
CREATE POLICY flagged_questions_student_update ON flagged_questions
  FOR UPDATE
  USING (student_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (student_id = auth.uid());
