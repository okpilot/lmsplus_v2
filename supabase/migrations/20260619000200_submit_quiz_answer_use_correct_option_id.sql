-- Migration 112: submit_quiz_answer reads the MC answer key from questions.correct_option_id
-- (#823, P0 security). Companion to mig 20260619000100, which relocated the MC key out of
-- options[].correct into the REVOKE-gated correct_option_id column and added a trigger that
-- strips `correct` from options on every write. Once that strip runs, the old
-- `(SELECT opt->>'id' ... WHERE (opt->>'correct')::boolean ...)` scan returns NULL, so
-- submit_quiz_answer must read q.correct_option_id instead or scoring breaks. Body copied
-- VERBATIM from its latest definition (20260610000400); the ONLY change is the
-- correctness-derivation swap. Depends on 20260619000100 (correct_option_id column).

CREATE OR REPLACE FUNCTION submit_quiz_answer(
  p_session_id        uuid,
  p_question_id       uuid,
  p_selected_option   text,
  p_response_time_ms  int
)
RETURNS TABLE (
  is_correct            boolean,
  explanation_text      text,
  explanation_image_url text,
  correct_option_id     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id           uuid := auth.uid();
  v_org_id               uuid;
  v_correct_option       text;
  v_is_correct           boolean;
  v_expl_text            text;
  v_expl_image_url       text;
  v_session_ended        boolean;
  v_config               jsonb;
  v_mode                 text;
  v_session_question_ids uuid[];
  v_options              jsonb;
  v_answer_inserted      int;
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Active-user gate: soft-deleted callers fail closed before any session
  -- read (mirrors batch_submit_quiz, mig 095c).
  PERFORM 1
  FROM users
  WHERE id = v_student_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  -- Verify session belongs to this student, is still active, and not soft-deleted
  SELECT
    qs.organization_id,
    qs.ended_at IS NOT NULL,
    qs.config,
    qs.mode
  INTO v_org_id, v_session_ended, v_config, v_mode
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  -- Practice modes only: this RPC returns is_correct / explanation /
  -- correct_option_id immediately, so accepting exam-mode sessions would be a
  -- mid-exam answer oracle. Exam submission goes exclusively through
  -- batch_submit_quiz; vfr_rt goes through submit_vfr_rt_exam_answers.
  IF v_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  IF v_session_ended THEN
    RAISE EXCEPTION 'session already completed';
  END IF;

  -- Question membership check: p_question_id must be in session config.question_ids
  IF v_config IS NULL OR v_config->'question_ids' IS NULL OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;

  v_session_question_ids := ARRAY(
    SELECT jsonb_array_elements_text(v_config->'question_ids')
  )::uuid[];

  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question does not belong to this session';
  END IF;

  -- Get correct answer, explanation, and full options array (service-level access).
  -- deleted_at filter applied here ON PURPOSE and is an intentional divergence from
  -- check_quiz_answer (mig 117): that RPC serves immediate feedback under the §15
  -- write-once carve-out and allows a soft-deleted question, but this RPC records a
  -- NEW graded answer — a soft-deleted question must not accept a fresh submission in
  -- an active session. See docs/database.md §3 "Scoring Soft-Deleted Questions".
  SELECT
    q.correct_option_id,
    q.explanation_text,
    q.explanation_image_url,
    q.options
  INTO v_correct_option, v_expl_text, v_expl_image_url, v_options
  FROM questions q
  WHERE q.id = p_question_id
    AND q.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  IF v_correct_option IS NULL THEN
    RAISE EXCEPTION 'question has no correct option';
  END IF;

  -- Validate selected option belongs to this question's options array
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_options) opt
    WHERE opt->>'id' = p_selected_option
  ) THEN
    RAISE EXCEPTION 'selected option does not belong to this question';
  END IF;

  v_is_correct := (p_selected_option = v_correct_option);

  -- Insert answer (idempotent: ignore duplicate on retry).
  INSERT INTO quiz_session_answers
    (session_id, question_id, selected_option_id, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_selected_option, v_is_correct, p_response_time_ms)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;
  GET DIAGNOSTICS v_answer_inserted = ROW_COUNT;

  -- Only persist the response log + FSRS state when THIS call actually recorded the
  -- answer. A duplicate submit (same question, possibly a different option) is a no-op
  -- on the append-only answer row above, so it must not flip fsrs_cards.last_was_correct
  -- either — otherwise the persisted answer and the FSRS "last was correct?" signal
  -- diverge (#856, CR-local). On the duplicate path, re-read the persisted is_correct so
  -- the RETURN reflects the stored answer rather than this call's option.
  IF v_answer_inserted = 0 THEN
    SELECT qsa.is_correct
    INTO v_is_correct
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id
      AND qsa.question_id = p_question_id
      AND qsa.blank_index IS NULL;
  ELSE
    -- Insert to immutable response log (idempotent)
    INSERT INTO student_responses
      (organization_id, student_id, question_id, session_id,
       selected_option_id, is_correct, response_time_ms)
    VALUES
      (v_org_id, v_student_id, p_question_id, p_session_id,
       p_selected_option, v_is_correct, p_response_time_ms)
    ON CONFLICT DO NOTHING;

    -- Update last_was_correct atomically within this transaction.
    INSERT INTO fsrs_cards (student_id, question_id, last_was_correct, updated_at)
    VALUES (v_student_id, p_question_id, v_is_correct, now())
    ON CONFLICT (student_id, question_id)
    DO UPDATE SET
      last_was_correct = EXCLUDED.last_was_correct,
      updated_at = now();
  END IF;

  RETURN QUERY SELECT v_is_correct, v_expl_text, v_expl_image_url, v_correct_option;
END;
$$;
