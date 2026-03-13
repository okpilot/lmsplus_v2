-- Add deleted_at to quiz_sessions so students can discard active sessions
-- (soft-delete only — no hard DELETE allowed per project rules)

ALTER TABLE quiz_sessions
  ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- Split the old ALL policy into granular per-operation policies.
-- Deleted sessions are filtered in application queries, not RLS,
-- because RLS WITH CHECK on UPDATE validates against ALL policies
-- including SELECT — blocking the deleted_at write.
DROP POLICY IF EXISTS "students_own_sessions" ON quiz_sessions;

-- Students can read their own sessions (including soft-deleted ones for report access)
CREATE POLICY "students_select_sessions" ON quiz_sessions
  FOR SELECT
  USING (student_id = auth.uid());

-- Students can create new sessions
CREATE POLICY "students_insert_sessions" ON quiz_sessions
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Students can update their own active (non-ended) sessions only
-- This permits both completing (ended_at write) and discarding (deleted_at write)
CREATE POLICY "students_update_sessions" ON quiz_sessions
  FOR UPDATE
  USING (student_id = auth.uid() AND ended_at IS NULL)
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
