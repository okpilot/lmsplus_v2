-- Restrict direct INSERT on immutable answer tables.
-- The submit_quiz_answer() RPC is SECURITY DEFINER (runs as owner, bypasses RLS),
-- so it can still insert. But students cannot insert directly via the client,
-- which would let them forge is_correct values.

-- quiz_session_answers: drop the INSERT policy, keep SELECT only
DROP POLICY IF EXISTS "students_insert_answers" ON quiz_session_answers;

-- student_responses: drop the INSERT policy, keep SELECT only
DROP POLICY IF EXISTS "students_insert_responses" ON student_responses;
