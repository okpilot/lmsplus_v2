-- Migration 100: submit_vfr_rt_exam_answers(p_session_id, p_answers) — atomic VFR RT
-- mock-exam grader (#697 Phase A, task A.7). Calls normalize_answer(text), defined in
-- mig 101 (same release; plpgsql resolves at execution). Full contract incl. error
-- codes: design.md § Migration 100. Security citations (§3/§7/rule 10) are inline below.
-- Input (jsonb array, flat per blank; entries MAY carry optional "response_time_ms",
-- digits, defaults 0 — the column is NOT NULL on both answer tables):
--   { "question_id": uuid, "selected_option_id": "a".."d" }              -- Part 3 multiple_choice
--   { "question_id": uuid, "response_text": text }                       -- Part 1 short_answer
--   { "question_id": uuid, "blank_index": int, "response_text": text }   -- Part 2 dialog_fill (one per blank)
-- Grading: per-part pcts over the frozen config.question_ids denominators (8/9/8
-- default; unanswered scores 0); passed_overall = all three parts >= 75;
-- score_percentage = mean(p1,p2,p3), informational only; correct_count counts correct
-- ROWS (per blank). normalize_answer matches canonical or any synonym; empty never matches.
-- Timer-expiry guard (design.md § Migration 100 step 3b): a submit past time_limit_seconds
-- + 30s grace EXPIRES the session ('vfr_rt_exam.expired' audit event, zeroed result with
-- 'expired': true) instead of grading — parity with batch_submit_quiz (mig 20260601000001).
-- Idempotency: ended_at already set → per-part pcts recomputed from persisted rows,
-- correct_count/passed re-read from the session row, prior result returned; no writes.

CREATE OR REPLACE FUNCTION public.submit_vfr_rt_exam_answers(
  p_session_id uuid,
  p_answers    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- caller / session state
  v_student_id uuid := auth.uid();
  v_actor_role text; v_org_id uuid; v_total int; v_config jsonb;
  v_ended_at timestamptz; v_correct_count int; v_passed boolean; v_already_ended boolean;
  v_time_limit int; v_started_at timestamptz;
  v_session_question_ids uuid[];
  -- per-entry loop state
  v_answer jsonb; v_qid_text text; v_question_id uuid;
  v_selected text; v_response_text text; v_blank_text text; v_blank_index int; v_rt_text text;
  v_qtype text; v_canonical text; v_synonyms text[]; v_options jsonb; v_blanks jsonb;
  v_correct_option text; v_blank_canonical text; v_blank_synonyms text[];
  v_norm text; v_is_correct boolean;
  -- per-part results
  v_p1 numeric(5,2); v_p2 numeric(5,2); v_p3 numeric(5,2); v_score numeric(5,2);
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Cache actor role in a single deleted_at-filtered read; reused by the audit
  -- INSERT below (security.md rule 10 via the cached-role pattern, migs 087/088).
  SELECT u.role INTO v_actor_role
  FROM users u
  WHERE u.id = v_student_id AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- Explicit ownership scope: quiz_sessions has multiple permissive SELECT
  -- policies, so the student_id predicate is mandatory (docs/security.md §3).
  SELECT qs.organization_id, qs.total_questions, qs.config, qs.ended_at,
         qs.correct_count, qs.passed, qs.time_limit_seconds, qs.started_at
  INTO v_org_id, v_total, v_config, v_ended_at, v_correct_count, v_passed,
       v_time_limit, v_started_at
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.mode = 'vfr_rt_exam'
    AND qs.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found_or_not_accessible';
  END IF;

  v_already_ended := (v_ended_at IS NOT NULL);

  -- Timer-expiry guard (design.md § Migration 100 step 3b; pattern parity with
  -- batch_submit_quiz, mig 20260601000001 L99-125): a submit arriving past the
  -- time limit + 30s grace expires the session instead of grading it.
  IF NOT v_already_ended AND v_time_limit IS NOT NULL AND v_started_at IS NOT NULL THEN
    IF now() > v_started_at + (v_time_limit + 30) * interval '1 second' THEN
      UPDATE quiz_sessions
      SET ended_at = now(), correct_count = 0, score_percentage = 0, passed = false
      WHERE id = p_session_id;
      INSERT INTO audit_events
        (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
      VALUES (
        v_org_id, v_student_id, v_actor_role,
        'vfr_rt_exam.expired', 'quiz_session', p_session_id,
        jsonb_build_object('total_questions', v_total, 'answered_count', 0, 'correct_count', 0,
                           'passed', false, 'reason', 'submission past grace period')
      );
      RETURN jsonb_build_object(
        'session_id', p_session_id,
        'part1_pct', 0, 'part2_pct', 0, 'part3_pct', 0,
        'passed_overall', false, 'correct_count', 0,
        'total_questions', v_total, 'expired', true
      );
    END IF;
  END IF;

  IF v_config IS NULL OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;
  v_session_question_ids := ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  IF NOT v_already_ended THEN
    IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array'
       OR jsonb_array_length(p_answers) = 0 THEN
      RAISE EXCEPTION 'invalid_answers_payload';
    END IF;

    -- One entry per (question_id, blank_index) — blank_index NULL for MC/short.
    IF (
      SELECT count(*) <> count(DISTINCT lower(coalesce(e->>'question_id', '')) || '#' || coalesce(e->>'blank_index', ''))
      FROM jsonb_array_elements(p_answers) AS e
    ) THEN
      RAISE EXCEPTION 'duplicate_answer_entry';
    END IF;

    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
    LOOP
      IF jsonb_typeof(v_answer) <> 'object' THEN
        RAISE EXCEPTION 'invalid_answer_entry' USING DETAIL = 'entry is not an object';
      END IF;

      v_qid_text      := v_answer->>'question_id';
      v_selected      := v_answer->>'selected_option_id';
      v_response_text := v_answer->>'response_text';
      v_blank_text    := v_answer->>'blank_index';
      v_blank_index   := NULL;
      v_rt_text       := coalesce(v_answer->>'response_time_ms', '0');

      IF v_qid_text IS NULL OR v_qid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'invalid_answer_entry' USING DETAIL = format('bad question_id: %s', coalesce(v_qid_text, 'NULL'));
      END IF;
      IF v_rt_text !~ '^\d{1,9}$' THEN
        RAISE EXCEPTION 'invalid_answer_entry' USING DETAIL = format('bad response_time_ms for question %s', v_qid_text);
      END IF;
      v_question_id := v_qid_text::uuid;

      IF NOT (v_question_id = ANY(v_session_question_ids)) THEN
        RAISE EXCEPTION 'invalid_question_id_for_session' USING DETAIL = format('question %s is not part of session %s', v_question_id, p_session_id);
      END IF;

      -- Frozen-ID read: IDs come from the write-once quiz_sessions.config.question_ids,
      -- so the immutable write-once exception applies — no deleted_at filter here
      -- (docs/security.md §15; same posture as batch_submit_quiz's question reads).
      SELECT q.question_type, q.canonical_answer, q.accepted_synonyms, q.options, q.blanks_config
      INTO v_qtype, v_canonical, v_synonyms, v_options, v_blanks
      FROM questions q
      WHERE q.id = v_question_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'question_not_found' USING DETAIL = format('question %s', v_question_id);
      END IF;

      IF v_qtype = 'multiple_choice' THEN
        IF v_selected IS NULL OR v_response_text IS NOT NULL OR v_blank_text IS NOT NULL THEN
          RAISE EXCEPTION 'answer_type_mismatch' USING DETAIL = format('question %s is multiple_choice; entry must carry only selected_option_id', v_question_id);
        END IF;
        v_correct_option := (
          SELECT opt->>'id' FROM jsonb_array_elements(v_options) opt
          WHERE (opt->>'correct')::boolean LIMIT 1
        );
        IF v_correct_option IS NULL THEN
          RAISE EXCEPTION 'question_missing_correct_option' USING DETAIL = format('question %s', v_question_id);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_options) opt WHERE opt->>'id' = v_selected
        ) THEN
          RAISE EXCEPTION 'invalid_option_for_question' USING DETAIL = format('option %s does not belong to question %s', v_selected, v_question_id);
        END IF;
        v_is_correct := (v_selected = v_correct_option);

      ELSIF v_qtype = 'short_answer' THEN
        IF v_response_text IS NULL OR v_selected IS NOT NULL OR v_blank_text IS NOT NULL THEN
          RAISE EXCEPTION 'answer_type_mismatch' USING DETAIL = format('question %s is short_answer; entry must carry only response_text', v_question_id);
        END IF;
        v_norm := normalize_answer(v_response_text);
        v_is_correct := (v_norm <> '' AND (
          v_norm = COALESCE(normalize_answer(v_canonical), '')
          OR EXISTS (SELECT 1 FROM unnest(v_synonyms) AS s WHERE normalize_answer(s) = v_norm)
        ));

      ELSIF v_qtype = 'dialog_fill' THEN
        IF v_response_text IS NULL OR v_selected IS NOT NULL OR v_blank_text IS NULL THEN
          RAISE EXCEPTION 'answer_type_mismatch' USING DETAIL = format('question %s is dialog_fill; entry must carry response_text and blank_index', v_question_id);
        END IF;
        IF v_blank_text !~ '^\d{1,4}$' THEN
          RAISE EXCEPTION 'invalid_blank_index' USING DETAIL = format('bad blank_index %s for question %s', v_blank_text, v_question_id);
        END IF;
        v_blank_index := v_blank_text::int;
        SELECT b->>'canonical', ARRAY(SELECT jsonb_array_elements_text(b->'synonyms'))
        INTO v_blank_canonical, v_blank_synonyms
        FROM jsonb_array_elements(v_blanks) AS b
        WHERE (b->>'index')::int = v_blank_index;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'invalid_blank_index' USING DETAIL = format('blank_index %s not in blanks_config of question %s', v_blank_index, v_question_id);
        END IF;
        v_norm := normalize_answer(v_response_text);
        v_is_correct := (v_norm <> '' AND (
          v_norm = COALESCE(normalize_answer(v_blank_canonical), '')
          OR EXISTS (SELECT 1 FROM unnest(v_blank_synonyms) AS s WHERE normalize_answer(s) = v_norm)
        ));

      ELSE
        RAISE EXCEPTION 'unsupported_question_type' USING DETAIL = format('question %s has question_type %s', v_question_id, coalesce(v_qtype, 'NULL'));
      END IF;

      INSERT INTO quiz_session_answers
        (session_id, question_id, selected_option_id, response_text, blank_index, is_correct, response_time_ms)
      VALUES
        (p_session_id, v_question_id, v_selected, v_response_text, v_blank_index, v_is_correct, v_rt_text::int)
      ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

      INSERT INTO student_responses
        (organization_id, student_id, question_id, session_id,
         selected_option_id, response_text, blank_index, is_correct, response_time_ms)
      VALUES
        (v_org_id, v_student_id, v_question_id, p_session_id,
         v_selected, v_response_text, v_blank_index, v_is_correct, v_rt_text::int)
      ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;
    END LOOP;
  END IF;

  -- Per-part scores from persisted rows — single source of truth for both the
  -- fresh path and the idempotent re-read. Frozen-ID questions read carries the
  -- immutable write-once exception (docs/security.md §15) — no deleted_at filter.
  WITH session_questions AS (
    SELECT q.id, q.question_type,
           CASE WHEN q.question_type = 'dialog_fill'
                THEN greatest(jsonb_array_length(q.blanks_config), 1)
                ELSE 1 END AS total_blanks
    FROM questions q
    WHERE q.id = ANY(v_session_question_ids)
  ),
  graded AS (
    SELECT qsa.question_id, count(*) FILTER (WHERE qsa.is_correct)::int AS correct_rows
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id
    GROUP BY qsa.question_id
  )
  SELECT
    coalesce(round(100.0 * count(*) FILTER (WHERE sq.question_type = 'short_answer' AND coalesce(g.correct_rows, 0) >= 1)
             / nullif(count(*) FILTER (WHERE sq.question_type = 'short_answer'), 0), 2), 0),
    coalesce(round(100.0 * avg(LEAST(coalesce(g.correct_rows, 0)::numeric / sq.total_blanks, 1))
             FILTER (WHERE sq.question_type = 'dialog_fill'), 2), 0),
    coalesce(round(100.0 * count(*) FILTER (WHERE sq.question_type = 'multiple_choice' AND coalesce(g.correct_rows, 0) >= 1)
             / nullif(count(*) FILTER (WHERE sq.question_type = 'multiple_choice'), 0), 2), 0)
  INTO v_p1, v_p2, v_p3
  FROM session_questions sq
  LEFT JOIN graded g ON g.question_id = sq.id;

  IF v_already_ended THEN
    -- Idempotent replay: return the previously-computed result; write nothing.
    v_correct_count := coalesce(v_correct_count, 0);
    v_passed        := coalesce(v_passed, false);
  ELSE
    SELECT count(*) FILTER (WHERE qsa.is_correct)::int INTO v_correct_count
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id;

    v_passed := (v_p1 >= 75 AND v_p2 >= 75 AND v_p3 >= 75);
    v_score  := round((v_p1 + v_p2 + v_p3) / 3, 2);

    UPDATE quiz_sessions
    SET ended_at         = now(),
        correct_count    = v_correct_count,
        score_percentage = v_score,
        passed           = v_passed
    WHERE id = p_session_id;

    INSERT INTO audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (
      v_org_id, v_student_id, v_actor_role,
      'vfr_rt_exam.completed', 'quiz_session', p_session_id,
      jsonb_build_object(
        'part1_pct', v_p1,
        'part2_pct', v_p2,
        'part3_pct', v_p3,
        'passed_overall', v_passed,
        'total_questions', v_total
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'part1_pct', v_p1,
    'part2_pct', v_p2,
    'part3_pct', v_p3,
    'passed_overall', v_passed,
    'correct_count', v_correct_count,
    'total_questions', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_vfr_rt_exam_answers(uuid, jsonb) TO authenticated;
