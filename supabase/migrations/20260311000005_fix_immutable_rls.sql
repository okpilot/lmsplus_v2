-- Fix immutable table RLS policies
-- Problem: policies without a FOR clause apply to ALL operations (SELECT, INSERT, UPDATE, DELETE).
-- This overrides the explicit no_update/no_delete policies because PostgreSQL OR's permissive policies.
-- Fix: scope the "allow" policies to SELECT + INSERT only.

-- ===== quiz_session_answers =====
DROP POLICY IF EXISTS "students_own_answers" ON quiz_session_answers;

CREATE POLICY "students_read_answers" ON quiz_session_answers
  FOR SELECT
  USING (
    session_id IN (SELECT id FROM quiz_sessions WHERE student_id = auth.uid())
  );

CREATE POLICY "students_insert_answers" ON quiz_session_answers
  FOR INSERT
  WITH CHECK (
    session_id IN (SELECT id FROM quiz_sessions WHERE student_id = auth.uid())
  );

-- ===== student_responses =====
DROP POLICY IF EXISTS "students_own_data" ON student_responses;

CREATE POLICY "students_read_responses" ON student_responses
  FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "students_insert_responses" ON student_responses
  FOR INSERT
  WITH CHECK (student_id = auth.uid());
