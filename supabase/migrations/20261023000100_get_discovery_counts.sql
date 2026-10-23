-- #1602: one read for every subject x filter-set Discovery count (replaces ~50 parallel
-- get_filtered_question_counts calls per /app/quiz load).
--
-- Pool = p_question_type 'multiple_choice' of get_filtered_question_counts: active, not deleted,
-- question_type = 'multiple_choice'. Per-student predicates copied from
-- 20261017000400_filtered_question_pool_select_auth_uid.sql (_filtered_question_pool).
-- SECURITY INVOKER: RLS tenant_isolation scopes the pool to the caller's org. The explicit
-- student_id = (select auth.uid()) scope is load-bearing on student_responses (two permissive
-- SELECT policies) and defense-in-depth on fsrs_cards / active_flagged_questions.
-- Columns: n_all = no filter; n_unseen = ['unseen']; n_incorrect = ['incorrect'];
-- n_flagged = ['flagged']; n_incorrect_or_flagged = ['incorrect','flagged'] (UNION).

CREATE OR REPLACE FUNCTION public.get_discovery_counts()
RETURNS TABLE (
  subject_id uuid,
  topic_id uuid,
  subtopic_id uuid,
  n_all bigint,
  n_unseen bigint,
  n_incorrect bigint,
  n_flagged bigint,
  n_incorrect_or_flagged bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  WITH pool AS (
    SELECT
      q.subject_id,
      q.topic_id,
      q.subtopic_id,
      NOT EXISTS (
        SELECT 1 FROM student_responses sr
        WHERE sr.student_id = (select auth.uid())
          AND sr.question_id = q.id
      ) AS is_unseen,
      EXISTS (
        SELECT 1 FROM fsrs_cards fc
        WHERE fc.student_id = (select auth.uid())
          AND fc.last_was_correct = false
          AND fc.question_id = q.id
      ) AS is_incorrect,
      EXISTS (
        SELECT 1 FROM active_flagged_questions af
        WHERE af.student_id = (select auth.uid())
          AND af.question_id = q.id
      ) AS is_flagged
    FROM questions q
    WHERE q.status = 'active'
      AND q.deleted_at IS NULL
      AND q.question_type = 'multiple_choice'
  )
  SELECT
    p.subject_id,
    p.topic_id,
    p.subtopic_id,
    COUNT(*)::bigint AS n_all,
    (COUNT(*) FILTER (WHERE p.is_unseen))::bigint AS n_unseen,
    (COUNT(*) FILTER (WHERE p.is_incorrect))::bigint AS n_incorrect,
    (COUNT(*) FILTER (WHERE p.is_flagged))::bigint AS n_flagged,
    (COUNT(*) FILTER (WHERE p.is_incorrect OR p.is_flagged))::bigint AS n_incorrect_or_flagged
  FROM pool p
  GROUP BY p.subject_id, p.topic_id, p.subtopic_id
$$;

GRANT EXECUTE ON FUNCTION public.get_discovery_counts() TO authenticated;

COMMENT ON FUNCTION public.get_discovery_counts() IS
  'Per-(subject, topic, subtopic) multiple-choice counts under each preloaded Discovery filter set (none, unseen, incorrect, flagged, incorrect+flagged) for the caller. Same pool and per-student predicates as get_filtered_question_counts with p_question_type ''multiple_choice'' (#1602). SECURITY INVOKER; RLS scopes the org; student scope is (select auth.uid()).';
