-- Function EXECUTE for anon (#1367, part B2). anon and PUBLIC lose EXECUTE on every
-- public function; authenticated and service_role keep their explicit grants.
-- New postgres-owned functions default to anon nothing, authenticated EXECUTE. The
-- PUBLIC default is revoked globally: the IN SCHEMA form cannot remove it.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
