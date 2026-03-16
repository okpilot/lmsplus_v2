-- Prevent privilege escalation via column UPDATE on users table.
--
-- RLS controls which ROWS can be updated, not which COLUMNS.
-- If an UPDATE policy is ever added to users (e.g., for profile editing),
-- this trigger blocks changes to sensitive columns: role, organization_id, deleted_at.
-- Only service-role (superuser) connections can modify these columns.

CREATE OR REPLACE FUNCTION protect_users_sensitive_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow service-role (superuser) to modify anything
  IF current_setting('role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block changes to sensitive columns for authenticated users
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot modify role column — requires service role';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Cannot modify organization_id column — requires service role';
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Cannot modify deleted_at column — use soft-delete via service role';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

CREATE TRIGGER trg_protect_users_sensitive_columns
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION protect_users_sensitive_columns();

COMMENT ON TRIGGER trg_protect_users_sensitive_columns ON users IS
  'Defense-in-depth: blocks role/org/deleted_at changes for non-service-role connections. See #236.';
