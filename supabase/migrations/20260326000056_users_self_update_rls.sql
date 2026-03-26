-- Allow authenticated students to update their own profile (full_name).
-- Defense-in-depth: trigger trg_protect_users_sensitive_columns (migration 041)
-- blocks changes to role, organization_id, and deleted_at for non-service-role.

CREATE POLICY users_update_own ON public.users
  FOR UPDATE
  USING (id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (id = auth.uid() AND deleted_at IS NULL);
