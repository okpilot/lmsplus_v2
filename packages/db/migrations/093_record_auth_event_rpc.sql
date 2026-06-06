-- Migration 093: record_auth_event() — audit coverage for auth-related Server Actions (#379).
--
-- All audit_events writes must go through a SECURITY DEFINER RPC (the table has an
-- audit_no_direct_insert policy: FOR INSERT WITH CHECK false). Today only the
-- SECURITY DEFINER quiz/exam RPCs and record_login write audit rows; no Server
-- Action does. This adds a generic record_auth_event() the auth Server Actions call
-- after a successful mutation:
--   * changePassword       -> 'user.password_changed' (self-service; any authenticated user)
--   * resetStudentPassword -> 'user.password_reset'   (admin)
--   * deactivateStudent    -> 'user.deactivated'      (admin)
--   * createStudent        -> 'user.created'          (admin)
--
-- Security model (the RPC is EXECUTE-granted to authenticated, so it must be
-- self-defending against forged events):
--   * actor_id / actor_role are derived from auth.uid() via a deleted_at-filtered
--     users lookup (security.md §7 + §10) — never from caller input.
--   * event_type is whitelisted. The self-service event forces resource_id = actor.
--     The admin events require the caller's role to be 'admin'. (No resource users
--     re-SELECT: it would need a §9 deleted_at filter that rejects the deactivate
--     audit whose target is already soft-deleted; the audit row's org is always the
--     actor's own org, so a bogus resource_id is only self-referential log noise.)
--   * Callers pass the RPC through the ACTING user's client (the student for
--     changePassword, the admin's requireAdmin() client for the admin actions) so
--     auth.uid() is the real actor — not the service-role adminClient (auth.uid() NULL).

CREATE OR REPLACE FUNCTION public.record_auth_event(
  p_event_type  TEXT,
  p_resource_id UUID,
  p_metadata    JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id   UUID;
  v_role     TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT organization_id, role INTO v_org_id, v_role
  FROM users
  WHERE id = v_actor_id AND deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF p_event_type = 'user.password_changed' THEN
    -- Self-service: a user may only record their own password change.
    IF p_resource_id IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION 'self event resource must be the actor';
    END IF;
  ELSIF p_event_type IN ('user.password_reset', 'user.deactivated', 'user.created') THEN
    -- Admin-only events. Authorization is the admin-role gate below; the audit row's
    -- organization_id is always the actor's own org (v_org_id) and resource_id is
    -- recorded as-is. We deliberately do NOT re-SELECT the resource from users to
    -- "org-scope" it: that lookup would need AND deleted_at IS NULL per security.md §9,
    -- which would reject the user.deactivated audit (its target is already soft-deleted
    -- by the time the Server Action records the event). A bogus resource_id only adds a
    -- self-referential junk row to the admin's OWN org log — no cross-org read or write.
    -- The security-critical lookup (actor identity/role/org) above IS deleted_at-filtered.
    IF v_role <> 'admin' THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported event_type: %', p_event_type;
  END IF;

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_actor_id, v_role, p_event_type, 'user', p_resource_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_auth_event(TEXT, UUID, JSONB) TO authenticated;
