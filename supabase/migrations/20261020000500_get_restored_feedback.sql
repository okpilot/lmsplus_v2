-- #1549: get_restored_feedback — immediate feedback for every saved answer of the caller's own open
-- practice session in one read-only call (replaces N check_* round-trips on resume). Grades through
-- _answer_feedback (20261020000300). Writes nothing and takes no lock. Same practice-mode whitelist
-- as the check_* RPCs: it reveals the same keys for the same in-session questions, and only for
-- questions the caller has already answered.

CREATE OR REPLACE FUNCTION get_restored_feedback(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_config   jsonb;
  v_mode     text;
  v_ids      uuid[];
  r          record;
  v_feedback jsonb;
  v_out      jsonb[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM 1 FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- No active_device_id / session_taken_over check: same as the read sibling get_quiz_progress
  -- (20261003000300). Owner-only read that writes nothing.
  -- quiz_sessions has multiple permissive SELECT policies; the student_id predicate is mandatory
  -- (docs/security.md §3 / security.md rule 11).
  SELECT qs.config, qs.mode INTO v_config, v_mode
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_uid
    AND qs.ended_at IS NULL
    AND qs.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  IF v_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  IF v_config IS NULL OR jsonb_typeof(v_config->'question_ids') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;
  v_ids := ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  -- §15 carve-out: no deleted_at filter on questions — reached via the immutable write-once
  -- quiz_sessions.config.question_ids (trg_quiz_sessions_immutable_columns); docs/security.md §15,
  -- docs/database.md §3 "Scoring Soft-Deleted Questions".
  FOR r IN
    SELECT pr.question_id, pr.answer, q AS qrow
    FROM quiz_session_progress pr
    JOIN questions q ON q.id = pr.question_id
    WHERE pr.session_id = p_session_id
      AND pr.student_id = v_uid
      AND pr.answer IS NOT NULL
      AND pr.question_id = ANY(v_ids)
    ORDER BY pr.updated_at, pr.question_id
  LOOP
    IF NOT COALESCE(_validate_progress_answer(r.answer, (r.qrow).question_type), false) THEN
      RAISE WARNING '[get_restored_feedback] question % skipped: answer shape does not match question type', r.question_id;
      CONTINUE;
    END IF;
    BEGIN
      v_feedback := _answer_feedback(r.qrow, r.answer);
    EXCEPTION WHEN raise_exception OR data_exception OR integrity_constraint_violation THEN
      -- A row that cannot be graded is skipped (mirrors _grade_session_progress).
      RAISE WARNING '[get_restored_feedback] question % skipped: %', r.question_id, SQLERRM;
      CONTINUE;
    END;
    v_out := array_append(v_out, v_feedback || jsonb_build_object(
      'question_id',   r.question_id,
      'question_type', (r.qrow).question_type
    ));
  END LOOP;

  RETURN jsonb_build_object('feedback', to_jsonb(v_out));
END;
$$;

REVOKE EXECUTE ON FUNCTION get_restored_feedback(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_restored_feedback(uuid) TO authenticated;

COMMENT ON FUNCTION get_restored_feedback(uuid) IS
  'Read-only: feedback (is_correct + revealed key + explanation) for each saved answer of the caller''s open practice session, graded through _answer_feedback. Pure read: no writes, no locks.';
