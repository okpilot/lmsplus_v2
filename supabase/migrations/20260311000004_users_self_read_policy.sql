-- Fix infinite recursion in users RLS policy
-- The original tenant_isolation policy referenced users table in its own USING clause,
-- causing "infinite recursion detected in policy for relation users"
-- Replace with a simple non-recursive policy: user can read their own row

DROP POLICY IF EXISTS tenant_isolation ON public.users;

CREATE POLICY users_select ON public.users
  FOR SELECT
  USING (id = auth.uid() AND deleted_at IS NULL);

-- Note: For same-org member listing (admin features), use a SECURITY DEFINER function
-- that bypasses RLS rather than a self-referencing policy
