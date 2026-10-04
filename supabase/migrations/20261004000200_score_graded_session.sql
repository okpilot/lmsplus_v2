-- _score_graded_session: scores a session from its graded quiz_session_answers rows with
-- per-question partial credit; exams divide by total questions, practice by answered, VFR RT by part.
-- A question with broken bank data (_question_is_broken) is left out of the credit and the total.
-- Internal helper; callers authorize the session.

CREATE OR REPLACE FUNCTION _score_graded_session(
  p_session_id uuid,
  p_mode       text,
  p_config     jsonb,
  p_total      int
)
RETURNS TABLE (
  answered_n  int,
  correct_n   int,
  score_pct   numeric,
  passed_flag boolean,
  p1          numeric,
  p2          numeric,
  p3          numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids         uuid[];
  v_credit      numeric;
  v_pass_mark   int;
  v_total       int;
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config->'question_ids') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;
  v_ids := ARRAY(SELECT jsonb_array_elements_text(p_config->'question_ids'))::uuid[];

  -- §15 carve-out: no deleted_at filter — immutable write-once config.question_ids (mig 079); docs/security.md §15, docs/database.md §3.
  WITH session_questions AS (
    SELECT q.id AS question_id,
           CASE WHEN q.question_type = 'dialog_fill'
                THEN greatest(jsonb_array_length(q.blanks_config), 1)
                WHEN q.question_type = 'ordering'
                THEN greatest(jsonb_array_length(q.ordering_items), 1)
                WHEN q.question_type = 'diagram_label'
                THEN greatest(jsonb_array_length(q.diagram_config->'zones'), 1)
                ELSE 1 END AS total_blanks
    FROM questions q WHERE q.id = ANY(v_ids)
      AND NOT _question_is_broken(q.question_type, q.options, q.correct_option_id,
                                  q.canonical_answer, q.accepted_synonyms, q.blanks_config)
  ),
  graded AS (
    SELECT qsa.question_id,
           count(*) FILTER (WHERE qsa.is_correct)::int AS correct_rows
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id
    GROUP BY qsa.question_id
  )
  SELECT
    count(DISTINCT sq.question_id)::int,
    coalesce(sum(LEAST(coalesce(g.correct_rows, 0)::numeric / sq.total_blanks, 1.0)), 0),
    coalesce(sum(coalesce(g.correct_rows, 0)), 0)::int
  INTO answered_n, v_credit, correct_n
  FROM session_questions sq
  JOIN graded g ON g.question_id = sq.question_id;

  IF p_mode IN ('mock_exam', 'internal_exam') THEN
    -- §15 carve-out: no deleted_at filter — immutable write-once config.question_ids (mig 079); docs/security.md §15, docs/database.md §3.
    SELECT GREATEST(p_total - count(*)::int, 0) INTO v_total
    FROM questions q
    WHERE q.id = ANY(v_ids)
      AND _question_is_broken(q.question_type, q.options, q.correct_option_id,
                              q.canonical_answer, q.accepted_synonyms, q.blanks_config);
    score_pct := CASE WHEN v_total > 0 THEN round((v_credit / v_total) * 100, 2) ELSE 0 END;
    v_pass_mark := (p_config->>'pass_mark')::int;
    passed_flag := COALESCE(v_total > 0 AND v_pass_mark IS NOT NULL AND score_pct >= v_pass_mark, false);
    IF p_mode = 'mock_exam' AND answered_n < v_total THEN passed_flag := false; END IF;
  ELSIF p_mode = 'vfr_rt_exam' THEN
    SELECT s.p1, s.p2, s.p3 INTO p1, p2, p3
    FROM public._vfr_rt_exam_part_scores(p_session_id, p_config) s;
    passed_flag := (p1 >= 75 AND p2 >= 75 AND p3 >= 75);
    score_pct   := round((p1 + p2 + p3) / 3, 2);
  ELSE
    score_pct := CASE WHEN answered_n > 0 THEN round((v_credit / answered_n) * 100, 2) ELSE 0 END;
    passed_flag := NULL;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION _score_graded_session(uuid, text, jsonb, int) FROM PUBLIC, anon, authenticated;
