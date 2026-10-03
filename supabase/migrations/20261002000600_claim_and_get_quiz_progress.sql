-- Cross-device resume (#1026) PR 1 — claim_quiz_session (takeover) + get_quiz_progress (read).

CREATE FUNCTION claim_quiz_session(p_session_id uuid, p_device_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_session quiz_sessions;
BEGIN
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'invalid_device';
  END IF;
  -- Takeover: every guard except the device check.
  v_session := _lock_session_for_progress(p_session_id, p_device_id, false);
  UPDATE quiz_sessions qs SET active_device_id = p_device_id WHERE qs.id = v_session.id;
END;
$$;
GRANT EXECUTE ON FUNCTION claim_quiz_session(uuid, uuid) TO authenticated;

-- Read-only: no lock, works for ended/discarded sessions too. Carries no answer key or correctness.
CREATE FUNCTION get_quiz_progress(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_session quiz_sessions;
  v_answers jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM 1 FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  SELECT qs.* INTO v_session
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id AND qs.student_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'question_id',   pr.question_id,
           'answer',        pr.answer,
           'time_spent_ms', pr.time_spent_ms,
           'answered_at',   pr.answered_at
         ) ORDER BY pr.updated_at, pr.question_id), '[]'::jsonb)
  INTO v_answers
  FROM quiz_session_progress pr
  WHERE pr.session_id = p_session_id AND pr.student_id = v_uid;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_session.deleted_at IS NOT NULL THEN 'discarded'
                   WHEN v_session.ended_at IS NOT NULL THEN 'ended'
                   ELSE 'open' END,
    'mode', v_session.mode,
    'current_index', v_session.current_index,
    'pinned_question_ids', to_jsonb(v_session.pinned_question_ids),
    'active_device_id', v_session.active_device_id,
    'answers', v_answers
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_quiz_progress(uuid) TO authenticated;
