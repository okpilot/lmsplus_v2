-- Migration 143: optional question-type filter on get_filtered_question_counts
-- (Study/Discovery MC-aware counts — #1008).
--
-- Study/Discovery FETCHES an MC-only practice set (get_random_question_ids with
-- p_question_type := 'multiple_choice', mig 134), but the COUNT path
-- (get_filtered_question_counts) stayed type-agnostic. On a mixed-type subject
-- the slider max / Start-button / count badge overstated the real MC pool, so a
-- student could start with a count the sampler can't fulfil and land in the
-- empty-state runner. We add the same trailing optional parameter
-- `p_question_type text DEFAULT NULL` to get_filtered_question_counts and thread
-- it through to the shared helper _filtered_question_pool (which already accepts
-- it as of mig 134). NULL (the default, and what the live quiz/exam count path
-- passes) means "no type restriction" — so those paths are unaffected.
-- Study/Discovery passes 'multiple_choice' for an honest, MC-aware count.
--
-- Signature change: adding a parameter changes the function's argument list.
-- CREATE OR REPLACE cannot change the argument list, and leaving the old 6-arg
-- overload alive would make PostgREST/SQL calls ambiguous — so the old exact
-- signature is DROPPED first, then recreated with the new trailing param.
-- Precedent: the calc-mode (mig 20260611000400), has-image (mig 20260614000001)
-- and question-type (mig 134) param additions did the same DROP+recreate.
--
-- _filtered_question_pool is NOT modified here — it already carries
-- p_question_type as of mig 134; we only forward the new param. The function is
-- SECURITY INVOKER (RLS applies; per-user filters scope student_id = auth.uid()
-- per security.md §3). No guard change — only the new type predicate is threaded.

DROP FUNCTION IF EXISTS public.get_filtered_question_counts(uuid, uuid[], uuid[], text[], text, text);

---------------------------------------------------------------------------
-- #678 — per-(topic, subtopic) counts over the filtered pool.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_filtered_question_counts(
  p_subject_id    uuid,
  p_topic_ids     uuid[],
  p_subtopic_ids  uuid[],
  p_filters       text[],
  p_calc_mode     text DEFAULT 'all',
  p_has_image     text DEFAULT 'all',
  p_question_type text DEFAULT NULL
)
RETURNS TABLE (topic_id uuid, subtopic_id uuid, n bigint)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT p.topic_id, p.subtopic_id, count(*)::bigint AS n
  FROM public._filtered_question_pool(p_subject_id, p_topic_ids, p_subtopic_ids, p_filters, p_calc_mode, p_has_image, p_question_type) p
  GROUP BY p.topic_id, p.subtopic_id
$$;

---------------------------------------------------------------------------
-- Grants
---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_filtered_question_counts(uuid, uuid[], uuid[], text[], text, text, text) TO authenticated;

---------------------------------------------------------------------------
-- Comments
---------------------------------------------------------------------------
COMMENT ON FUNCTION public.get_filtered_question_counts(uuid, uuid[], uuid[], text[], text, text, text) IS
  'Per-(topic, subtopic) counts over the filtered question pool. Total = sum(n). p_calc_mode {all|only|exclude} AND-restricts on has_calculations (#837); p_has_image {all|only|exclude} AND-restricts on question_image_url presence (#864); optional p_question_type AND-restricts to a single type (NULL = no restriction; Study/Discovery passes ''multiple_choice'' for an MC-aware count, #1008). Replaces client-side counting that truncated at the 1000-row cap (#678/#668).';
