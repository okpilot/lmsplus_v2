-- Cross-device resume (#1026) PR 1 — storage: quiz_session_progress + quiz_sessions columns.
-- One row per (session, question). No correctness column: it holds the student's own answer only.
-- Writes go through SECURITY DEFINER RPCs (next migrations); authenticated can only SELECT own rows.
-- Hard DELETE of a session (test teardown only) cascades; production never deletes (soft delete).

CREATE TABLE quiz_session_progress (
  session_id    uuid        NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  question_id   uuid        NOT NULL REFERENCES questions(id),
  student_id    uuid        NOT NULL REFERENCES users(id),
  answer        jsonb       NULL,
  time_spent_ms int         NOT NULL DEFAULT 0 CHECK (time_spent_ms >= 0 AND time_spent_ms <= 86400000),
  answered_at   timestamptz NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, question_id)
);

COMMENT ON TABLE quiz_session_progress IS
  'In-progress answer per (session, question) for cross-device resume. answer NULL = viewed, unanswered. Never holds correctness or an answer key. Rows are never deleted; lifecycle follows quiz_sessions. Written only by save_quiz_answer / save_quiz_position / check_quiz_answer / check_non_mc_answer.';

ALTER TABLE quiz_session_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_session_progress FORCE ROW LEVEL SECURITY;

REVOKE ALL ON quiz_session_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT ON quiz_session_progress TO authenticated;

CREATE POLICY quiz_session_progress_select_own ON quiz_session_progress
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- No column UPDATE grant on quiz_sessions covers these (20260605000001): RPC-only writes.
ALTER TABLE quiz_sessions
  ADD COLUMN current_index       int    NOT NULL DEFAULT 0 CHECK (current_index >= 0),
  ADD COLUMN pinned_question_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN active_device_id    uuid   NULL;
