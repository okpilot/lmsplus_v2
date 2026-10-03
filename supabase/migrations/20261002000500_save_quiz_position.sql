-- Cross-device resume (#1026) PR 1 — save_quiz_position: current index + pins, optional time for
-- the question being left (answer untouched).

CREATE FUNCTION save_quiz_position(
  p_session_id           uuid,
  p_current_index        int,
  p_pinned_question_ids  uuid[],
  p_device_id            uuid,
  p_question_id          uuid DEFAULT NULL,
  p_time_spent_ms        int  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_session quiz_sessions;
  v_ids     jsonb;
  v_pins    uuid[];
BEGIN
  v_session := _lock_session_for_progress(p_session_id, p_device_id);

  v_ids := v_session.config->'question_ids';
  IF v_ids IS NULL OR jsonb_typeof(v_ids) <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;

  IF p_current_index IS NULL OR p_current_index < 0 OR p_current_index >= v_session.total_questions THEN
    RAISE EXCEPTION 'invalid_position';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_pinned_question_ids, '{}'::uuid[])) AS pin WHERE pin IS NULL) THEN
    RAISE EXCEPTION 'question_not_in_session';
  END IF;

  v_pins := ARRAY(SELECT DISTINCT pin FROM unnest(COALESCE(p_pinned_question_ids, '{}'::uuid[])) AS pin);
  IF EXISTS (
    SELECT 1 FROM unnest(v_pins) AS pin WHERE NOT (v_ids @> to_jsonb(pin::text))
  ) THEN
    RAISE EXCEPTION 'question_not_in_session';
  END IF;

  IF (p_question_id IS NULL) <> (p_time_spent_ms IS NULL) THEN
    RAISE EXCEPTION 'invalid_time_spent';
  END IF;
  IF p_question_id IS NOT NULL THEN
    IF NOT (v_ids @> to_jsonb(p_question_id::text)) THEN
      RAISE EXCEPTION 'question_not_in_session';
    END IF;
    IF p_time_spent_ms < 0 OR p_time_spent_ms > 86400000 THEN
      RAISE EXCEPTION 'invalid_time_spent';
    END IF;
  END IF;

  UPDATE quiz_sessions qs
  SET current_index = p_current_index, pinned_question_ids = v_pins
  WHERE qs.id = p_session_id;

  IF p_question_id IS NOT NULL THEN
    INSERT INTO quiz_session_progress AS p
      (session_id, question_id, student_id, answer, time_spent_ms, answered_at, updated_at)
    VALUES
      (p_session_id, p_question_id, v_session.student_id, NULL, p_time_spent_ms, NULL, now())
    ON CONFLICT (session_id, question_id) DO UPDATE
    SET time_spent_ms = GREATEST(p.time_spent_ms, EXCLUDED.time_spent_ms),
        updated_at    = now();
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION save_quiz_position(uuid, int, uuid[], uuid, uuid, int) TO authenticated;
