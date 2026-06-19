-- Migration 114: report RPCs read the MC answer key from questions.correct_option_id
-- (#823, P0 security). Companion to mig 20260619000100, which relocated the MC key out of
-- options[].correct into the REVOKE-gated correct_option_id column and strips `correct`
-- from options on every write. Once that strip runs, the old CROSS JOIN LATERAL scan on
-- options returns nothing, so get_report_correct_options and get_admin_report_correct_options
-- must read q.correct_option_id directly. Bodies copied VERBATIM from their latest
-- definitions (get_report_correct_options: 20260316231503; get_admin_report_correct_options:
-- 20260406000006); the ONLY change is collapsing the LATERAL-scan correct-option derivation
-- to a direct q.correct_option_id (the DISTINCT ON / CROSS JOIN LATERAL / WHERE correct
-- machinery is no longer needed — one key per question lives in the column). All ownership,
-- soft-delete, ended_at, org, and is_admin guards are preserved. Depends on 20260619000100
-- (correct_option_id column).

-- DISTINCT ON (sa.question_id) is retained to dedupe repeated answers for the
-- same question within a session; the value is deterministic because every
-- duplicate sa row for a question maps to the same q.correct_option_id.
-- §15 carve-out: no q.deleted_at filter on the questions JOIN. quiz_session_answers
-- is immutable (append-only — no UPDATE/DELETE policies; resubmits are ON CONFLICT
-- DO NOTHING), so sa.question_id is a write-once FK: the question set is bounded by
-- the student's actual answers in a completed session (ended_at IS NOT NULL), not by
-- the deleted-at predicate. A question soft-deleted after it was answered must still
-- reveal its key in that historical report. See docs/security.md §15 and
-- docs/database.md §3 "Scoring Soft-Deleted Questions".
CREATE OR REPLACE FUNCTION get_report_correct_options(p_session_id uuid)
RETURNS TABLE (question_id uuid, correct_option_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Active-user gate: a soft-deleted caller with a still-valid JWT must not keep reading
  -- the MC answer key for their completed sessions. Mirrors check_quiz_answer (mig 117)
  -- and the admin sibling below, which gates via its org lookup (#856, CR-local).
  PERFORM 1
  FROM users
  WHERE id = auth.uid()
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM quiz_sessions
    WHERE id = p_session_id
      AND student_id = auth.uid()
      AND ended_at IS NOT NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Session not found, not owned, or not completed';
  END IF;

  -- Ownership verified above via EXISTS on quiz_sessions.
  -- This SECURITY DEFINER function bypasses RLS — do not remove the guard.
  RETURN QUERY
  SELECT DISTINCT ON (sa.question_id)
    sa.question_id,
    q.correct_option_id
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  WHERE sa.session_id = p_session_id
  ORDER BY sa.question_id;
END;
$$;

-- Re-assert the student EXECUTE grant explicitly (CREATE OR REPLACE preserves the
-- prior grant, but make it survive a future DROP+CREATE and mirror the admin RPC).
GRANT EXECUTE ON FUNCTION public.get_report_correct_options(uuid) TO authenticated;

-- RPC: get_admin_report_correct_options
-- Allows admins to retrieve correct options for any completed quiz session
-- within their organization. Mirrors get_report_correct_options but uses
-- organization_id ownership instead of student_id ownership.
CREATE OR REPLACE FUNCTION get_admin_report_correct_options(p_session_id uuid)
RETURNS TABLE (question_id uuid, correct_option_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Look up the caller's organization_id
  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  -- Verify the session exists, belongs to the caller's org, and is completed
  IF NOT EXISTS (
    SELECT 1 FROM quiz_sessions
    WHERE id = p_session_id
      AND organization_id = v_org_id
      AND ended_at IS NOT NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Session not found, not in caller org, or not completed';
  END IF;

  -- §15 carve-out (same as get_report_correct_options above): no q.deleted_at
  -- filter — sa.question_id is a write-once FK on the immutable quiz_session_answers
  -- table, so the question set is bounded by the answered, completed session, not by
  -- deleted_at. See docs/security.md §15 and docs/database.md §3.
  RETURN QUERY
  SELECT DISTINCT ON (sa.question_id)
    sa.question_id,
    q.correct_option_id
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  WHERE sa.session_id = p_session_id
  ORDER BY sa.question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_report_correct_options(uuid) TO authenticated;
