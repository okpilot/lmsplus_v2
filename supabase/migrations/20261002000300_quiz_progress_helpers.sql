-- Cross-device resume (#1026) PR 1 — internal helpers. EXECUTE revoked from PUBLIC/anon/authenticated:
-- reachable only from the SECURITY DEFINER RPCs that wrap them.

-- Answer shape per question type (keys + types only; grading re-validates contents).
CREATE FUNCTION _validate_progress_answer(p_answer jsonb, p_question_type text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE
  v_keys text[];
BEGIN
  IF p_answer IS NULL OR jsonb_typeof(p_answer) <> 'object' THEN
    RETURN false;
  END IF;
  SELECT array_agg(k ORDER BY k) INTO v_keys FROM jsonb_object_keys(p_answer) AS k;
  IF v_keys IS NULL THEN
    RETURN false;
  END IF;

  IF p_question_type = 'multiple_choice' THEN
    RETURN v_keys = ARRAY['selected_option_id'] AND (p_answer->>'selected_option_id') ~ '^[a-d]$';
  ELSIF p_question_type = 'short_answer' THEN
    RETURN v_keys = ARRAY['response_text'] AND jsonb_typeof(p_answer->'response_text') = 'string';
  ELSIF p_question_type = 'dialog_fill' THEN
    RETURN v_keys = ARRAY['blanks'] AND jsonb_typeof(p_answer->'blanks') = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_answer->'blanks') AS e
        WHERE NOT CASE WHEN jsonb_typeof(e) = 'object' THEN
          COALESCE((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e) AS k)
                   = ARRAY['blank_index', 'response_text'], false)
          AND jsonb_typeof(e->'blank_index') = 'number'
          AND (e->>'blank_index') ~ '^\d{1,4}$'
          AND jsonb_typeof(e->'response_text') = 'string'
        ELSE false END
      );
  ELSIF p_question_type = 'ordering' THEN
    RETURN v_keys = ARRAY['order'] AND jsonb_typeof(p_answer->'order') = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_answer->'order') AS e
        WHERE jsonb_typeof(e) <> 'string'
      );
  ELSIF p_question_type = 'diagram_label' THEN
    RETURN v_keys = ARRAY['mapping'] AND jsonb_typeof(p_answer->'mapping') = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_answer->'mapping') AS e
        WHERE NOT CASE WHEN jsonb_typeof(e) = 'object' THEN
          COALESCE((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e) AS k)
                   = ARRAY['label_id', 'zone_id'], false)
          AND jsonb_typeof(e->'zone_id') = 'string'
          AND jsonb_typeof(e->'label_id') = 'string'
        ELSE false END
      );
  END IF;
  RETURN false;
END;
$$;
REVOKE EXECUTE ON FUNCTION _validate_progress_answer(jsonb, text) FROM PUBLIC, anon, authenticated;

-- Shared guard set for every progress write. Locks the session row. p_check_device = false lets
-- claim_quiz_session skip the device check (takeover).
CREATE FUNCTION _lock_session_for_progress(
  p_session_id   uuid,
  p_device_id    uuid,
  p_check_device boolean DEFAULT true
)
RETURNS quiz_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row quiz_sessions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM 1 FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- quiz_sessions has multiple permissive SELECT policies: student_id predicate is mandatory (security.md rule 11).
  SELECT qs.* INTO v_row
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id AND qs.student_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  IF v_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'session_discarded';
  END IF;
  IF v_row.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'session_ended';
  END IF;

  IF v_row.mode NOT IN ('quick_quiz', 'smart_review', 'mock_exam', 'internal_exam', 'vfr_rt_exam') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  -- 30 s grace, parity with batch_submit_quiz (20260702000600).
  IF v_row.time_limit_seconds IS NOT NULL AND v_row.started_at IS NOT NULL
     AND now() > v_row.started_at + (v_row.time_limit_seconds + 30) * interval '1 second' THEN
    RAISE EXCEPTION 'session_expired';
  END IF;

  IF p_check_device AND v_row.active_device_id IS NOT NULL
     AND p_device_id IS DISTINCT FROM v_row.active_device_id THEN
    RAISE EXCEPTION 'session_taken_over';
  END IF;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION _lock_session_for_progress(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Upsert one progress row. For callers that already validated the session and question membership
-- (the check RPCs); re-locks the open session row and enforces the device rule.
CREATE FUNCTION _save_progress_row(
  p_session_id    uuid,
  p_question_id   uuid,
  p_student_id    uuid,
  p_answer        jsonb,
  p_time_spent_ms int,
  p_device_id     uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_device_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_student_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF p_answer IS NULL OR octet_length(p_answer::text) > 8192 THEN
    RAISE EXCEPTION 'invalid_answer';
  END IF;
  IF p_time_spent_ms IS NOT NULL AND (p_time_spent_ms < 0 OR p_time_spent_ms > 86400000) THEN
    RAISE EXCEPTION 'invalid_time_spent';
  END IF;

  SELECT qs.active_device_id INTO v_device_id
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id AND qs.student_id = v_uid
    AND qs.ended_at IS NULL AND qs.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  IF v_device_id IS NOT NULL AND p_device_id IS DISTINCT FROM v_device_id THEN
    RAISE EXCEPTION 'session_taken_over';
  END IF;

  INSERT INTO quiz_session_progress AS p
    (session_id, question_id, student_id, answer, time_spent_ms, answered_at, updated_at)
  VALUES
    (p_session_id, p_question_id, v_uid, p_answer, COALESCE(p_time_spent_ms, 0), now(), now())
  ON CONFLICT (session_id, question_id) DO UPDATE
  SET answer        = EXCLUDED.answer,
      time_spent_ms = GREATEST(p.time_spent_ms, EXCLUDED.time_spent_ms),
      answered_at   = now(),
      updated_at    = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION _save_progress_row(uuid, uuid, uuid, jsonb, int, uuid) FROM PUBLIC, anon, authenticated;
