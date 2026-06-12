-- Migration 112: report RPCs read the MC answer key from questions.correct_option_id
-- (#823, P0 security). Companion to mig 20260612000100, which relocated the MC key out of
-- options[].correct into the REVOKE-gated correct_option_id column and strips `correct`
-- from options on every write. Once that strip runs, the old CROSS JOIN LATERAL scan on
-- options returns nothing, so get_report_correct_options and get_admin_report_correct_options
-- must read q.correct_option_id directly. Bodies copied VERBATIM from their latest
-- definitions (get_report_correct_options: 20260316231503; get_admin_report_correct_options:
-- 20260406000006); the ONLY change is collapsing the LATERAL-scan correct-option derivation
-- to a direct q.correct_option_id (the DISTINCT ON / CROSS JOIN LATERAL / WHERE correct
-- machinery is no longer needed — one key per question lives in the column). All ownership,
-- soft-delete, ended_at, org, and is_admin guards are preserved. Depends on 20260612000100
-- (correct_option_id column).

-- DISTINCT ON (sa.question_id) is retained to dedupe repeated answers for the
-- same question within a session; the value is deterministic because every
-- duplicate sa row for a question maps to the same q.correct_option_id. No
-- q.deleted_at filter: soft-deleted questions must still appear in historical
-- reports for completed sessions (the session's answers constrain the set).
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
