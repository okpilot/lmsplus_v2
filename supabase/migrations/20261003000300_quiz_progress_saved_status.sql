-- Save-for-later (#1026 PR 1b): progress helpers report a saved session as 'session_saved' / 'saved'.

CREATE OR REPLACE FUNCTION _lock_session_for_progress(
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

  IF v_row.saved_at IS NOT NULL THEN
    RAISE EXCEPTION 'session_saved';
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

-- Read-only: no lock, works for ended/discarded/saved sessions too.
CREATE OR REPLACE FUNCTION get_quiz_progress(p_session_id uuid)
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
    'status', CASE WHEN v_session.saved_at IS NOT NULL THEN 'saved'
                   WHEN v_session.deleted_at IS NOT NULL THEN 'discarded'
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
