-- Save-for-later on the same session id (#1026 PR 1b). Saved = soft-deleted + saved_at marker, so every
-- open-session predicate (ended_at IS NULL AND deleted_at IS NULL) already excludes saved rows.
-- saved_at has no column grant: written only by the save/resume/discard RPCs.
ALTER TABLE quiz_sessions ADD COLUMN saved_at timestamptz NULL;

-- Keeps a saved row soft-deleted for every writer (a student's direct revive is refused by
-- students_update_sessions, mig 20261003000400).
ALTER TABLE quiz_sessions
  ADD CONSTRAINT quiz_sessions_saved_requires_deleted CHECK (saved_at IS NULL OR deleted_at IS NOT NULL);

ALTER TABLE quiz_sessions
  ADD CONSTRAINT quiz_sessions_saved_practice_open CHECK (
    saved_at IS NULL OR (mode IN ('quick_quiz', 'smart_review') AND ended_at IS NULL)
  );

CREATE INDEX idx_quiz_sessions_saved ON quiz_sessions (student_id) WHERE saved_at IS NOT NULL;
