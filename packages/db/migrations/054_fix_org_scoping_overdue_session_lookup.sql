-- Fix CR id 3152802436: start_exam_session (mig 052) had two same-subject
-- session lookups filtered only by student_id + subject_id. A user who
-- transferred organisations could match an old session from the previous
-- org and either trigger a stale auto-complete or get the duplicate-active
-- guard error, blocking the new org's exam start.
--
-- Sites updated (REPLACE; migrations are immutable):
--   1. Stale-session lookup (mig 052 lines 179-189) — adds organization_id filter.
--   2. Duplicate-active EXISTS guard (mig 052 lines 194-201) — adds organization_id filter.
--
-- Function body otherwise identical to mig 052; mirror in supabase/migrations.

CREATE OR REPLACE FUNCTION start_exam_session(p_subject_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id      uuid := auth.uid();
  v_org_id          uuid;
  v_config_id       uuid;
  v_total_questions int;
  v_time_limit      int;
  v_pass_mark       int;
  v_dist            record;
  v_selected_ids    uuid[] := '{}';
  v_topic_ids       uuid[];
  v_session_id      uuid;
  v_started_at      timestamptz;
  v_old_session_id  uuid;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = v_student_id AND deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  -- Auto-complete a same-subject session past the +30s grace window before
  -- re-checking the duplicate-active guard. Threshold matches batch_submit_quiz
  -- so a session within grace can still submit normally.
  -- organization_id filter (CR 3152802436) prevents matching a session from a
  -- previous org if the user was transferred.
  SELECT id INTO v_old_session_id
  FROM quiz_sessions
  WHERE student_id = v_student_id
    AND organization_id = v_org_id
    AND subject_id = p_subject_id
    AND mode = 'mock_exam'
    AND ended_at IS NULL
    AND deleted_at IS NULL
    AND time_limit_seconds IS NOT NULL
    AND started_at IS NOT NULL
    AND now() > started_at + ((time_limit_seconds + 30) || ' seconds')::interval
  LIMIT 1;
  IF v_old_session_id IS NOT NULL THEN
    PERFORM complete_overdue_exam_session(v_old_session_id);
  END IF;

  -- organization_id filter (CR 3152802436) — same reason as above.
  IF EXISTS (
    SELECT 1 FROM quiz_sessions
    WHERE student_id = v_student_id
      AND organization_id = v_org_id
      AND subject_id = p_subject_id
      AND mode = 'mock_exam'
      AND ended_at IS NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'an exam session is already in progress for this subject';
  END IF;

  SELECT ec.id, ec.total_questions, ec.time_limit_seconds, ec.pass_mark
  INTO v_config_id, v_total_questions, v_time_limit, v_pass_mark
  FROM exam_configs ec
  WHERE ec.organization_id = v_org_id
    AND ec.subject_id = p_subject_id
    AND ec.enabled = true
    AND ec.deleted_at IS NULL;
  IF v_config_id IS NULL THEN
    RAISE EXCEPTION 'no exam configuration found for this subject';
  END IF;

  FOR v_dist IN
    SELECT ecd.topic_id, ecd.subtopic_id, ecd.question_count
    FROM exam_config_distributions ecd
    WHERE ecd.exam_config_id = v_config_id
    ORDER BY ecd.topic_id, ecd.subtopic_id NULLS LAST
  LOOP
    v_topic_ids := ARRAY(
      SELECT q.id
      FROM questions q
      WHERE q.subject_id = p_subject_id
        AND q.topic_id = v_dist.topic_id
        AND (v_dist.subtopic_id IS NULL OR q.subtopic_id = v_dist.subtopic_id)
        AND q.status = 'active'
        AND q.deleted_at IS NULL
        AND q.organization_id = v_org_id
        AND q.id != ALL(v_selected_ids)
      ORDER BY random()
      LIMIT v_dist.question_count
    );
    IF array_length(v_topic_ids, 1) IS NULL OR array_length(v_topic_ids, 1) < v_dist.question_count THEN
      RAISE EXCEPTION 'not enough active questions for topic % (subtopic %). Need %, found %',
        v_dist.topic_id,
        COALESCE(v_dist.subtopic_id::text, 'any'),
        v_dist.question_count,
        COALESCE(array_length(v_topic_ids, 1), 0);
    END IF;
    v_selected_ids := v_selected_ids || v_topic_ids;
  END LOOP;

  IF array_length(v_selected_ids, 1) != v_total_questions THEN
    RAISE EXCEPTION 'distribution total (%) does not match configured total_questions (%)',
      array_length(v_selected_ids, 1), v_total_questions;
  END IF;

  INSERT INTO quiz_sessions
    (organization_id, student_id, mode, subject_id,
     config, total_questions, time_limit_seconds)
  VALUES (
    v_org_id, v_student_id, 'mock_exam', p_subject_id,
    jsonb_build_object(
      'question_ids',   to_jsonb(v_selected_ids),
      'exam_config_id', v_config_id,
      'pass_mark',      v_pass_mark
    ),
    v_total_questions, v_time_limit
  )
  RETURNING id, started_at INTO v_session_id, v_started_at;

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_student_id,
    (SELECT role FROM users WHERE id = v_student_id AND deleted_at IS NULL),
    'exam.started', 'quiz_session', v_session_id,
    jsonb_build_object(
      'subject_id',         p_subject_id,
      'total_questions',    v_total_questions,
      'time_limit_seconds', v_time_limit,
      'pass_mark',          v_pass_mark
    )
  );

  RETURN jsonb_build_object(
    'session_id',         v_session_id,
    'question_ids',       to_jsonb(v_selected_ids),
    'time_limit_seconds', v_time_limit,
    'total_questions',    v_total_questions,
    'pass_mark',          v_pass_mark,
    'started_at',         v_started_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION start_exam_session(uuid) TO authenticated;
