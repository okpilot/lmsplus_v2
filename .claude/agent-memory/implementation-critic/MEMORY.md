# Agent Memory — implementation-critic

> Reviews staged changes against the approved plan before commit.
> This index holds durable recurring-deviation knowledge. Per-commit narrative lives in `git log`
> and `topics/commit-notes.md` (per-PR approval notes + positive-patterns log).
> **†** = full row detail in `topics/commit-notes.md § row detail 2026-07-11`.

## Recurring-deviation tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Zero-row no-op: UPDATE/DELETE missing `.select('id')` + `data?.length` check | 2026-04-10 | 6 | 2026-06-06 | PROMOTED → code-style.md §5. Recurs in prod AND test helpers — still flag in new code. † |
| Dead helper in test file → Biome `noUnusedVariables`/`noThenProperty` pre-commit fail | 2026-04-11 | 2 | 2026-05-27 | RULE CANDIDATE. Grep call sites for any large test helper before approving — delete if only self-referenced. † |
| Error message refactor breaks paired test assertion regex | 2026-05-06 | 1 | 2026-05-06 | WATCHING. Grep tests for the old message substring when context strings change (#628; #709 no recurrence). † |
| TRANSPORT_LAYER/payload-group loop applied to fewer RPCs than plan states | 2026-05-07 | 1 | 2026-05-07 | WATCHING. #108 `void_internal_exam_code` got DB_LAYER only. When a plan documents a payload group across N RPCs, count loops in each describe block. |
| Conditional redirect regression when helper return value discarded | 2026-04-14 | 1 | 2026-04-14 | WATCHING. Check callers of helpers that made an unconditional side-effect conditional — discarded result stranded the user. † |
| Too-lenient INSERT rejection assertion (OR-branch allows vacuous pass) | 2026-05-31 | 2 | 2026-06-10 | RULE CANDIDATE. Assert `expect(error?.code).toBe('23514')` directly — OR-branch/boolean rejection assertions pass vacuously (#314; feat/697). † |
| Hard DELETE on quiz_sessions in red-team afterAll/afterEach | 2026-06-05 | 1 | 2026-06-05 | WATCHING. quiz_sessions is soft-delete only — flag hard `.delete()` in spec cleanup as ISSUE (#611). † |
| Thin-wrapper page-error tests: mock-dependency form is valid when SUT is pure pass-through | 2026-06-01 | 2 | 2026-06-25 | WATCHING. Do NOT flag mock-the-dependency page-error tests as "bypassing production logic" when the mocked helper is the ONLY fetch path (§7 permits it, even when the caller transforms the result). † |
| New _hooks/ util extracted without co-located test | 2026-06-01 | 2 | 2026-06-20 | RULE CANDIDATE. Flag as ISSUE any new _hooks/ util lacking a co-located .test.ts (code-style §7; #565, VFR RT Phase 1). † |
| Behavior-change fix to an already-tested util lands with no regression test for the NEW behavior | 2026-08-07 | 2 | 2026-08-07 | WATCHING (both on #1124 — same PR, different commits, so hold at WATCHING; do not promote off one PR). (1) `session-bootstrap-load.ts` Promise.all→await-questions-first: every existing test passed on the OLD code, so a revert is invisible — when a fix changes TIMING/ordering rather than output, check for a case that fails pre-fix (fake timers + hung sibling promise). (2) CR-round-1 fixup added a `.catch` net to `use-session-bootstrap.ts:52` mirroring the one in `buildRecoveryResume` — but the SIBLING net is tested (`session-bootstrap-load.test.ts:290`, throwing-setter technique) and the new one is not. **Generalized check: when a fix is justified as "mirrors the sibling pattern", check whether the sibling's TEST was mirrored too** — a defensive net that no test can fail is a comment, not a guard. Mocked seams often make the new branch unreachable (here `loadSessionData` is real and never rejects, so only a throwing mocked setter — `mockClearSessionHandoff.mockImplementationOnce` — reaches it). |
| #582 Readonly<Props> sweep: plan said "5 exist", reconciled to 3 | 2026-06-01 | 1 | 2026-06-01 | WATCHING. Plan reconciled to 3 named `Readonly<Props>` pre-execution — correct. Track whether inline `Readonly<{...}>` should also be normalised. † |
| Security.md doc bullet claims RPC performs capability it doesn't have | 2026-06-05 | 1 | 2026-06-05 | RESOLVED. When a doc bullet describes what an RPC "does", read the latest CREATE OR REPLACE before approving. † |
| Doc **or code comment** describes RPC guard behavior that doesn't match the migration body | 2026-06-06 | 3 | 2026-08-07 | RULE CANDIDATE (count=3). Verify guard-order/exemption/caller claims against the LATEST migration body — applies to CODE COMMENTS too, not just `docs/*.md`. 3rd: #1124 `study-start-handlers.ts` JSDoc claimed an orphan discovery row "would otherwise block the retry", but migs 137/141/138/139/140 EVERY start RPC unconditionally soft-deletes the caller's active `mode='discovery'` rows in step (1) → self-healing on all paths; `study.ts` says the opposite ("auto-cleared by the next start"). † |
| Cross-org red-team Attack uses sentinel UUID because target org has no seeded questions | 2026-06-06 | 1 | 2026-06-06 | WATCHING. Sentinel fallback proves the wrong thing — throw if the target org has no questions, or flip attacker/victim (#625). † |
| DB CHECK constraint violation from too-long document_version in test seed | 2026-06-06 | 1 | 2026-06-06 | WATCHING. When seeding user_consents, count document_version chars against the 20-char CHECK (PR-7). † |
| Doc new-section insertion duplicates existing heading/entry | 2026-06-10 | 1 | 2026-06-10 | WATCHING. When inserting a doc section before an existing one, grep the target for the existing section's first line. † |
| plan.md integration-test count wrong: pre-existing wrong baseline propagated to new "now N" claim | 2026-06-11 | 2 | 2026-06-11 | FALSE POSITIVE (reconciled by orchestrator). The plan.md count literal is the VITEST RUNTIME total, NOT a static `it(` grep — verify via the run summary. † |
| Red-team results spec uses wrong vector ID sub-labels (DB2/DB3 instead of DR2/DR3) | 2026-06-14 | 1 | 2026-06-14 | WATCHING. Sub-vector spec labels must use the matrix vector ID as prefix (#825). † |
| Red-team non-vacuity read missing `enabled` filter that the RPC itself uses | 2026-06-14 | 1 | 2026-06-14 | WATCHING. Non-vacuity reads mirroring an RPC's filter must use ALL the same predicates — #825 DN2 missed `enabled = true`. † |
| Namespace written to localStorage during quiz session but never in RT path | 2026-06-20 | 1 | 2026-06-20 | WATCHING. Flag when a new storage namespace isn't threaded through to the persistence hook. † |
| Pre-existing file-size violations worsened by bug-fix commits | 2026-06-21 | 1 | 2026-06-21 | WATCHING. Pre-existing over-limit files modestly worsened by a bug fix = SUGGESTION class (split is a separate refactor, #887). † |
| Fractional partial-credit SUM funneled through an `int` plpgsql var → rounded before percentage | 2026-06-21 | 1 | 2026-06-21 | WATCHING. Mig 121. Verify the receiving var stays `numeric` until after the percentage is derived. † |
| Agent-memory curation: stub rows with archive pointer require the archive to already hold the entry | 2026-06-22 | 1 | 2026-06-22 | WATCHING. Before flagging a stub-row-with-no-archive-match: fuzzy grep the archive, check the live table, check other suffix forms (#948: 9 apparent misses all resolved that way). † |
| `if (orgId)` null-guard dropped when moving a describe block to a standalone file | 2026-06-23 | 1 | 2026-06-23 | RESOLVED — [full → topics/tracker-archive.md] |
| Header comment cross-references a block "above" that no longer exists after extraction | 2026-06-23 | 1 | 2026-06-23 | RESOLVED. When moving a describe block, audit cross-referencing comments ("above"/"below"/"see block N") (#951). † |
| packages/db migration NNN prefix collides with a parallel UNMERGED branch off the same baseline | 2026-06-26 | 1 | 2026-06-26 | WATCHING. Merge-sequencing hazard, not a staged-diff defect — whichever branch merges 2nd renumbers. † |
| Integration fixture type changed to satisfy a new write-time trigger, keeping the original CHECK active | 2026-06-24 | 1 | 2026-06-24 | WATCHING. #828: fixture retargeted short_answer→dialog_fill so the mig 131 trigger passes and `answer_shape_check` stays the constraint under test. When a new trigger rejects a constraint-regression fixture, retarget to a trigger-allowed type. † |
| Unit test updated to throw; integration test still asserts old return-[] on same error path | 2026-06-26 | 1 | 2026-06-26 | WATCHING. `study-queries.ts` return-[]→throw; integration test still asserted `toEqual([])` → CI fail. On any error-posture change, grep ALL test tiers. † |
| No-insert seed scripts keep pre-existing `.single()` when plan specifies `.maybeSingle()` | 2026-07-13 | 1 | 2026-07-13 | RESOLVED. seed-dashboard-eval / seed-eval / seed-more-questions switched to `.maybeSingle()` (#1121); the 0-row "run seed-X first" branches are now reachable. |
| Restore UPDATE on a just-fetched row omits `.select('id')` zero-row no-op chain | 2026-07-13 | 1 | 2026-07-13 | WATCHING. SUGGESTION class only: zero-row on restore is impossible when the UPDATE id comes straight from a committed query result in the same request (#1121). |
| Soft-delete restore UPDATE clears `deleted_at` but omits sibling nullable column (`deleted_by`) | 2026-07-13 | 1 | 2026-07-13 | WATCHING. 8 seed scripts missed `deleted_by: null` (#1119). On restore, check types.ts Update shape for every nullable column whose cleared state signals "not deleted". |
| `\|\| exit 1` inside `$(...)` aborts only the subshell, not the outer command | 2026-07-23 | 1 | 2026-07-23 | RESOLVED. Correct pattern: resolve into a var, guard in the OUTER shell (`BASE=$(cmd) \|\| { exit 1; }`), then use `"$BASE"` (#1137). |
| Cross-file prose divergence: rule clarified in one doc, sibling doc left contradicting | 2026-07-23 | 1 | 2026-07-23 | RESOLVED. agent-workflow.md vs fullpush.md 5b on "errored or empty diff". When clarifying a rule phrase, grep sibling command/rule files for the same phrase and fix in the SAME commit (#1137). |

## Durable knowledge

- **CREATE OR REPLACE trace before flagging.** Before flagging a missing pattern (guard, search_path, auth check) on a Postgres function, trace to the LATEST migration definition. Grep BOTH `CREATE OR REPLACE FUNCTION <fn>` AND bare `CREATE FUNCTION <fn>` (DROP+recreate form, used when RETURNS TABLE changes) — a CREATE-OR-REPLACE-only grep returns a superseded file as "latest" (2026-07-11: get_quiz_questions cited to harden_strip when diagram_label's DROP+CREATE was 2 migs later). Required per `agent-critic.md`.
- **Migration source of truth: `supabase/migrations/` ONLY.** `packages/db/migrations/` was FROZEN 2026-07-11 (historical, missing 81/222 files). Never flag a missing counterpart there; never cite it for current SQL.
- **Every start RPC auto-clears the caller's active `discovery` row.** migs 137 (discovery), 141 (quiz), 138/139/140 (exam / internal-exam / VFR RT) all open their single-active guard with an unconditional `UPDATE quiz_sessions SET deleted_at = now() WHERE student_id = … AND mode = 'discovery' AND ended_at IS NULL AND deleted_at IS NULL`. So an orphaned discovery row can never strand a user on ANY start path — client-side discovery teardown is best-effort hygiene, NOT a correctness requirement. Do not accept (or write) a comment claiming an orphan "blocks the retry".
- **Security §11 (multi-permissive RLS) self-scope is load-bearing.** Per-caller RPCs reading multi-permissive tables must keep the explicit `<owner> = auth.uid()` predicate — RLS ORs the broader policy. Do not suggest removing it. †
- **types.ts nullable-SQL-column convention.** RPC entries may type nullable SQL columns as non-nullable; production query files carry their own local Row type. Not a deviation; SUGGESTION at most. †
- **types.ts stale column after DROP+CREATE migration: ISSUE class when not in staged diff.** When a DROP+CREATE removes a RETURNS TABLE column, types.ts must drop it too (#471). †
- **`rpc`/`authRpc` wrapper contract.** Returns `{ data, error }`, never throws on query errors. `Promise.all([rpc(...), supabase.from(...)])` carries no unhandled-rejection risk. `fetchAllRows` guarantees `data: T[]` (never null) — `?? []` after it is redundant.
- **Bounded-await helpers never reject.** The `Promise.race([p.then().catch(() => fallback), timeoutResolve]).finally(clearTimeout)` shape (code-style §6, e.g. `fetchFlaggedIdsBounded`) cannot reject and cannot leak its timer, because `.finally` is attached at CREATION not at the await site. Abandoning such a promise (early return before awaiting it) is therefore safe — do NOT flag it as an unhandled rejection or a leaked timer.
- **Doc-only commits: mig comment vs guard line range.** When a citation spans comment+code, the code-only sub-range is more precise (mig 117; clean on #918). †
- **Count/page filter symmetry (pagination).** Count + paginated page query must carry byte-identical WHERE filters. `.order(...)` additions affect only the page query and never the count — adding an id tiebreaker does not break symmetry.
- **Offset-pagination id tiebreaker is the house pattern.** `.order('<ts>', { ascending: false }).order('id', { ascending: false })` + a one-line comment above the primary order. Canonical: `internal-exams/queries.ts`, `internal-exams/attempts-queries.ts`. `.limit(N)` reads (no `.range()`) do not need it.
- **Test title impl-detail leakage (code-style §7).** `it(...)` titles must not name internal helpers/types/validator branches; public props/SDK methods/Server-Action + RPC names ARE permitted (`does not call X when …` is an explicitly Permitted form). Audit inline comments after a title rename. †
- **Dead mock branches in test helpers — ISSUE class, not cosmetic.** Remove `if (table === 'X')` branches for tables the SUT no longer reads so the `Unexpected table` throw fires (PR-A1 dashboard.test.ts). †

### Cached-role pattern in SECURITY DEFINER RPCs

- **Cached role variable prevents NOT NULL abort on delayed soft-delete.** Fetch the actor's role once into a local var at authz time — an inline audit-INSERT subquery returns NULL on mid-txn soft-delete, aborting on NOT NULL. §10 deleted_at filter still required on the capturing SELECT. †
- **NULL-org guard doubles as NULL-role guard when role is fetched on the same SELECT.** After `SELECT u.organization_id, u.role INTO v_admin_org, v_admin_role`, the `IF v_admin_org IS NULL` guard ensures v_admin_role is non-null too.
- **ELP grader (`write_oral_section_grade`)** — section-row → session-row lock order with no inverse ordering, so no deadlock; its `auth.uid() IS NOT NULL → RAISE 'forbidden'` guard is defense-in-depth for a service-role-only caller. Do NOT flag it as blocking the grader path. †

### Tooling/config

- **knip `ignoreDependencies` is workspace-scoped.** Use it inside the workspace key; `ignoreBinaries` + `ignore` live at top level. Verified clean on #325.
- **`@repo/ui` is a dep in `apps/web/package.json` with no `@repo/ui` import** — `packages/ui/src/index.ts` exports `{}` (Phase 5 placeholder). Ignoring it in knip is intentional.
- **Broad grep for component names returns false-positive matches** when siblings use same-named primitives from `@base-ui/react` directly (`SelectSeparator` uses `SelectPrimitive.Separator`). Verify import path, not just symbol name.
- **Tailwind v4 `@plugin` directive placement** — after all `@import`, before `@custom-variant`/`@theme`. Verified #325.
- **Playwright project ordering = dependency-depth PHASES, not config order.** Verified in the bundled runner source (`playwright@1.61.1/.../lib/runner/index.js`, task `"create phases"`): every project whose `deps` are all `processed` joins the SAME phase; phases run sequentially, projects within a phase interleave with NO defined order (even at `workers: 1`). Adding ONE `dependencies:` edge re-partitions EVERY project's phase — check the resulting partition, not just the edge. Precedent #1143: adding `internal-exam-student-setup → admin-setup` moved `admin-e2e` from phase 2 to 3, silently making it run after `e2e`. Each project sits in exactly one phase, so a diamond never double-runs the shared dep.

## False positives (do not re-raise)

- **#1011 merge-fix `clearActiveSessions({ admin, studentIds: [studentId] })` in `beforeEach` is correctly studentId-scoped, NOT org-wide** — do not suggest `orgId`. Verified clean on #998. †
- **Probe-gate keyed on allRows (pre-filter) is correct** — do not flag `rows.length === 0 → totalCount: 0` as "missing probe". †
- **`count(*) OVER()` window with `p_limit:1` probe** returns correct `total_count` — window evaluated before LIMIT/OFFSET. †
- **Probe fires on page=2 empty** — `toHaveBeenCalledWith` asserts the first call; the probe's 2nd call is unmocked and resolves `totalCount: 0`. Test doesn't assert the value — no failure.
- **`getSessionReports` ~39-line body after extraction** — pre-existing auth/RPC/filter preamble cannot split further without artificial helpers. Accept residual >30 body lines as an orchestrator-pattern exception.
- **`avg_score`/mastery RPCs return NULL (no COALESCE) for students with no sessions** — intentional; app type `number | null`, UI guards `!== null`.
- **Hard DELETE on `exam_config_distributions` inside `upsert_exam_config`** — intentional, documented in mig 043 + database.md (ephemeral config table, same precedent as `quiz_drafts`).
- **Adjacent conditional JSX guard blocks (`{canDismiss && (`)** are not "duplicate buttons" — one state-driven trigger + one prop-guarded confirm-panel button are distinct.
- **`_userId`/dropped-param on caller-scoped RPCs** — scoped via RLS + `auth.uid()`, so an unused student-id param is dead but harmless (SUGGESTION at most).
- **Red-team seed `selected_option_id: 'a'` with `is_correct: true`** — intentional; `get_student_mastery_stats` reads `sr.is_correct` directly (#673).
- **Red-team spec with no `afterEach` is hermetic** when each test seeds NEW unique rows and doesn't mutate shared beforeAll state (#518/#638). †
- **try/finally hermiticity hardening for org-transfer tests (#768) is correct**; finally must use `console.error`, not `expect()`. †
- **`blanks.every(...)` vacuous-true on `[]` is unreachable in the dialog-fill a11y path** — dialog_fill requires ≥1 `{{n}}` blank (mig 131 trigger), so grading feedback always has ≥1 entry. Do not flag as a missing empty-guard (verified `56678b99`). †

## Topic pointers

- [commit-notes](topics/commit-notes.md) — per-PR approval narrative + positive-patterns log (relocated for budget, #953)
- [tracker-archive](topics/tracker-archive.md) — older impl-critic findings (two dated spec-notes + the older "Positive patterns" approval log, pre-2026-06-07)
