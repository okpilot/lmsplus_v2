-- Revoke anon INSERT/UPDATE/DELETE/TRUNCATE and authenticated TRUNCATE on every
-- public table (`ON ALL TABLES` includes the view `active_flagged_questions`), plus
-- the matching default privileges for future postgres-owned tables. anon keeps
-- SELECT; authenticated keeps INSERT/UPDATE/DELETE (narrowing tracked in #1367).

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM authenticated;
