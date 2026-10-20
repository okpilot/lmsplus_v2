-- #1549: check_non_mc_answer grades through _answer_feedback (20261020000300) instead of carrying its
-- own copy of the per-type grading. Signature, guards, guard order, tokens, return payloads and the
-- progress save are unchanged from 20261002000800; the per-type NULL / other-param checks stay here,
-- the array-type checks are the helper's (same token).

CREATE OR REPLACE FUNCTION check_non_mc_answer(
  p_question_id   uuid,
  p_session_id    uuid,
  p_response_text text  DEFAULT NULL,
  p_blank_answers jsonb DEFAULT NULL,
  p_order         jsonb DEFAULT NULL,
  p_mapping       jsonb DEFAULT NULL,
  p_device_id     uuid  DEFAULT NULL,
  p_time_spent_ms int   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id           uuid := auth.uid();
  v_config               jsonb;
  v_mode                 text;
  v_session_question_ids uuid[];
  v_q                    public.questions;
  v_answer               jsonb;
  v_result               jsonb;
BEGIN
  -- ── 1. Auth guard ────────────────────────────────────────────────────────
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- ── 2. Active-caller gate ────────────────────────────────────────────────
  PERFORM 1
  FROM users
  WHERE id = v_student_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- ── 3. Session ownership ─────────────────────────────────────────────────
  -- quiz_sessions has multiple permissive SELECT policies; the student_id
  -- predicate is mandatory (docs/security.md §3 / security.md rule 11).
  SELECT qs.config, qs.mode
  INTO v_config, v_mode
  FROM quiz_sessions qs
  WHERE qs.id         = p_session_id
    AND qs.student_id = v_student_id
    AND qs.ended_at   IS NULL
    AND qs.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not owned by this student';
  END IF;

  -- ── 4. Practice-mode whitelist ───────────────────────────────────────────
  IF v_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  -- ── 5. Config-shape guard ────────────────────────────────────────────────
  IF v_config IS NULL
     OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;

  -- ── 6. Membership check — MUST precede any answer-key column read ────────
  v_session_question_ids :=
    ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question % does not belong to session %',
      p_question_id, p_session_id;
  END IF;

  -- ── 7. Fetch question row (answer-key columns) ───────────────────────────
  -- §15 carve-out: no deleted_at filter — question reached via the immutable
  -- write-once quiz_sessions.config.question_ids (membership verified above).
  -- docs/security.md §15, docs/database.md §3.
  SELECT q.* INTO v_q FROM questions q WHERE q.id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_found';
  END IF;

  -- ── 8. Reject multiple_choice ─────────────────────────────────────────────
  IF v_q.question_type = 'multiple_choice' THEN
    RAISE EXCEPTION 'unsupported_question_type';
  END IF;

  -- ── 9. Per-type param shape, then grade through the shared helper ─────────
  IF v_q.question_type = 'short_answer' THEN
    IF p_response_text IS NULL OR p_blank_answers IS NOT NULL OR p_order IS NOT NULL
       OR p_mapping IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

  ELSIF v_q.question_type = 'dialog_fill' THEN
    IF p_blank_answers IS NULL OR p_response_text IS NOT NULL OR p_order IS NOT NULL
       OR p_mapping IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

  ELSIF v_q.question_type = 'ordering' THEN
    IF p_order IS NULL OR p_response_text IS NOT NULL OR p_blank_answers IS NOT NULL
       OR p_mapping IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

  ELSIF v_q.question_type = 'diagram_label' THEN
    IF p_mapping IS NULL OR p_response_text IS NOT NULL OR p_blank_answers IS NOT NULL
       OR p_order IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;
  END IF;

  -- The stored answer shape (_validate_progress_answer), built from the raw params. An unknown
  -- question_type yields NULL and is rejected by the helper.
  v_answer := CASE v_q.question_type
    WHEN 'short_answer'  THEN jsonb_build_object('response_text', p_response_text)
    WHEN 'dialog_fill'   THEN jsonb_build_object('blanks', p_blank_answers)
    WHEN 'ordering'      THEN jsonb_build_object('order', p_order)
    WHEN 'diagram_label' THEN jsonb_build_object('mapping', p_mapping)
  END;

  v_result := _answer_feedback(v_q, v_answer);

  -- ── 10. Cross-device resume (#1026): persist the graded answer in the same call ─
  -- Runs after every guard and grading step, so every pre-existing token fires first. Also raises
  -- session_taken_over / invalid_answer (> 128 KiB) / invalid_time_spent. A raise rolls back the
  -- whole call, so a graded result is never returned for a refused save.
  IF NOT COALESCE(_validate_progress_answer(v_answer, v_q.question_type), false) THEN
    RAISE EXCEPTION 'invalid_answer';
  END IF;
  PERFORM _save_progress_row(
    p_session_id, p_question_id, v_student_id, v_answer, p_time_spent_ms, p_device_id
  );

  RETURN v_result;
END;
$$;

-- Re-state the grant (CREATE OR REPLACE keeps it). Do NOT include answer-key columns in any
-- separate column-level grant.
GRANT EXECUTE ON FUNCTION check_non_mc_answer(uuid, uuid, text, jsonb, jsonb, jsonb, uuid, int) TO authenticated;
