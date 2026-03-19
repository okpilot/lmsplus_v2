-- Flagged questions: per-student persistent flags for later review filtering.
-- Students flag questions during quiz sessions; the flag persists across sessions.
-- Used in quiz setup to filter "Flagged" questions.

CREATE TABLE flagged_questions (
  student_id   UUID NOT NULL REFERENCES users(id),
  question_id  UUID NOT NULL REFERENCES questions(id),
  flagged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  PRIMARY KEY (student_id, question_id)
);

ALTER TABLE flagged_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE flagged_questions FORCE ROW LEVEL SECURITY;

-- Students can only access their own flags
CREATE POLICY flagged_questions_student_all ON flagged_questions
  FOR ALL
  USING (student_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (student_id = auth.uid());

-- Index for quiz setup filter queries (by student)
CREATE INDEX idx_flagged_questions_student ON flagged_questions (student_id)
  WHERE deleted_at IS NULL;
