-- Layer 1: server-authoritative overdue exam enforcement.
-- Adds complete_overdue_exam_session and replaces start_exam_session to:
--   1. Return started_at so clients compute remaining time deterministically.
--   2. Auto-complete an overdue same-subject session before raising
--      "already in progress" — browser-crash exits no longer dodge the deadline.
-- Mirror: packages/db/migrations/050_layer1_overdue_enforcement.sql
-- Layer 2 (periodic sweeper) tracked under issue #558.

-- complete_overdue_exam_session: closes a mock_exam session past its deadline.
-- Computes score from existing quiz_session_answers (partial answers honoured).
-- Idempotent on already-ended sessions. Caller must only invoke for sessions
-- that are actually overdue — the function RAISEs otherwise (defense-in-depth).

CREATE OR REPLACE FUNCTION complete_overdue_exam_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id     uuid := auth.uid();
  v_org_id         uuid;
  v_ended_at       timestamptz;
  v_total          int;
  v_mode           text;
  v_started_at     timestamptz;
  v_time_limit     int;
  v_config         jsonb;
  v_pass_mark      int;
  v_answered       int;
  v_correct_count  int;
  v_score          numeric(5,2);
  v_passed         boolean;
  v_reason         text;
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

  -- Ownership + org-scope + soft-delete guard, with row lock
  SELECT qs.ended_at, qs.total_questions, qs.mode,
         qs.started_at, qs.time_limit_seconds, qs.config
  INTO v_ended_at, v_total, v_mode, v_started_at, v_time_limit, v_config
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.organization_id = v_org_id
    AND qs.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not accessible';
  END IF;
  IF v_mode <> 'mock_exam' THEN
    RAISE EXCEPTION 'session is not a mock exam';
  END IF;

  -- Idempotent: already completed — return the real stored result.
  IF v_ended_at IS NOT NULL THEN
    SELECT qs.correct_count, qs.score_percentage, qs.passed,
           (SELECT count(*)::int FROM quiz_session_answers WHERE session_id = p_session_id)
    INTO v_correct_count, v_score, v_passed, v_answered
    FROM quiz_sessions qs
    WHERE qs.id = p_session_id;
    RETURN jsonb_build_object(
      'session_id',       p_session_id,
      'score_percentage', COALESCE(v_score, 0),
      'passed',           COALESCE(v_passed, false),
      'total_questions',  v_total,
      'answered_count',   COALESCE(v_answered, 0)
    );
  END IF;

  -- Overdue invariant — caller must not auto-complete an active session.
  IF v_time_limit IS NULL OR v_started_at IS NULL THEN
    RAISE EXCEPTION 'session has no deadline to enforce';
  END IF;
  IF now() <= v_started_at + (v_time_limit || ' seconds')::interval THEN
    RAISE EXCEPTION 'session is not overdue';
  END IF;

  -- Score from existing answers (mirrors batch_submit_quiz mock_exam branch).
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE qsa.is_correct)::int
  INTO v_answered, v_correct_count
  FROM quiz_session_answers qsa
  WHERE qsa.session_id = p_session_id;

  v_score := CASE WHEN v_total > 0
                  THEN round((v_correct_count::numeric / v_total) * 100, 2)
                  ELSE 0 END;

  -- pass_mark NOT NULL by CHECK constraint; COALESCE guards the defensive NULL
  -- branch (matches batch_submit_quiz semantics).
  v_pass_mark := (v_config->>'pass_mark')::int;
  v_passed := COALESCE(v_pass_mark IS NOT NULL AND v_score >= v_pass_mark, false);
  IF v_answered < v_total THEN  -- incomplete exam auto-fails (batch_submit parity)
    v_passed := false;
  END IF;

  UPDATE quiz_sessions
  SET ended_at = now(),
      correct_count = v_correct_count,
      score_percentage = v_score,
      passed = v_passed
  WHERE id = p_session_id;

  -- actor_role subquery filters deleted_at IS NULL per security.md rule 10 / #550
  -- (audit-row subqueries are independent SELECTs; the outer guard does NOT cover them).
  v_reason := CASE WHEN v_answered > 0
                   THEN 'overdue_with_answers'
                   ELSE 'overdue_zero_answers' END;

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_student_id,
    (SELECT role FROM users WHERE id = v_student_id AND deleted_at IS NULL),
    'exam.expired', 'quiz_session', p_session_id,
    jsonb_build_object(
      'total_questions', v_total,
      'answered_count',  v_answered,
      'correct_count',   v_correct_count,
      'score',           v_score,
      'passed',          v_passed,
      'reason',          v_reason
    )
  );

  RETURN jsonb_build_object(
    'session_id',       p_session_id,
    'score_percentage', v_score,
    'passed',           v_passed,
    'total_questions',  v_total,
    'answered_count',   v_answered
  );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_overdue_exam_session(uuid) TO authenticated;

-- start_exam_session — REPLACE. Builds on 20260413000001 (NULLS LAST). Adds:
--   1. 'started_at' to the return jsonb (server-authoritative deadline base).
--   2. Auto-complete of overdue same-subject session before duplicate guard.

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

  -- Auto-complete an overdue same-subject session before re-checking the
  -- duplicate-active guard. Catches browser-crash exits during an exam.
  SELECT id INTO v_old_session_id
  FROM quiz_sessions
  WHERE student_id = v_student_id
    AND subject_id = p_subject_id
    AND mode = 'mock_exam'
    AND ended_at IS NULL
    AND deleted_at IS NULL
    AND time_limit_seconds IS NOT NULL
    AND started_at IS NOT NULL
    AND now() > started_at + (time_limit_seconds || ' seconds')::interval
  LIMIT 1;
  IF v_old_session_id IS NOT NULL THEN
    PERFORM complete_overdue_exam_session(v_old_session_id);
  END IF;

  -- Duplicate active session guard (post-auto-complete).
  IF EXISTS (
    SELECT 1 FROM quiz_sessions
    WHERE student_id = v_student_id
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

  -- NULLS LAST: subtopic-specific rows first, topic-level catch-all last.
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

-- Pin the grant explicitly (the original 20260411000003 relied on Postgres defaults).
GRANT EXECUTE ON FUNCTION start_exam_session(uuid) TO authenticated;
