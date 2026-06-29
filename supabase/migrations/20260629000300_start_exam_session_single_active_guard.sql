-- Migration 138: start_exam_session — add the single-active-session guard
-- (#1011). At most one active session per student across ALL modes (mig 136).
--
-- Source body: start_exam_session LATEST = mig 088 (lineage 040 → 042 → 046 →
-- 050 → 052 → 054 → 088; no later redefinition, confirmed by grep). Copied
-- VERBATIM; the ONLY change is the new guard block inserted after the
-- auto-complete-overdue step and BEFORE the existing same-subject EXISTS guard.
-- Self-exclusion = same-subject mock_exam, so a same-subject re-start still
-- yields the specific 'already in progress for this subject' message, while a
-- DIFFERENT active session (any other mode, or mock_exam for another subject)
-- yields 'another_session_active'. The existing uq_active_exam_session
-- unique_violation handler is preserved. SECURITY DEFINER + search_path kept.

CREATE OR REPLACE FUNCTION start_exam_session(p_subject_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id      uuid := auth.uid();
  v_org_id          uuid;
  v_role            text;
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

  -- Resolve student org AND cache role in a single deleted_at-filtered read.
  -- v_role is reused in the audit INSERT below (Change A2 / #734):
  -- a mid-call soft-delete of the student row would cause the inline subquery
  -- `(SELECT role FROM users …)` to return NULL, aborting the RPC with a
  -- NOT NULL constraint violation on audit_events.actor_role and rolling back
  -- the already-created session. Caching here prevents that.
  SELECT organization_id, role INTO v_org_id, v_role
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

  -- Single-active-session invariant (#1011, mig 136): at most one active session
  -- per student across all modes.
  -- (1) An abandoned ephemeral Discovery row never blocks — auto-clear it.
  UPDATE quiz_sessions SET deleted_at = now()
   WHERE student_id = v_student_id AND mode = 'discovery'
     AND ended_at IS NULL AND deleted_at IS NULL;
  -- (2) Block on any OTHER active session this call will not itself resume.
  -- Same-subject mock_exam is self-excluded so the precise same-subject guard
  -- below still yields its specific message.
  IF EXISTS (
    SELECT 1 FROM quiz_sessions qs
     WHERE qs.student_id = v_student_id
       AND qs.ended_at IS NULL AND qs.deleted_at IS NULL
       AND NOT (qs.mode = 'mock_exam' AND qs.subject_id = p_subject_id)
  ) THEN
    RAISE EXCEPTION 'another_session_active';
  END IF;

  -- Pre-INSERT guard: cheap fast path that yields a clean error in normal flow.
  -- The schema-level partial unique index (uq_active_exam_session, established in
  -- mig 088) is the concurrency-safe source of truth; see the EXCEPTION handler
  -- around the INSERT below.
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

  IF COALESCE(array_length(v_selected_ids, 1), 0) != v_total_questions THEN
    RAISE EXCEPTION 'distribution total (%) does not match configured total_questions (%)',
      COALESCE(array_length(v_selected_ids, 1), 0), v_total_questions;
  END IF;

  -- Insert session. Race-safe: the partial unique index on
  -- (student_id, organization_id, subject_id) WHERE mode='mock_exam'
  -- AND ended_at IS NULL AND deleted_at IS NULL (established in mig 088)
  -- catches concurrent INSERTs that both passed the EXISTS guard.
  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- The conflict can come from EITHER the same-subject mock_exam partial index
    -- (uq_active_exam_session) OR the global single-active index
    -- (uq_one_active_session_per_student, mig 136) — a DIFFERENT active session
    -- could win the global race after the pre-check guard. Only raise the
    -- same-subject message when a same-subject mock_exam active row actually
    -- exists; otherwise it was a different active session.
    IF EXISTS (
      SELECT 1 FROM quiz_sessions qs
       WHERE qs.student_id = v_student_id
         AND qs.organization_id = v_org_id
         AND qs.subject_id = p_subject_id
         AND qs.mode = 'mock_exam'
         AND qs.ended_at IS NULL
         AND qs.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'an exam session is already in progress for this subject';
    END IF;
    RAISE EXCEPTION 'another_session_active';
  END;

  -- Audit. v_role cached above — see security.md §10.
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_student_id,
    v_role,
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
