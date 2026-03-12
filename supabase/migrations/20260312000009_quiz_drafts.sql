-- Quiz drafts: temporary storage for in-progress quizzes (save for later / resume)
-- One draft per student (upsert pattern). Deleted after submit or cancel.

CREATE TABLE quiz_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  session_config  JSONB NOT NULL DEFAULT '{}',
  question_ids    UUID[] NOT NULL DEFAULT '{}',
  answers         JSONB NOT NULL DEFAULT '{}',
  current_index   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);

ALTER TABLE quiz_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_drafts FORCE ROW LEVEL SECURITY;

-- Students can only access their own draft
CREATE POLICY quiz_drafts_student_all ON quiz_drafts
  FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
