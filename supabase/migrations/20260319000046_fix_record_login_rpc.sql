-- Fix: record_login() was missing NOT NULL columns (organization_id, actor_role, resource_type).
-- The INSERT would fail with a constraint violation on every call.

CREATE OR REPLACE FUNCTION record_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    UUID := auth.uid();
  _org_id UUID;
  _role   TEXT;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Look up the user's org and role for audit columns
  SELECT organization_id, role INTO _org_id, _role
  FROM users WHERE id = _uid;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
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

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, metadata)
  VALUES (
    _org_id, _uid, _role, 'student.login', 'session',
    jsonb_build_object('method', 'password')
  );
END;
$$;
