# FROZEN 2026-07-11 — HISTORICAL ONLY

This directory stopped mirroring `supabase/migrations/` and is **frozen as of 2026-07-11**.

- It is **missing 81 of 222** migration files.
- Some files here were **edited after they were deployed**, so they show **false history** — e.g. `002_rpc_functions.sql` no longer matches what actually ran against any database.

**NEVER read, edit, or cite this directory for current SQL.** No file in it may be treated as a current function definition, schema statement, or guard set.

The sole source of truth is **`supabase/migrations/`** — the only directory CI tests (`e2e.yml` clean-reset migration test) and the only directory `db-deploy.yml` deploys to production.

This directory is retained verbatim for historical reference only. Nothing is added to it and nothing in it changes (this README is the single exception, added at freeze time).
