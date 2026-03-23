-- Fix: SELECT policy USING (deleted_at IS NULL) prevents UPDATE soft-delete path.
-- With FORCE ROW LEVEL SECURITY, Postgres checks the SELECT visibility of the
-- NEW row after UPDATE — setting deleted_at makes it invisible to SELECT,
-- which Postgres treats as a policy violation.
--
-- Solution: Remove deleted_at filter from RLS. Application queries already
-- filter deleted_at IS NULL via .is('deleted_at', null) in flag.ts.
-- RLS only enforces ownership.

DROP POLICY IF EXISTS flagged_questions_student_select ON flagged_questions;
DROP POLICY IF EXISTS flagged_questions_student_insert ON flagged_questions;
DROP POLICY IF EXISTS flagged_questions_student_update ON flagged_questions;

-- SELECT: own flags only (app filters deleted_at)
CREATE POLICY flagged_questions_student_select ON flagged_questions
  FOR SELECT
  USING (student_id = auth.uid());

-- INSERT: own flags only
CREATE POLICY flagged_questions_student_insert ON flagged_questions
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- UPDATE: own flags only (soft-delete path)
CREATE POLICY flagged_questions_student_update ON flagged_questions
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
