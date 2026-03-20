-- question_comments: per-question discussion threads
-- Hard-delete table (low audit value) — no UPDATE policy, DELETE allowed

CREATE TABLE question_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- RLS
ALTER TABLE question_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_comments FORCE ROW LEVEL SECURITY;

-- SELECT: any authenticated user can see non-deleted comments
CREATE POLICY question_comments_select ON question_comments
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
    )
  );

-- INSERT: users can only create comments as themselves
CREATE POLICY question_comments_insert ON question_comments
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND deleted_at IS NULL);

-- DELETE (own): users can hard-delete their own comments
CREATE POLICY question_comments_delete_own ON question_comments
  FOR DELETE
  USING (user_id = auth.uid());

-- DELETE (admin): admins can hard-delete any comment
CREATE POLICY question_comments_delete_admin ON question_comments
  FOR DELETE
  USING (public.is_admin());

-- Index for fetching comments by question, ordered by time
CREATE INDEX idx_question_comments_question ON question_comments (question_id, created_at)
  WHERE deleted_at IS NULL;
