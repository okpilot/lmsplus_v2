-- Migration 086: add a DB-level array-length cap to start_quiz_session (#275).
--
-- The Zod layer in apps/web/app/app/quiz/actions/start.ts caps p_question_ids
-- at 500 entries (count: z.number().int().min(1).max(500)), but Zod is only
-- reached when the call flows through the Next.js Server Action. A direct
-- authenticated RPC call bypasses Zod entirely, leaving the database open to
-- resource exhaustion: an attacker can pass an arbitrarily large uuid[] that
-- forces a full unnest, a COUNT(DISTINCT), and a JOIN against questions —
-- unbounded work per call (red-team Vector R, issue #275).
--
-- Fix: immediately after the existing `no_questions_provided` (NULL/empty)
-- guard, raise `too_many_questions` if array_length > 500. The cap value of 500
-- is intentionally identical to the Zod max so both layers enforce the same
-- boundary. The guard runs BEFORE the expensive unnest/JOIN operations so the
-- defence is O(1).
--
-- Function body otherwise tracks the canonical latest definition,
-- 20260521000001_start_quiz_session_null_guard.sql (the mode NULL-guard fix),
-- with only the length-cap guard added. The packages/db mirror previously lagged
-- at 081 (mode whitelist without NULL guard); this migration also converges the
-- mirror to the null-guard body. Two-dir mirror: byte-identical to
-- supabase/migrations/20260606000002_start_quiz_session_question_cap.sql.

CREATE OR REPLACE FUNCTION start_quiz_session(
  p_mode         text,
  p_subject_id   uuid,
  p_topic_id     uuid,
  p_question_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_role text;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Whitelist: only student-facing practice modes are permitted here.
  -- mock_exam => start_exam_session; internal_exam => start_internal_exam_session.
  -- NULL must be rejected explicitly: Postgres 3-valued logic returns NULL for
  -- `NULL NOT IN (...)`, and `IF NULL THEN` is false, so omitting the IS NULL
  -- check would let a NULL p_mode bypass the guard and reach the active-user
  -- gate — leaking an auth-passed timing/error signal before failing at INSERT.
  IF p_mode IS NULL OR p_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'mode_not_allowed';
  END IF;

  SELECT organization_id, role
  INTO v_org_id, v_role
  FROM users
  WHERE id = v_uid
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_questions_provided';
  END IF;

  -- DB-level cap: reject arrays larger than 500. Mirrors the Zod max in the
  -- Server Action (count: z.number().int().min(1).max(500)). Runs before the
  -- expensive unnest/DISTINCT/JOIN operations so the guard is O(1).
  IF array_length(p_question_ids, 1) > 500 THEN
    RAISE EXCEPTION 'too_many_questions';
  END IF;

  -- Reject duplicate UUIDs. unnest + JOIN below would silently double-count
  -- and pass the COUNT equality check, then create an inconsistent session.
  SELECT count(DISTINCT qid) INTO v_count
  FROM unnest(p_question_ids) AS qid;
  IF v_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;

  -- Verify every UUID resolves to an active, in-org, non-deleted question
  -- matching the (subject, topic) scope. NULL p_subject_id / p_topic_id =>
  -- smart_review; corresponding match is skipped, org + active + soft-delete
  -- always apply.
  SELECT count(*) INTO v_count
  FROM unnest(p_question_ids) AS qid
  JOIN public.questions q ON q.id = qid
  WHERE q.organization_id = v_org_id
    AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
    AND (p_topic_id   IS NULL OR q.topic_id   = p_topic_id)
    AND q.status = 'active'
    AND q.deleted_at IS NULL;

  IF v_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;

  INSERT INTO quiz_sessions
    (organization_id, student_id, mode, subject_id, topic_id,
     config, total_questions)
  VALUES (
    v_org_id,
    v_uid,
    p_mode,
    p_subject_id,
    p_topic_id,
    jsonb_build_object('question_ids', to_jsonb(p_question_ids)),
    array_length(p_question_ids, 1)
  )
  RETURNING id INTO v_session_id;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id)
  VALUES (
    v_org_id,
    v_uid,
    v_role,
    'quiz_session.started',
    'quiz_session',
    v_session_id
  );

  RETURN v_session_id;
END;
$$;
