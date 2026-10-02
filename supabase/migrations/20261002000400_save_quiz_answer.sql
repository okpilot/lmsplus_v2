-- Cross-device resume (#1026) PR 1 — save_quiz_answer: store one answer (latest wins), time = GREATEST.

CREATE FUNCTION save_quiz_answer(
  p_session_id    uuid,
  p_question_id   uuid,
  p_answer        jsonb,
  p_time_spent_ms int,
  p_device_id     uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_session quiz_sessions;
  v_ids     jsonb;
  v_qtype   text;
BEGIN
  v_session := _lock_session_for_progress(p_session_id, p_device_id);

  v_ids := v_session.config->'question_ids';
  IF v_ids IS NULL OR jsonb_typeof(v_ids) <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;
  IF p_question_id IS NULL OR NOT (v_ids @> to_jsonb(p_question_id::text)) THEN
    RAISE EXCEPTION 'question_not_in_session';
  END IF;

  IF p_time_spent_ms IS NULL OR p_time_spent_ms < 0 OR p_time_spent_ms > 86400000 THEN
    RAISE EXCEPTION 'invalid_time_spent';
  END IF;

  -- §15 carve-out: no deleted_at filter. The question is reached via an id proven to be in the
  -- write-once quiz_sessions.config.question_ids (frozen by trg_quiz_sessions_immutable_columns),
  -- so a question soft-deleted mid-session stays answerable. docs/database.md §3 "Scoring
  -- Soft-Deleted Questions".
  SELECT q.question_type INTO v_qtype FROM questions q WHERE q.id = p_question_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_in_session';
  END IF;

  IF p_answer IS NULL OR octet_length(p_answer::text) > 8192
     OR NOT _validate_progress_answer(p_answer, v_qtype) THEN
    RAISE EXCEPTION 'invalid_answer';
  END IF;

  PERFORM _save_progress_row(p_session_id, p_question_id, v_session.student_id,
                             p_answer, p_time_spent_ms, p_device_id);
END;
$$;
GRANT EXECUTE ON FUNCTION save_quiz_answer(uuid, uuid, jsonb, int, uuid) TO authenticated;
