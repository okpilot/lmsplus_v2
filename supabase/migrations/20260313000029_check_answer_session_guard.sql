-- 029_check_answer_session_guard.sql
-- Fix: add p_session_id parameter to check_quiz_answer RPC and verify session
-- ownership before returning the correct option. Prevents direct REST API calls
-- from obtaining correct answers without an active session.

-- Must DROP first because we're changing the function signature (adding p_session_id)
DROP FUNCTION IF EXISTS check_quiz_answer(uuid, text);

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
  v_correct_option_id text;
  v_explanation_text  text;
  v_explanation_image text;
  v_is_correct        boolean;
BEGIN
  -- Auth guard
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Session ownership: verify the student owns an active session containing this question
  IF NOT EXISTS (
    SELECT 1 FROM quiz_sessions qs
    WHERE qs.id = p_session_id
      AND qs.student_id = v_student_id
      AND qs.ended_at IS NULL
      AND qs.deleted_at IS NULL
      AND qs.config->'question_ids' ? p_question_id::text
  ) THEN
    RAISE EXCEPTION 'question not in an active session owned by this student';
  END IF;

  -- Fetch correct option and explanation (never returns the full options array)
  SELECT
    (SELECT opt->>'id'
       FROM jsonb_array_elements(q.options) opt
      WHERE (opt->>'correct')::boolean
      LIMIT 1),
    q.explanation_text,
    q.explanation_image_url
  INTO v_correct_option_id, v_explanation_text, v_explanation_image
  FROM questions q
  WHERE q.id = p_question_id
    AND q.deleted_at IS NULL;

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
