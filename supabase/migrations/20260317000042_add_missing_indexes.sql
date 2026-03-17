-- 042_add_missing_indexes.sql
-- Add indexes for frequently-joined columns that were missing.
--
-- Addresses #188: missing indexes identified during performance review.
--
-- Note: CONCURRENTLY cannot be used inside a transaction (Supabase runs
-- migrations transactionally), so these are regular CREATE INDEX statements.
-- For a production database with large tables, consider running these
-- manually with CONCURRENTLY outside of a migration.
--
-- Skipped (already exist):
--   - fsrs_cards(student_id, question_id) — UNIQUE constraint provides implicit index
--   - lessons(organization_id) — idx_lessons_org exists in initial schema

-- quiz_sessions.subject_id — used in get_subject_scores() JOIN
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_subject
  ON quiz_sessions(subject_id) WHERE subject_id IS NOT NULL;

-- questions.subtopic_id — FK join column, matches existing partial index pattern
CREATE INDEX IF NOT EXISTS idx_questions_subtopic
  ON questions(subtopic_id) WHERE deleted_at IS NULL;

-- users.organization_id — org-scoped queries with soft-delete filter
CREATE INDEX IF NOT EXISTS idx_users_org
  ON users(organization_id) WHERE deleted_at IS NULL;

-- courses.organization_id — org-scoped queries with soft-delete filter
CREATE INDEX IF NOT EXISTS idx_courses_org
  ON courses(organization_id) WHERE deleted_at IS NULL;
