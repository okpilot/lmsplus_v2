# #1165 batch — session-scoped RPC args, §15 carve-outs, RLS policy narrowing

Detail relocated from `MEMORY.md` (2026-08-09) to stay under the 25 KB injection cap.
Tracker rows in `MEMORY.md` point here; counts live there.

---

## 1. Breaking-RPC-**arg**-change plans (`get_quiz_questions` `uuid[]` → `session_id`)

Plans enumerate call sites with a single-line grep and classify every test hit as a
"mechanical rename". Two things that misses:

- **The multi-line `.rpc()` form.** A single-line grep never matches
  `.rpc(\n  'fn',\n  { args },\n)`. Enumerate with a multi-line-aware scan.
- **Test cases whose SEMANTICS change, not just their args.** A subset-of-ids call
  asserting `toHaveLength(1)`, or a bogus-id call asserting `toBeNull()` + `length 0`,
  are keyed to the OLD arg's meaning — they do not survive an arg swap, they need
  rewriting or deleting.

Also: a suite that never created the newly-required parent row needs a whole new fixture,
not an arg swap. All 4 target suites had **0 `quiz_sessions` references**.

**Check:** re-read each test BODY for assertions keyed to the old arg's semantics.

## 2. Fixes to a client-fabricated identifier must name the CI job that catches regressions

#1165 Finding D — Discovery's `crypto.randomUUID()` handoff. Discovery has **zero**
automated coverage: every E2E spec clicks away from it, unit tests mock the loader, and
no tsconfig covers `e2e/`. So a fatal start-path break reaches manual eval only.

**Check:** whenever a plan fixes a path with no CI job, require an explicit added test.

## 3. §15 soft-delete carve-outs must probe the INSERT path, not just the trigger

Plans justify dropping `deleted_at`/`status` filters with a "write-once / frozen column"
invariant, but verify only the UPDATE half.

- `trg_quiz_sessions_immutable_columns` is `BEFORE UPDATE OF` — it **never fires on INSERT**.
- `authenticated` holds INSERT, and `students_insert_sessions` is
  `WITH CHECK (student_id = auth.uid())` with **no column / config / mode restriction**.

So a student can mint a session row carrying a forged `config.question_ids` (setting
`ended_at` to dodge `uq_one_active_session_per_student`), turning any config-derived read
into an arbitrary-ID primitive.

Instances: #1165 `get_quiz_questions`; same latent hole in mig 127
`get_vfr_rt_exam_questions`.

## 4. Mode-conditional answer-key strips must key on the CALLER's state

#1165 Decision E proposed stripping explanations when
`qs.mode IN ('mock_exam','internal_exam')` — self-defeating, because the attacker picks
the mode on the row being read.

**Correct shape:** key the strip on the CALLER's state (does this caller have ANY active
exam-mode session), mirroring `get_study_questions`' deny-by-default guard,
mig `20260629000700:89-93`.

## 5. RLS-policy-narrowing plans (`FOR ALL` → `FOR SELECT` on `questions`)

The CHANGE is right; the JUSTIFICATION goes wrong in two repeatable ways.

**(a) Mis-attributing a prior workaround to the policy's `WITH CHECK`.**
Permissive policies OR together, so a sibling `admin_*` policy's WITH CHECK already
passed. The real blocker was the **USING / SELECT qualifier applied to the `RETURNING`
row** of a PostgREST `.update().select()` — which a SELECT-only policy **preserves**.
Consequence: a proposed "now revert to the user-scoped client" follow-up would
reintroduce the bug the workaround fixed (#1166 / #815).

**(b) Asserting "all readers are SECURITY DEFINER, so nothing depends on this policy"
without grepping `prosecdef = false`.** These are SECURITY INVOKER and DO depend on
`tenant_isolation` on `questions`:
`_filtered_question_pool`, `get_random_question_ids`, `get_question_counts`,
`get_student_mastery_stats`, `get_student_last_practiced`
(documented at `docs/database.md:2583, 2603, 2631, 2651, 2689`).

**(c) Docs that use the narrowed policy as a GENERIC example.**
`docs/database.md:670-679` uses `questions`' `tenant_isolation` to illustrate soft-delete
filtering for **every** soft-deletable table. Re-point that example at a table that is
still `FOR ALL` (`question_banks`, `courses`) — do not edit it in place.

**Useful verified semantics for this class of review:**
- `WITH CHECK` on a `FOR SELECT` policy is a hard error:
  `ERROR: WITH CHECK cannot be applied to SELECT or DELETE`.
- `FORCE ROW LEVEL SECURITY` removes only the table OWNER's implicit exemption; it does
  **not** override the `BYPASSRLS` role attribute. `postgres` and `service_role` both
  carry `rolbypassrls = t`, so SECURITY DEFINER RPCs (owned by `postgres`) and every
  service-role client bypass RLS regardless of FORCE.
- `docs/security.md` rule 2 ("both USING and WITH CHECK") is a per-TABLE requirement, not
  per-POLICY — a SELECT-only `tenant_isolation` still satisfies it when sibling
  `admin_insert_*` / `admin_update_*` policies carry the WITH CHECK.
