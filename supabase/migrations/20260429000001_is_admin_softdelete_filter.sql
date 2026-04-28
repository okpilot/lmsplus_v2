-- Add `AND deleted_at IS NULL` to is_admin() helper.
-- Originally defined in 031_admin_rls_easa_tables.sql lines 7-18 without the
-- soft-delete filter, allowing soft-deleted admin rows to still pass admin
-- gates. Body identical to mig 031 apart from the added filter.
-- security.md rule 7 + rule 9 (SECURITY DEFINER must filter deleted_at).

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND deleted_at IS NULL
  );
$$;
