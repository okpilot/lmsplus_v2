-- Migration 123: submit_quiz_answer adopts the §15 frozen-config soft-delete
-- carve-out (#855). Drops the `AND q.deleted_at IS NULL` filter on the questions
-- lookup so a question that was valid at session start stays submittable even if
-- an admin soft-deletes it mid-session — matching its siblings check_quiz_answer
-- (mig 117) and batch_submit_quiz (migs 120/121), which already read `questions`
-- without the filter under the same carve-out.
--
-- Why this is safe: membership is verified immediately above (p_question_id must be
-- in quiz_sessions.config.question_ids, locked write-once at session start by
-- trg_quiz_sessions_immutable_columns, mig 079). The accessible question set is
-- therefore bounded by the caller-owned session's immutable config — a soft-deleted
-- question can only be reached if it was already a member, so dropping the filter
-- exposes nothing the session didn't already authorize. See docs/security.md §15 and
-- docs/database.md §3 "Scoring Soft-Deleted Questions".
--
-- Previously (mig 112) submit_quiz_answer filtered deleted_at to reject a fresh
-- submission on a mid-session-deleted question, but that diverged from check_quiz_answer:
-- a student could get correct/incorrect feedback via check_quiz_answer on a question that
-- submit_quiz_answer would then refuse to record. Option 1 of #855 (carve-out both, this
-- migration) aligns the pair on the frozen-config posture.
--
-- Based on the latest definition (mig 112, 20260619000200); the ONLY change is the
-- removal of the question-lookup deleted_at filter + its comment. The session lookup
-- KEEPS `qs.deleted_at IS NULL` (the session is owner-scoped, not frozen-config) and
-- the active-user gate is unchanged.

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
  -- §15 carve-out (same posture as check_quiz_answer mig 117 / batch_submit_quiz):
  -- NO deleted_at filter — the question is reached only via the immutable write-once
  -- quiz_sessions.config.question_ids (membership verified above; locked at session
  -- start by trg_quiz_sessions_immutable_columns, mig 079), so a question soft-deleted
  -- mid-session stays submittable for the bounded, caller-owned session set. Aligns
  -- with check_quiz_answer's immediate-feedback posture (#855). See docs/security.md
  -- §15 and docs/database.md §3 "Scoring Soft-Deleted Questions".
  SELECT
    q.correct_option_id,
    q.explanation_text,
    q.explanation_image_url,
    q.options
  INTO v_correct_option, v_expl_text, v_expl_image_url, v_options
  FROM questions q
  WHERE q.id = p_question_id;

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

-- Re-assert the student EXECUTE grant explicitly, consistent with the sibling
-- relocated RPCs (batch_submit_quiz 112b, submit_vfr_rt 113, report RPCs 114,
-- check_quiz_answer 117). CREATE OR REPLACE preserves the existing grant, so this
-- is belt-and-suspenders: it keeps the grant in the migration record should the
-- function ever be DROP+CREATEd (security-auditor MEDIUM, #856).
GRANT EXECUTE ON FUNCTION submit_quiz_answer(uuid, uuid, text, int) TO authenticated;
