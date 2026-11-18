-- One-day sitting helpers. Day = UTC date of scheduled_at.
CREATE OR REPLACE FUNCTION private.sitting_day_end(p_scheduled_at timestamptz)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT (((p_scheduled_at AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC')
$$;
REVOKE EXECUTE ON FUNCTION private.sitting_day_end(timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sitting_day_ended(p_scheduled_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT now() >= private.sitting_day_end(p_scheduled_at)
$$;
REVOKE EXECUTE ON FUNCTION private.sitting_day_ended(timestamptz) FROM PUBLIC, anon, authenticated;

-- Last instant of the sitting day: codes expire here ("until 23:59 UTC").
CREATE OR REPLACE FUNCTION private.sitting_code_expiry(p_scheduled_at timestamptz)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT private.sitting_day_end(p_scheduled_at) - interval '1 microsecond'
$$;
REVOKE EXECUTE ON FUNCTION private.sitting_code_expiry(timestamptz) FROM PUBLIC, anon, authenticated;
