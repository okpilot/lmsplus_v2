-- Aggregated question counts per (subject_id, topic_id, subtopic_id).
--
-- Replaces client-side counting in admin/exam-config and admin/syllabus pages.
-- Client fetches were silently truncating at the PostgREST 1000-row cap once
-- the question bank crossed 1000 rows; see issue #614.
--
-- SECURITY INVOKER + RLS scopes the result to the caller's organization via the
-- existing tenant_isolation policy on `questions`.
--
-- p_status:
--   NULL     -> count all non-deleted questions (active + draft); used by syllabus
--   'active' -> count only active questions; used by exam-config (drafts are not eligible for exams)

CREATE OR REPLACE FUNCTION public.get_question_counts(p_status text DEFAULT NULL)
RETURNS TABLE (
  subject_id uuid,
  topic_id uuid,
  subtopic_id uuid,
  n bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT
    q.subject_id,
    q.topic_id,
    q.subtopic_id,
    COUNT(*)::bigint AS n
  FROM questions q
  WHERE q.deleted_at IS NULL
    AND (p_status IS NULL OR q.status = p_status)
  GROUP BY q.subject_id, q.topic_id, q.subtopic_id
$$;

GRANT EXECUTE ON FUNCTION public.get_question_counts(text) TO authenticated;

COMMENT ON FUNCTION public.get_question_counts(text) IS
  'Per-(subject, topic, subtopic) question counts. RLS-scoped to caller org. p_status=''active'' for exam-config (active-only); NULL for syllabus (active+draft). Replaces client-side counting that truncated at the 1000-row cap (#614).';
