-- Audit: record successful login events.
-- Called from /auth/login-complete server route after session verification.
-- Closes #261

CREATE OR REPLACE FUNCTION record_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Rate-limit: skip if a login event was recorded in the last 60 seconds
  IF EXISTS (
    SELECT 1 FROM audit_events
    WHERE actor_id = _uid
      AND event_type = 'student.login'
      AND created_at > now() - interval '60 seconds'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO audit_events (event_type, actor_id, metadata)
  VALUES ('student.login', _uid, jsonb_build_object('method', 'password'));
END;
$$;

-- Grant execute to authenticated users (RPC access)
GRANT EXECUTE ON FUNCTION record_login() TO authenticated;
