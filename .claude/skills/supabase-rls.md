# Supabase RLS Patterns — LMS Plus v2

## Every table needs a policy per PERMITTED command

The clause is per command: `SELECT`/`DELETE` take `USING` only, `INSERT` takes `WITH CHECK` only,
`FOR ALL`/`FOR UPDATE` take both — and omitting `WITH CHECK` on those two is SAFE, since PostgreSQL
reuses `USING`, so the write check then equals `USING`. Spell out a `WITH CHECK` only when the write
predicate must DIFFER from the read one. Absent clause: never a finding. Too-broad predicate: always
one — a reused `USING` constrains only the columns it names, leaving every other column writable.
A command with no permitting policy is denied by default — so on
an immutable table, a read-only policy set is correct by design, not a gap.

**`tenant_isolation` is `FOR SELECT` — two independent grounds.** An unqualified `CREATE POLICY` is
`FOR ALL`. **(a)** On a table that also carries `is_admin()`-gated write policies, Postgres ORs
permissive policies, so it supplies a second, weaker write path and the role gate never binds —
case `questions` (mig `20260809000100`). **(b)** On a table with no intended user-scoped write path,
there is no role gate to dissolve because the unqualified policy IS the entire access control —
cases `organizations`, `question_banks`, `courses`, `lessons` (mig `20260820000100`), written
service-role only, where even an authenticated admin is denied. Do not read (a) as a precondition
for (b). **Invariant: no table in `public` carries an unqualified `tenant_isolation`.**
See `docs/security.md` §3.

```sql
-- ✅ CORRECT: student_responses is IMMUTABLE — read policy only.
-- Rows are written solely by SECURITY DEFINER RPCs owned by postgres. Note the
-- mechanism: SECURITY DEFINER alone does NOT bypass RLS, and under FORCE ROW
-- LEVEL SECURITY not even the table owner is exempt — these RPCs bypass it
-- because postgres holds BYPASSRLS.
-- No deleted_at filter: immutable tables carry no deleted_at column.
-- No organization_id predicate: this mirrors the shipped policy, and
-- student_id = auth.uid() already scopes to a single user.
CREATE POLICY "students_read_responses"
  ON student_responses FOR SELECT
  USING (student_id = auth.uid());

-- ❌ WRONG: never grant students a direct INSERT here. Exactly this policy
-- shipped in mig 20260311000005 and was dropped for security in
-- 20260311000006_restrict_immutable_inserts.sql.
-- CREATE POLICY "students_insert_responses"
--   ON student_responses FOR INSERT
--   WITH CHECK (student_id = auth.uid());
```

## Soft delete filter — the default, not an absolute
```sql
-- A SELECT policy on a soft-delete table normally includes:
AND deleted_at IS NULL
```
Deliberate exceptions exist, so verify the table before adding it. `quiz_sessions`'
`students_select_sessions` (mig `20260313000023`) omits the filter on purpose — students must
still read soft-deleted sessions for report access — and `flagged_questions` filters in app code
instead (`docs/database.md` §3). Adding the filter to either would break a shipped flow.

Inside a SECURITY DEFINER function the filter is both the default AND the only enforcement left —
those RPCs run as `postgres`, which holds `BYPASSRLS`, so RLS is never evaluated. `docs/security.md`
§15 carries ONE narrow exception (reads bounded by an immutable, write-once ID column, e.g. the
frozen `quiz_sessions.config.question_ids`) and requires any new instance to cite that column at the
call site. Roughly ten shipped RPCs sit under that exception — do not read them as violations.

## RPC pattern (SECURITY DEFINER)
```sql
CREATE OR REPLACE FUNCTION get_quiz_questions(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID := auth.uid(); -- manual auth check
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  -- strip correct answers from options
  -- ...
END;
$$;
```

## Multi-tenant isolation
**Org-scoped tables only.** Not every table carries `organization_id`, and where
one does its policy does not necessarily key on it. `quiz_session_answers` and
`flagged_questions` have no such column at all. `student_responses` does have one,
and describing its policy SET matters: its student-facing policy keys on
`student_id = auth.uid()` (`students_read_responses`), while a second, role-gated
policy DOES key on `organization_id` (`instructors_read_students`, mig 001:393,
never dropped) — which is why `docs/security.md` §3 "Multiple Permissive SELECT
Policies — RPCs Must Scope Explicitly" requires a per-caller RPC reading it to
scope explicitly, the `get_student_mastery_stats` leak (#540). (Cite the rule
TITLE, not a number carried over from `.claude/rules/security.md`, whose §N are
local to that quick-summary — this is its rule 11 but `docs/security.md` §11 is
Exam Session Integrity.)
None of the three has ever carried a `tenant_isolation` policy. Applying the
org-wide predicate below to a per-student table would let every member of an
organisation read every peer's submitted answers — and on the two lacking the
column it raises 42703 at CREATE.

Other exceptions exist; do not treat this as a closed list. `organizations`, the
tenant root, carries the policy but keys on its own `id`, having no
`organization_id`. `users` carries `organization_id` yet its live policies key on
`id = auth.uid()` (`users_select`, `users_update_own`) — its `tenant_isolation`
policy was dropped TWICE (migs `20260311000004`, `20260312000012`) because the
self-referential subquery recursed, making it the one table where applying this
template actually broke. Derive the current set from the `docs/database.md` §3
query rather than from any list.

For a genuinely org-scoped table:
```sql
USING (organization_id = (
  SELECT organization_id FROM users WHERE id = auth.uid()
))
```
