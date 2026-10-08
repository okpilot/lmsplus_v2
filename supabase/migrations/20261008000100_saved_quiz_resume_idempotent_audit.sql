-- #1486: resuming your own already-open practice quiz succeeds and takes the device;
-- save / resume / discard each write one audit_events row.

CREATE OR REPLACE FUNCTION save_quiz_for_later(p_session_id uuid, p_device_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_session    quiz_sessions;
  v_saved      int;
  v_actor_role text;
BEGIN
  -- Idempotent: a retried or concurrent save of an already-saved session succeeds without touching it
  -- and writes no second audit row.
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
  -- No deleted_at filter: saved rows are soft-deleted by design (CHECK quiz_sessions_saved_requires_deleted).
  SELECT count(*) INTO v_saved
  FROM quiz_sessions qs
  WHERE qs.student_id = v_uid AND qs.saved_at IS NOT NULL;
  IF v_saved >= 20 THEN
    RAISE EXCEPTION 'saved_quiz_limit_reached';
  END IF;

  UPDATE quiz_sessions qs
  SET deleted_at = now(), saved_at = now(), active_device_id = NULL
  WHERE qs.id = v_session.id AND qs.student_id = v_uid;

  -- actor_role from a deleted_at-filtered users read (security.md rule 10).
  SELECT u.role INTO v_actor_role
  FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id)
  VALUES (v_session.organization_id, v_uid, v_actor_role, 'quiz_session.saved', 'quiz_session', v_session.id);
END;
$$;

CREATE OR REPLACE FUNCTION resume_saved_quiz(p_session_id uuid, p_device_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_session    quiz_sessions;
  v_actor_role text;
BEGIN
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'invalid_device';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- actor_role cached from the deleted_at-filtered users read (security.md rule 10).
  SELECT u.role INTO v_actor_role
  FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- No deleted_at filter: the target is a saved, soft-deleted row; an unsaved row is handled below.
  SELECT qs.* INTO v_session
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id AND qs.student_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.saved_at IS NULL THEN
    -- Already open (a stale Resume click): claim the device. Ended, discarded and non-practice rows stay refused.
    IF v_session.deleted_at IS NULL AND v_session.ended_at IS NULL
       AND v_session.mode IN ('quick_quiz', 'smart_review') THEN
      UPDATE quiz_sessions qs SET active_device_id = p_device_id
      WHERE qs.id = v_session.id AND qs.student_id = v_uid;

      INSERT INTO audit_events
        (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
      VALUES (v_session.organization_id, v_uid, v_actor_role, 'quiz_session.resumed', 'quiz_session',
              v_session.id, jsonb_build_object('already_active', true));
      RETURN;
    END IF;
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

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_session.organization_id, v_uid, v_actor_role, 'quiz_session.resumed', 'quiz_session',
          v_session.id, jsonb_build_object('already_active', false));
END;
$$;

CREATE OR REPLACE FUNCTION discard_saved_quiz(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor_role text;
  v_org_id     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- actor_role cached from the deleted_at-filtered users read (security.md rule 10).
  SELECT u.role INTO v_actor_role
  FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- The row stays soft-deleted; only the saved marker is cleared.
  UPDATE quiz_sessions qs SET saved_at = NULL
  WHERE qs.id = p_session_id AND qs.student_id = v_uid AND qs.saved_at IS NOT NULL
  RETURNING qs.organization_id INTO v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id)
  VALUES (v_org_id, v_uid, v_actor_role, 'quiz_session.saved_discarded', 'quiz_session', p_session_id);
END;
$$;
