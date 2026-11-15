-- Instructors no longer read audit_events; the audit log is admin-only (#1776, Decision 235).
DROP POLICY IF EXISTS audit_read_instructors ON public.audit_events;

CREATE POLICY audit_read_admins ON public.audit_events
  FOR SELECT TO authenticated
  USING (
    (SELECT is_admin())
    AND organization_id IN (
      SELECT u.organization_id FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.deleted_at IS NULL
    )
  );
