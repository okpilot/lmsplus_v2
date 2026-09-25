-- Migration: users login-instructions columns + record_login_instructions_sent
-- RPC (login-instructions-email feature, PR A).
--
-- Two nullable columns on public.users:
--   login_instructions_sent_at — last login-instructions send. NULL = never sent.
--   temp_password_expires_at   — expiry of the temporary password.
--                                 NULL = none recorded; < now() = expired.
--
-- record_login_instructions_sent(p_user_id) stamps both columns on a
-- send. It follows the same guard set as the sibling admin-audit RPC
-- record_internal_exam_code_emailed (mig 20260629000900, security.md
-- rule 11b/11c):
--   rule 7 auth.uid() null-check, is_admin() gate, active-user gate +
--   rule 9 (org/role in one deleted_at-filtered read, cached role reused
--   in the audit INSERT per rule 10), row-guarded UPDATE re-asserting
--   org + deleted_at + role scope, SET search_path = public.
-- No self-callable clear RPC exists: a caller clearing the flag without
-- actually changing the password would let a temporary password persist
-- past a "password set" UI state.
--
-- `authenticated` keeps UPDATE on `full_name` only (mig 20260606000006),
-- so a direct client UPDATE cannot touch either new column; this RPC is
-- SECURITY DEFINER and the only in-app writer. trg_protect_users_sensitive_columns
-- (mig 20260316000041) fires only on role/organization_id/deleted_at, so it
-- does not apply to this UPDATE.

ALTER TABLE public.users
  ADD COLUMN login_instructions_sent_at timestamptz,
  ADD COLUMN temp_password_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.record_login_instructions_sent(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id    uuid := auth.uid();
  v_admin_org   uuid;
  v_admin_role  text;
  v_expires     timestamptz;
  v_rows        int;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  -- Capture org AND role together in one deleted_at-filtered read at
  -- authorization time (active-user gate). The cached role is reused in
  -- the audit INSERT below so a mid-call soft-delete of the admin row
  -- cannot NULL-abort an already-authorised action (audit_events.actor_role
  -- is NOT NULL). Do NOT inline a (SELECT u.role ...) subquery (mig 087).
  SELECT u.organization_id, u.role INTO v_admin_org, v_admin_role
  FROM public.users u
  WHERE u.id = v_admin_id AND u.deleted_at IS NULL;
  IF v_admin_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  -- Row-guarded UPDATE: PK + admin's org + not soft-deleted + student/instructor
  -- only (never another admin). Covers cross-org, soft-deleted/deactivated,
  -- admin-target, and unknown-id targets in one guard, all hidden behind
  -- user_not_found (existence-hiding, no new error mapping). RETURNING the
  -- stamped expiry avoids a second read for the audit metadata.
  UPDATE public.users
  SET login_instructions_sent_at = now(),
      temp_password_expires_at = now() + interval '7 days'
  WHERE id = p_user_id
    AND organization_id = v_admin_org
    AND deleted_at IS NULL
    AND role IN ('student', 'instructor')
  RETURNING temp_password_expires_at INTO v_expires;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Audit. Cached v_admin_role reused; no inline subquery (rule 10).
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_admin_org,
    v_admin_id,
    v_admin_role,
    'user.login_instructions_sent',
    'user',
    p_user_id,
    jsonb_build_object('expires_at', v_expires)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_login_instructions_sent(uuid) TO authenticated;
