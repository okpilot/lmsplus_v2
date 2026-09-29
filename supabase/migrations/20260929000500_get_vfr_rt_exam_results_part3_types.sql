-- get_vfr_rt_exam_results: scores via _vfr_rt_exam_part_scores; the answer key
-- gains ordering ({correct_order, items}) and diagram_label ({answer, zones,
-- labels}). Guards, including the ended_at gate, unchanged.

CREATE OR REPLACE FUNCTION get_vfr_rt_exam_results(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_config     jsonb;
  v_total      int;
  v_correct    int;
  v_p1         numeric;
  v_p2         numeric;
  v_p3         numeric;
  v_questions  jsonb;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Active-user gate (#838): a soft-deleted account with a live JWT must not
  -- read its completed-session answer keys (family pattern, migs 099/099b/100).
  PERFORM 1
  FROM users u
  WHERE u.id = v_student_id AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  SELECT qs.config, qs.total_questions
  INTO v_config, v_total
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.mode = 'vfr_rt_exam'
    AND qs.deleted_at IS NULL
    AND qs.ended_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found, not owned, or not completed';
  END IF;
  -- Config-shape guard before jsonb_array_elements_text (family pattern:
  -- batch_submit_quiz mig 095c, submit_vfr_rt_exam_answers mig 100). Without
  -- it, a malformed config would render as a valid-looking zero-score result.
  IF v_config IS NULL OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;

  -- Per-part percentages: the values frozen at grading time in the terminal
  -- audit event (vfr_rt_exam.completed / .expired), so a later question-content
  -- edit cannot change an ended result. An event without them falls back to the
  -- shared helper (frozen-ID §15 carve-out; no q.organization_id filter — post-completion
  -- historical read bounded by the student_id ownership guard and the
  -- write-once config).
  SELECT (ae.metadata->>'part1_pct')::numeric,
         (ae.metadata->>'part2_pct')::numeric,
         (ae.metadata->>'part3_pct')::numeric
  INTO v_p1, v_p2, v_p3
  FROM audit_events ae
  WHERE ae.resource_type = 'quiz_session'
    AND ae.resource_id = p_session_id
    AND ae.event_type IN ('vfr_rt_exam.completed', 'vfr_rt_exam.expired')
  ORDER BY ae.created_at DESC
  LIMIT 1;
  IF v_p1 IS NULL OR v_p2 IS NULL OR v_p3 IS NULL THEN
    SELECT s.p1, s.p2, s.p3 INTO v_p1, v_p2, v_p3
    FROM public._vfr_rt_exam_part_scores(p_session_id, v_config) s;
  END IF;

  SELECT count(*) FILTER (WHERE qsa.is_correct)::int
  INTO v_correct
  FROM quiz_session_answers qsa
  WHERE qsa.session_id = p_session_id;

  -- Review payload: one entry per session question, in config.question_ids order.
  -- 'answers' = the student's rows (selected_option_id for MC; response_text for
  -- short_answer; per-blank response_text + blank_index for dialog_fill), each
  -- with its is_correct. 'key' = the revealed answer key per type. Explanation
  -- fields ride alongside (#840) — safe behind the ended_at gate above, stripped
  -- from the in-flight path by mig 105. The MC correct option id is read from the
  -- questions.correct_option_id column (#823) — the answer key no longer lives in
  -- the options JSONB.
  WITH cfg AS (
    SELECT (e.qid)::uuid AS question_id, e.ord
    FROM jsonb_array_elements_text(v_config->'question_ids')
      WITH ORDINALITY AS e(qid, ord)
  ),
  ans AS (
    SELECT qsa.question_id,
           jsonb_agg(jsonb_build_object(
             'blank_index',        qsa.blank_index,
             'selected_option_id', qsa.selected_option_id,
             'response_text',      qsa.response_text,
             'is_correct',         qsa.is_correct
           ) ORDER BY qsa.blank_index NULLS FIRST) AS answers
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id
    GROUP BY qsa.question_id
  ),
  mc_key AS (
    SELECT
      q.id AS question_id,
      q.correct_option_id
    FROM cfg
    -- No q.deleted_at filter: §15 carve-out via the immutable write-once
    -- config.question_ids (docs/security.md §15; docs/database.md §3
    -- "Scoring Soft-Deleted Questions").
    JOIN questions q ON q.id = cfg.question_id
    WHERE q.question_type = 'multiple_choice'
  )
  SELECT jsonb_agg(jsonb_build_object(
           'question_id',           q.id,
           'question_type',         q.question_type,
           'question_text',         q.question_text,
           'explanation_text',      q.explanation_text,
           'explanation_image_url', q.explanation_image_url,
           'answers',               COALESCE(ans.answers, '[]'::jsonb),
           'key',                   CASE q.question_type
             WHEN 'short_answer' THEN jsonb_build_object(
               'canonical_answer',  q.canonical_answer,
               'accepted_synonyms', to_jsonb(q.accepted_synonyms))
             WHEN 'dialog_fill' THEN jsonb_build_object(
               'blanks', q.blanks_config)
             WHEN 'ordering' THEN jsonb_build_object(
               'correct_order', (SELECT jsonb_agg(e->>'id' ORDER BY o.idx)
                                 FROM jsonb_array_elements(q.ordering_items)
                                   WITH ORDINALITY AS o(e, idx)),
               'items', (SELECT jsonb_agg(jsonb_build_object('id', e->>'id', 'text', e->>'text')
                                          ORDER BY o.idx)
                         FROM jsonb_array_elements(q.ordering_items)
                           WITH ORDINALITY AS o(e, idx)))
             WHEN 'diagram_label' THEN jsonb_build_object(
               'answer', q.diagram_config->'answer',
               'zones',  q.diagram_config->'zones',
               'labels', q.diagram_config->'labels')
             ELSE jsonb_build_object(
               'correct_option_id', mc.correct_option_id)
           END
         ) ORDER BY cfg.ord)
  INTO v_questions
  FROM cfg
  -- No q.deleted_at filter: soft-deleted questions must still appear in the
  -- historical review of a completed session (immutable write-once
  -- config.question_ids — docs/security.md §15; docs/database.md §3 "Scoring
  -- Soft-Deleted Questions").
  JOIN questions q ON q.id = cfg.question_id
  LEFT JOIN ans ON ans.question_id = q.id
  LEFT JOIN mc_key mc ON mc.question_id = q.id;

  RETURN jsonb_build_object(
    'part1_pct',       v_p1,
    'part2_pct',       v_p2,
    'part3_pct',       v_p3,
    'passed_overall',  (v_p1 >= 75 AND v_p2 >= 75 AND v_p3 >= 75),
    'passed_per_part', jsonb_build_object(
                         'part1', v_p1 >= 75,
                         'part2', v_p2 >= 75,
                         'part3', v_p3 >= 75),
    'correct_count',   COALESCE(v_correct, 0),
    'total_questions', v_total,
    'questions',       COALESCE(v_questions, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_vfr_rt_exam_results(uuid) TO authenticated;
