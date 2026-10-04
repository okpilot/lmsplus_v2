-- _vfr_rt_exam_part_scores: same as 20260929000100, but a question with broken bank data
-- (_question_is_broken) is left out of its part's mean.
--
-- No q.deleted_at filter on the questions JOIN: §15 carve-out via the immutable
-- write-once config.question_ids (docs/security.md §15; docs/database.md §3
-- "Scoring Soft-Deleted Questions"). Trusts p_session_id / p_config — no
-- auth.uid() check of its own; SECURITY DEFINER callers are the authorization
-- boundary.

CREATE OR REPLACE FUNCTION public._vfr_rt_exam_part_scores(
  p_session_id uuid,
  p_config     jsonb
)
RETURNS TABLE (p1 numeric, p2 numeric, p3 numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(round(100 * avg(per_q.ts) FILTER (WHERE per_q.qt = 'short_answer'), 2), 0),
         COALESCE(round(100 * avg(per_q.ts) FILTER (WHERE per_q.qt = 'dialog_fill'), 2), 0),
         COALESCE(round(100 * avg(per_q.ts) FILTER (
           WHERE per_q.qt IN ('multiple_choice', 'ordering', 'diagram_label')), 2), 0)
  FROM (
    SELECT q.question_type AS qt,
           LEAST(
             (SELECT count(*) FROM quiz_session_answers qsa
               WHERE qsa.session_id = p_session_id
                 AND qsa.question_id = q.id
                 AND qsa.is_correct)::numeric
             / GREATEST(
                 CASE q.question_type
                   WHEN 'dialog_fill'    THEN jsonb_array_length(q.blanks_config)
                   WHEN 'ordering'       THEN jsonb_array_length(q.ordering_items)
                   WHEN 'diagram_label'  THEN jsonb_array_length(q.diagram_config->'zones')
                   ELSE 1
                 END, 1),
             1) AS ts
    FROM jsonb_array_elements_text(p_config->'question_ids') AS cfg(qid)
    JOIN questions q ON q.id = cfg.qid::uuid
    WHERE NOT public._question_is_broken(q.question_type, q.options, q.correct_option_id,
                                         q.canonical_answer, q.accepted_synonyms, q.blanks_config)
  ) per_q;
$$;

REVOKE EXECUTE ON FUNCTION public._vfr_rt_exam_part_scores(uuid, jsonb) FROM PUBLIC, anon, authenticated;
