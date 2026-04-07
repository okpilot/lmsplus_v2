-- Fix: add is_admin() check and GRANT EXECUTE to get_admin_report_correct_options
-- Mirrors the pattern in migrations 000001, 000002, 000003 for admin RPCs.
-- Without is_admin(), any authenticated org member (including students) could
-- call this RPC and retrieve correct answers for completed sessions.

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
    (opt.value->>'id')::text AS correct_option_id
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  CROSS JOIN LATERAL jsonb_array_elements(q.options) WITH ORDINALITY AS opt(value, ord)
  WHERE sa.session_id = p_session_id
    AND (opt.value->>'correct')::boolean = true
  ORDER BY sa.question_id, opt.ord;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_report_correct_options(uuid) TO authenticated;
