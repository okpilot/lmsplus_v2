-- Save-for-later RPCs (#1026 PR 1b). All SECURITY DEFINER, student_id-scoped (security.md rule 11).

-- The advisory key hashtext(student_id::text) is shared with enforce_draft_limit (20260430000011):
-- harmless (advisory, no inverse lock order), the two caps stay independent.
CREATE FUNCTION save_quiz_for_later(p_session_id uuid, p_device_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_session quiz_sessions;
  v_saved   int;
BEGIN
  -- Idempotent: a retried or concurrent save of an already-saved session succeeds without touching it.
  BEGIN
    v_session := _lock_session_for_progress(p_session_id, p_device_id);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'session_saved' THEN
      RETURN;
    END IF;
    RAISE;
  END;

  IF v_session.mode NOT IN ('quick_quiz', 'smart_review') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));
  SELECT count(*) INTO v_saved
  FROM quiz_sessions qs
  WHERE qs.student_id = v_uid AND qs.saved_at IS NOT NULL;
  IF v_saved >= 20 THEN
    RAISE EXCEPTION 'saved_quiz_limit_reached';
  END IF;

  UPDATE quiz_sessions qs
  SET deleted_at = now(), saved_at = now(), active_device_id = NULL
  WHERE qs.id = v_session.id AND qs.student_id = v_uid;
END;
$$;
GRANT EXECUTE ON FUNCTION save_quiz_for_later(uuid, uuid) TO authenticated;

CREATE FUNCTION resume_saved_quiz(p_session_id uuid, p_device_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_session quiz_sessions;
BEGIN
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'invalid_device';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM 1 FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  SELECT qs.* INTO v_session
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id AND qs.student_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.saved_at IS NULL THEN
    RAISE EXCEPTION 'session_not_saved';
  END IF;

  -- An abandoned ephemeral Discovery row never blocks (parity with every start RPC).
  UPDATE quiz_sessions qs SET deleted_at = now()
  WHERE qs.student_id = v_uid AND qs.mode = 'discovery'
    AND qs.ended_at IS NULL AND qs.deleted_at IS NULL;

  -- uq_one_active_session_per_student (non-deferrable UNIQUE) is the single arbiter for another open session.
  BEGIN
    UPDATE quiz_sessions qs
    SET deleted_at = NULL, saved_at = NULL, active_device_id = p_device_id
    WHERE qs.id = v_session.id AND qs.student_id = v_uid;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'another_session_active';
  END;
END;
$$;
GRANT EXECUTE ON FUNCTION resume_saved_quiz(uuid, uuid) TO authenticated;

CREATE FUNCTION discard_saved_quiz(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM 1 FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- The row stays soft-deleted; only the saved marker is cleared.
  UPDATE quiz_sessions qs SET saved_at = NULL
  WHERE qs.id = p_session_id AND qs.student_id = v_uid AND qs.saved_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION discard_saved_quiz(uuid) TO authenticated;
