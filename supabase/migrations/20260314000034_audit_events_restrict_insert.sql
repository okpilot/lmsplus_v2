-- Vector F fix: Restrict INSERT on audit_events to SECURITY DEFINER RPCs only
-- Students should not be able to forge audit events via direct client INSERT.
-- Only server-side RPCs (which run as SECURITY DEFINER) should write audit rows.
--
-- The existing policy 'audit_insert_own_org' allows any authenticated user in
-- the same org to INSERT. We drop it and replace with a policy that blocks all
-- direct inserts from the authenticated role. SECURITY DEFINER functions bypass
-- RLS, so RPCs can still write audit events.

DROP POLICY IF EXISTS audit_insert_own_org ON audit_events;

-- Block all direct INSERTs from authenticated users.
-- SECURITY DEFINER RPCs bypass RLS entirely, so they can still insert.
CREATE POLICY audit_no_direct_insert ON audit_events
  FOR INSERT
  WITH CHECK (false);
