# RLS / policy facts — verified, do not re-derive from prose

Load-bearing policy facts for this repo, each traced to `supabase/migrations/` (the SOLE source of
truth — `packages/db/migrations/` is FROZEN and carries false history). Moved out of `MEMORY.md`
2026-08-20 for the injection budget.

**Always trace all three supersession forms** before asserting a policy is live or dropped:
`DROP POLICY` + `CREATE POLICY`, a later bare `CREATE POLICY`, and `ALTER POLICY <name> ON <table>`
(replaces `TO`/`USING`/`WITH CHECK` in place, so a DROP/CREATE-only grep reports a stale predicate
as current). A line-based grep for `CREATE POLICY` also misses a statement whose table name sits on
the NEXT line — grep with `-A2` and filter for the table.

## `public.users` — full chain (verified 2026-08-20)

| Mig | Line | Statement |
|---|---|---|
| `20260311000001_initial_schema` | 292 | `CREATE POLICY "tenant_isolation" ON users` — unqualified (`FOR ALL`), `USING`/`WITH CHECK` on `organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()) AND deleted_at IS NULL` |
| `20260311000004_users_self_read_policy` | 6, 8 | `DROP POLICY IF EXISTS tenant_isolation`; `CREATE POLICY users_select FOR SELECT USING (id = auth.uid() AND deleted_at IS NULL)` |
| `20260312000012_fix_users_rls_remote` | 11, 12, 14 | drops both, re-creates `users_select` identically (mig 004 was recorded applied on remote but never executed) |
| `20260326000056_users_self_update_rls` | 5 | `CREATE POLICY users_update_own FOR UPDATE USING/WITH CHECK (id = auth.uid() AND deleted_at IS NULL)` |

- **`users` has NO `tenant_isolation` policy.** Dropped twice, both times for
  `infinite recursion detected in policy for relation users` — the self-referential subquery in its
  own `USING` clause. Both migration headers state that reason explicitly.
- **Live set is exactly `users_select` (SELECT) + `users_update_own` (UPDATE).** No ALTER POLICY
  exists anywhere in `supabase/migrations/` (the only hit is a comment in `20260820000100`).
- RLS is both ENABLED and FORCED on `users` (`initial_schema:36-37`), so the owner is bound too.
- **Consequence:** a user-scoped client sees only its OWN `users` row, so every cross-row read or
  PostgREST `users` embed must use the service-role `adminClient`. RLS applies to embedded
  resources too — a non-visible embed comes back `null`, not an error.
- Corroborated independently by
  `apps/web/app/app/admin/students/actions/toggle-student-status.integration.test.ts:16-18`, and by
  the three `apps/web/app/app/admin/internal-exams/` comments corrected on
  `fix/1175-tenant-isolation-select-only`. **Do not re-flag those three comments.**
- Writes are blocked three layers deep, not just by RLS: mig `20260606000006` REVOKEs blanket
  UPDATE from `authenticated` and re-grants only `UPDATE (full_name)`; `users_update_own` matches
  zero rows for an admin targeting a student; `trg_protect_users_sensitive_columns`
  (mig `20260316000041`) raises on any non-service-role change to `deleted_at`.

## `tenant_isolation` across the schema

- **Only ever existed on SIX tables** — organizations, users, question_banks, questions, courses,
  lessons (all mig 001). The three per-student tables NEVER carried it.
- Post-`20260820000100`, every LIVE one is `FOR SELECT`. `users` is the one member with no live
  successor at all.
- **No `auth.org_id()` function exists** — only plpgsql `v_org_id` locals.
- **Invariant: no table in `public` carries an unqualified `tenant_isolation`.** A new one is a
  defect on sight (an unqualified policy is `FOR ALL`, which ORs a weaker write path alongside any
  role-gated write policy).

## Multiple permissive SELECT policies

- **`student_responses` carries TWO:** `students_read_responses` (`student_id = auth.uid()`, mig
  `20260311000005:24`) AND `instructors_read_students` (`organization_id` = caller org AND role IN
  instructor/admin, mig 001:393, never dropped). Reject any prose calling it a purely per-student
  table — that premise is what caused #540 / red-team BW3.
- `users` likewise carries an `organization_id` column while its live policies key on
  `id = auth.uid()` — the column's presence is not evidence of an org-scoped policy.
- Enumerate a table's POLICY SET, never "its policy". The authority is the DB:
  `SELECT tablename FROM pg_policies WHERE schemaname='public' AND cmd IN ('SELECT','ALL')
  AND permissive='PERMISSIVE' GROUP BY tablename HAVING count(*) > 1` — `ALL` must be included or
  the query fails OPEN on exactly the unqualified-policy tables.

## `pg_policies.qual`

- **NULL `qual` ⇒ `FOR INSERT` only here: exactly 11 in `public`** (replay CREATE/DROP POLICY by
  migration timestamp, keep those with no `USING`; a 12th is on `storage.objects`, outside
  `schemaname='public'`). `docs/database.md` §7's `COALESCE(qual,'')` guards a FUTURE
  `FOR ALL`-with-only-`WITH CHECK`, not a present wrong answer. Verified 2026-08-20 — do not
  re-flag.
