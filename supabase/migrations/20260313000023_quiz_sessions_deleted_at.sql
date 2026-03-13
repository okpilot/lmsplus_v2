-- Add deleted_at to quiz_sessions so students can discard active sessions
-- (soft-delete only — no hard DELETE allowed per project rules)

ALTER TABLE quiz_sessions
  ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- Replace the ALL policy with one that allows soft-delete updates.
-- Deleted sessions are filtered in application queries, not RLS,
-- because RLS WITH CHECK on UPDATE validates against ALL policies
-- including SELECT — blocking the deleted_at write.
DROP POLICY IF EXISTS "students_own_sessions" ON quiz_sessions;
CREATE POLICY "students_own_sessions" ON quiz_sessions
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Instructors read non-deleted sessions in their org (filtered here)
DROP POLICY IF EXISTS "instructors_read_sessions" ON quiz_sessions;
CREATE POLICY "instructors_read_sessions" ON quiz_sessions
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
  );
