-- Guards shared by the sitting RPCs: admin guard, then sitting lock (closed -> day ended order).
-- Admin guard shared by the new RPCs: returns (admin id, org, cached role).
CREATE OR REPLACE FUNCTION private.sitting_admin_guard()
RETURNS TABLE(admin_id uuid, org_id uuid, admin_role text)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_org uuid;
  v_role text;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT u.organization_id, u.role INTO v_org, v_role
    FROM public.users u WHERE u.id = v_admin AND u.deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'admin_not_found'; END IF;
  RETURN QUERY SELECT v_admin, v_org, v_role;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.sitting_admin_guard() FROM PUBLIC, anon, authenticated;

-- Locks a live sitting (FOR UPDATE); p_check_day=false skips the day-ended check.
CREATE OR REPLACE FUNCTION private.sitting_lock(p_org uuid, p_sitting_id uuid, p_check_day boolean)
RETURNS public.exam_sittings
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_s public.exam_sittings;
BEGIN
  SELECT * INTO v_s FROM public.exam_sittings s
   WHERE s.id = p_sitting_id AND s.organization_id = p_org AND s.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  IF v_s.status = 'closed' THEN RAISE EXCEPTION 'sitting_closed'; END IF;
  IF p_check_day AND private.sitting_day_ended(v_s.scheduled_at) THEN
    RAISE EXCEPTION 'sitting_day_ended';
  END IF;
  RETURN v_s;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.sitting_lock(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
