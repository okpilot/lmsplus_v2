# Security Rules — LMS Plus v2

> Full binding security reference: `docs/security.md`
> This file is a quick summary. When writing any DB/auth/API code, read `docs/security.md` first.

> **Citing these rules in code, docs, or migrations:** the §N section numbers in *this* file are local to this quick-summary and do **not** match `docs/security.md`. When citing a rule outside this file, use the rule **title** (e.g., "Multiple Permissive RLS SELECT Policies") or cite `docs/security.md §N` directly — never `security.md §N` pulled from here. Several rules below already end with a "See `docs/security.md §N`" mapping; prefer that.

## Critical rules (memorise these)

1. **Correct answers** — strip via `get_quiz_questions()` RPC only. Never `SELECT *` questions for
   students. The MC key lives in `questions.correct_option_id` (column-REVOKE-gated), kept out of
   the `options` JSONB by `trg_sanitize_question_options`; students read it post-session only via
   the `ended_at`-gated report RPCs, admins via `get_question_authoring_fields()`.
2. **RLS** — every table needs a policy for each command it is INTENDED to permit; a command with no
   permitting policy is denied by default, so a read-only table with only `FOR SELECT` is correct.
   Clauses are PER COMMAND: `SELECT`/`DELETE` take `USING` only; `INSERT` takes `WITH CHECK` only;
   `UPDATE`/`FOR ALL` accept both — and omitting `WITH CHECK` there is SAFE, PostgreSQL reuses
   `USING`. **Absent clause: never a finding. Too-broad predicate: always one** — a reused `USING`
   constrains only the columns it names, leaving every other column writable.
   An unqualified policy is `FOR ALL`. **Invariant: no table in `public` carries an unqualified
   `tenant_isolation`** — a new one is a defect on sight, on two independent grounds: **(a)** on a
   table with role-gated writes, permissive policies OR together so the unqualified one supplies a
   weaker write path and the role gate never binds; **(b)** on a table with no intended user-scoped
   write path, the unqualified policy IS the entire access control. See `docs/security.md` §3.
3. **Service role key** — `packages/db/src/admin.ts` only. Never `NEXT_PUBLIC_`. Never client-side.
4. **Zod validation** — every Server Action and API route parses input with Zod before using it.
5. **Audit log** — `audit_events` is append-only. No PERMITTING UPDATE or DELETE policy. Ever.
6. **Soft delete** — never hard DELETE. Always `UPDATE SET deleted_at = now()`.
7. **Auth check in RPCs** — every SECURITY DEFINER function calls `auth.uid()` and raises if null.
8. **Secrets** — never commit `.env*`. Pre-commit hook blocks them.
9. **Soft-delete in RPCs** — every SELECT inside a SECURITY DEFINER function includes
   `AND deleted_at IS NULL` on soft-deletable tables. These RPCs are owned by `postgres`
   (`BYPASSRLS`), so RLS is not evaluated and the filter must be manual. **Narrow exception:**
   SELECTs fetching records by IDs stored in an immutable, write-once column may omit it —
   `docs/security.md` §15 is the authoritative list, not this summary. Any new instance must cite
   the immutable column at the call site.
10. **Audit-event INSERT subqueries** — every `INSERT INTO audit_events` block in a SECURITY DEFINER
    function filters `deleted_at IS NULL` on any user/session/question/membership FK lookup feeding
    `actor_id`, `actor_role`, or session-derived columns. The outer guards do not cover these: the
    audit-row subqueries are independent SELECTs.
11. **Multiple permissive RLS SELECT policies** — permissive policies OR together. If a table has
    more than one permissive SELECT policy, a per-caller RPC reading it must scope explicitly:
    `WHERE <owner_col> = auth.uid()`, or `WHERE <owner_col> = p_student_id` TOGETHER WITH an
    `auth.uid() = p_student_id` identity guard. The identity guard alone is not enough — it validates
    the parameter, leaving a query keyed on another identifier free to read another owner's rows.
    Admin/org-wide RPCs behind `is_admin()` are exempt. The table set is live; the authority is the
    DB: `SELECT tablename FROM pg_policies WHERE schemaname='public' AND cmd IN ('SELECT','ALL')
    AND permissive='PERMISSIVE' GROUP BY tablename HAVING count(*) > 1` — `ALL` is the unqualified
    form and permits SELECT, so a `cmd='SELECT'`-only query fails OPEN. Trust no prose list.
12. **Sibling SECURITY DEFINER RPC guard-set consistency** — before committing, compare the RPC's
    guard set against ALL siblings in its feature family. Guard classes: `auth.uid()` null-check
    (7); mode/whitelist guard; soft-delete filter (9); **active-user gate**
    (`PERFORM 1 FROM users WHERE id = <uid> AND deleted_at IS NULL; IF NOT FOUND THEN RAISE`);
    ownership scope (11); org/config membership; audit-subquery soft-delete (10);
    `SET search_path = public`. A guard present in a sibling and absent here is a **gap, not an
    intentional difference**, unless justified (`is_admin()` RPCs are exempt from per-caller
    scoping; a function reading no soft-deletable table needs no filter; no `audit_events` INSERT
    means no audit-subquery concern). Introducing a NEW guard class into one member means auditing
    every other member **in the same commit**.
13. **Single-active-session invariant** — at most ONE active
    (`ended_at IS NULL AND deleted_at IS NULL`) `quiz_sessions` row per student, across all modes:
    a global partial unique index plus each start RPC raising `another_session_active`. Structural
    complement to rule 1 — an answer-revealing practice session cannot START while a graded exam on
    the shared MC pool is live. See `docs/security.md` §11d.

## When the security-auditor agent runs
On every `git push` via Lefthook pre-push hook.
Blocks on CRITICAL and HIGH findings.
See `.claude/agents/security-auditor.md` for full checklist.
