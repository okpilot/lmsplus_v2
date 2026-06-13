-- Migration 115: check_quiz_answer reads the MC answer key from
-- questions.correct_option_id (#823, P0 security). Companion to mig
-- 20260612000100, which relocated the key out of options[].correct and strips
-- `correct` from the options JSONB on every write. check_quiz_answer is the
-- immediate-feedback RPC for smart_review / quick_quiz (apps/web/app/app/quiz/
-- actions/check-answer.ts); without this swap its old `opt->>'correct'` scan
-- would return NULL after the strip and raise 'question not found or has no
-- correct option' on every answer check. Body based on the latest definition
-- (20260314000032); the answer-key read now uses q.correct_option_id instead of
-- the jsonb_array_elements scan. Additionally hardened (CodeRabbit, PR #856) to
-- match its sibling submit_quiz_answer (mig 110) — this RPC returns the answer
-- key immediately, so it must self-defend rather than rely on callers:
--   • active-user gate: soft-deleted callers fail closed before the session read;
--   • practice-mode guard: reject mock_exam / internal_exam so it cannot be used
--     as a mid-exam answer oracle (exam submission goes through batch_submit_quiz
--     / submit_vfr_rt_exam_answers, which never return the key mid-session);
--   • explicit question_ids-absent check (jsonb_typeof(NULL) is NULL, not 'array').
-- The §15 soft-delete carve-out on the question fetch is preserved.
-- Depends on 20260612000100.

CREATE OR REPLACE FUNCTION check_quiz_answer(
  p_question_id        uuid,
  p_selected_option_id text,
  p_session_id         uuid
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
  -- read (mirrors submit_quiz_answer / batch_submit_quiz, mig 095c/110).
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

  RETURN jsonb_build_object(
    'is_correct',           v_is_correct,
    'correct_option_id',    v_correct_option_id,
    'explanation_text',     v_explanation_text,
    'explanation_image_url', v_explanation_image
  );
END;
$$;
