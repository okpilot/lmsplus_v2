-- Fix: flagged_questions WITH CHECK was missing deleted_at IS NULL guard.
-- Students could craft REST API calls to INSERT/UPDATE rows with arbitrary
-- deleted_at values, bypassing soft-delete business logic.
-- Closes #274

DROP POLICY flagged_questions_student_all ON flagged_questions;

CREATE POLICY flagged_questions_student_all ON flagged_questions
  FOR ALL
  USING     (student_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (student_id = auth.uid() AND deleted_at IS NULL);
