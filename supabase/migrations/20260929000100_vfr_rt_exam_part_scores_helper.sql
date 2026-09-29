-- _vfr_rt_exam_part_scores: per-part percentages for a vfr_rt_exam session.
-- Question credit = LEAST(correct rows / denominator, 1); denominator = blanks
-- (dialog_fill), items (ordering), zones (diagram_label), else 1; unanswered
-- questions score 0. Part 1 = short_answer, Part 2 = dialog_fill, Part 3 =
-- multiple_choice + ordering + diagram_label; part % = mean over the part's
-- questions in p_config->'question_ids'.
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
  ) per_q;
$$;

REVOKE EXECUTE ON FUNCTION public._vfr_rt_exam_part_scores(uuid, jsonb) FROM PUBLIC, anon, authenticated;
