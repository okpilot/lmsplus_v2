-- Red-team GP: a student could clear deleted_at on their own discarded session (column grant on
-- deleted_at, mig 20260605000001) and revive a discarded exam after keying its questions in practice.
-- A student UPDATE now only reaches a live row; resume_saved_quiz (SECURITY DEFINER) is the one revive path.
ALTER POLICY students_update_sessions ON quiz_sessions
  USING (student_id = auth.uid() AND ended_at IS NULL AND deleted_at IS NULL);
