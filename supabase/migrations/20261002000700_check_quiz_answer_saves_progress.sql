-- Cross-device resume (#1026) PR 1: check_quiz_answer also saves progress. Body, guards, tokens and
-- return payload identical to 20260619000700; the only additions are the trailing params
-- p_device_id / p_time_spent_ms (defaulted: old callers keep working) and the validated
-- _save_progress_row call after grading.
-- Signature changes, so DROP the old one and re-grant.

DROP FUNCTION check_quiz_answer(uuid, text, uuid);

CREATE FUNCTION check_quiz_answer(
  p_question_id        uuid,
  p_selected_option_id text,
  p_session_id         uuid,
  p_device_id          uuid DEFAULT NULL,
  p_time_spent_ms      int  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id        uuid := auth.uid();
  v_config            jsonb;
  v_mode              text;
  v_correct_option_id text;
  v_explanation_text  text;
  v_explanation_image text;
  v_is_correct        boolean;
  v_session_question_ids uuid[];
BEGIN
  -- Auth guard
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Active-user gate: soft-deleted callers fail closed before any session
  -- read (mirrors submit_quiz_answer / batch_submit_quiz, mig 095c/112).
  PERFORM 1
  FROM users
  WHERE id = v_student_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  -- Session ownership: verify the student owns an active session
  SELECT qs.config, qs.mode
  INTO v_config, v_mode
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.ended_at IS NULL
    AND qs.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not owned by this student';
  END IF;

  -- Practice modes only: this RPC returns is_correct / explanation /
  -- correct_option_id immediately, so accepting exam-mode sessions would be a
  -- mid-exam answer oracle. Exam submission goes exclusively through
  -- batch_submit_quiz; vfr_rt goes through submit_vfr_rt_exam_answers.
  IF v_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  -- Guard against malformed config (matches pattern in batch_submit_quiz).
  -- jsonb_typeof(v_config->'question_ids') is NULL when the key is absent, and
  -- NULL <> 'array' is NULL (not true) — so the explicit IS NULL check is
  -- required or jsonb_array_elements_text below would run on a missing key.
  IF v_config IS NULL
     OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;

  -- Verify question belongs to this session
  v_session_question_ids := ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];
  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question % does not belong to session %', p_question_id, p_session_id;
  END IF;

  -- Fetch correct option and explanation.
  -- §15 carve-out (same posture as batch_submit_quiz): no deleted_at filter — the
  -- question is fetched via the immutable write-once quiz_sessions.config.question_ids
  -- (membership verified above; locked at session start by
  -- trg_quiz_sessions_immutable_columns, mig 079), so a question soft-deleted
  -- mid-session must still be answerable for immediate feedback. See docs/security.md
  -- §15 and docs/database.md §3 "Scoring Soft-Deleted Questions".
  -- The MC key now lives in questions.correct_option_id (#823), not options[].correct.
  SELECT
    q.correct_option_id,
    q.explanation_text,
    q.explanation_image_url
  INTO v_correct_option_id, v_explanation_text, v_explanation_image
  FROM questions q
  WHERE q.id = p_question_id;

  IF NOT FOUND OR v_correct_option_id IS NULL THEN
    RAISE EXCEPTION 'question not found or has no correct option';
  END IF;

  v_is_correct := (p_selected_option_id = v_correct_option_id);

  -- Cross-device resume (#1026): persist the graded answer in the same call, after every guard and
  -- grading step. A NULL selection (viewed, unanswered) writes nothing. A malformed answer raises
  -- invalid_answer; session_taken_over / invalid_time_spent also raise here. A raise rolls back the
  -- whole call, so a graded result is never returned for a refused save.
  IF p_selected_option_id IS NOT NULL THEN
    IF NOT COALESCE(
         _validate_progress_answer(
           jsonb_build_object('selected_option_id', p_selected_option_id), 'multiple_choice'),
         false) THEN
      RAISE EXCEPTION 'invalid_answer';
    END IF;
    PERFORM _save_progress_row(
      p_session_id, p_question_id, v_student_id,
      jsonb_build_object('selected_option_id', p_selected_option_id),
      p_time_spent_ms, p_device_id
    );
  END IF;

  RETURN jsonb_build_object(
    'is_correct',           v_is_correct,
    'correct_option_id',    v_correct_option_id,
    'explanation_text',     v_explanation_text,
    'explanation_image_url', v_explanation_image
  );
END;
$$;

-- A re-created function loses its old grants; re-grant on the new signature.
GRANT EXECUTE ON FUNCTION check_quiz_answer(uuid, text, uuid, uuid, int) TO authenticated;
