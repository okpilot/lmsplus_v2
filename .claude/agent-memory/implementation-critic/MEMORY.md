# Agent Memory — implementation-critic

> Reviews staged changes against the approved plan before commit.
> This index holds durable recurring-deviation knowledge. Per-commit narrative lives in `git log`
> and `topics/commit-notes.md` (per-PR approval notes + positive-patterns log).
> **†** = full row detail in `topics/commit-notes.md § row detail 2026-07-11`.

## Recurring-deviation tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Zero-row no-op: UPDATE/DELETE missing `.select('id')` + `data?.length` check | 2026-04-10 | 6 | 2026-06-06 | PROMOTED → code-style.md §5. Recurs in prod AND test helpers — still flag in new code. † |
| Agent wrote its memory delta to the stray `apps/web/.claude/agent-memory/` instead of the repo-root path — a fresh truncated MEMORY.md, invisible to later invocations | 2026-08-17 | 1 | 2026-08-17 | WATCHING (PR #1207; recovered by hand at wrap-up). Cause: cwd was `apps/web`. Same loss class as a stashed delta per agent-memory.md. |
| Zero-row no-op, DISTINCT mechanism: `.select('id')` present but count logged only when `> 0`, so a blocked write after a positive pre-match is silent | 2026-08-11 | 1 | 2026-08-11 | WATCHING. Where a prior SELECT proved N match, compare against N and THROW. †
| Dead helper in test file → Biome `noUnusedVariables`/`noThenProperty` pre-commit fail | 2026-04-11 | 2 | 2026-05-27 | RULE CANDIDATE. Grep call sites for any large test helper before approving. †
| New test line copied from a sibling exceeds `lineWidth: 100` → `biome check` FORMAT error blocks pre-commit | 2026-08-17 | 1 | 2026-08-17 | WATCHING. #1207: siblings passed a `session` var (98 ch); the new tests inlined `makeSession()` (102 ch). Run `npx biome check <staged files>` BEFORE commit — an amend is forbidden after a hook failure, so this costs a whole extra commit. |
| Error message refactor breaks paired test assertion regex | 2026-05-06 | 1 | 2026-05-06 | WATCHING. Grep tests for the old message substring when context strings change (#628; #709 no recurrence). † |
| TRANSPORT_LAYER/payload-group loop applied to fewer RPCs than plan states | 2026-05-07 | 1 | 2026-05-07 | WATCHING. When a plan documents a payload group across N RPCs, count loops in each describe block (#108). †
| Conditional redirect regression when helper return value discarded | 2026-04-14 | 1 | 2026-04-14 | WATCHING. Check callers of helpers that made an unconditional side-effect conditional. †
| Too-lenient INSERT rejection assertion (OR-branch allows vacuous pass) | 2026-05-31 | 2 | 2026-06-10 | RULE CANDIDATE. Assert `expect(error?.code).toBe('23514')` directly (#314; feat/697). †
| Hard DELETE on quiz_sessions in red-team afterAll/afterEach | 2026-06-05 | 1 | 2026-06-05 | WATCHING. quiz_sessions is soft-delete only — flag hard `.delete()` in spec cleanup as ISSUE (#611). † |
| Thin-wrapper page-error tests: mock-dependency form is valid when SUT is pure pass-through | 2026-06-01 | 2 | 2026-06-25 | FALSE POSITIVE. Do NOT flag these as "bypassing production logic" when the mocked helper is the ONLY fetch path (§7 permits it). †
| New _hooks/ util extracted without co-located test | 2026-06-01 | 2 | 2026-06-20 | RULE CANDIDATE. Flag as ISSUE any new _hooks/ util lacking a co-located .test.ts (code-style §7; #565, VFR RT Phase 1). † |
| Behavior-change fix to an already-tested util lands with no regression test for the NEW behavior | 2026-08-07 | 2 | 2026-08-07 | WATCHING (both on #1124, one PR — do not promote). Timing/ordering fixes need a case that FAILS pre-fix; "mirrors the sibling pattern" must mirror the sibling's TEST too. †
| #582 Readonly<Props> sweep: plan said "5 exist", reconciled to 3 | 2026-06-01 | 1 | 2026-06-01 | WATCHING. Reconciliation was correct; track whether inline `Readonly<{...}>` should also be normalised. †
| Security.md doc bullet claims RPC performs capability it doesn't have | 2026-06-05 | 1 | 2026-06-05 | RESOLVED. When a doc bullet describes what an RPC "does", read the latest CREATE OR REPLACE before approving. † |
| Doc **or code comment** describes DB guard behavior that doesn't match the migration body | 2026-06-06 | 5 | 2026-08-17 | PROMOTED → code-style.md §10 (#1162, #1152). Applies to CODE COMMENTS and to RLS POLICY migrations, not only function bodies. 5th: `mc-content.ts` cited `questions_correct_option_id_check` 12 lines above naming the real `questions_mc_correct_option_id_check` — same file, both forms. †
| Cross-org red-team Attack uses sentinel UUID because target org has no seeded questions | 2026-06-06 | 1 | 2026-06-06 | WATCHING. Sentinel fallback proves the wrong thing — throw, or flip attacker/victim (#625). † |
| DB CHECK constraint violation from too-long document_version in test seed | 2026-06-06 | 1 | 2026-06-06 | WATCHING. When seeding user_consents, count document_version chars against the 20-char CHECK (PR-7). † |
| Doc new-section insertion duplicates existing heading/entry | 2026-06-10 | 1 | 2026-06-10 | WATCHING. When inserting a doc section before an existing one, grep the target for the existing section's first line. † |
| plan.md integration-test count wrong: bad baseline propagated to a new "now N" claim | 2026-06-11 | 2 | 2026-06-11 | FALSE POSITIVE. The count literal is the VITEST RUNTIME total, NOT a static `it(` grep — verify via the run summary. †
| Red-team results spec uses wrong vector ID sub-labels (DB2/DB3 instead of DR2/DR3) | 2026-06-14 | 1 | 2026-06-14 | WATCHING. Sub-vector spec labels must use the matrix vector ID as prefix (#825). † |
| Red-team non-vacuity read missing `enabled` filter that the RPC itself uses | 2026-06-14 | 1 | 2026-06-14 | WATCHING. Non-vacuity reads mirroring an RPC's filter must use ALL the same predicates (#825 DN2). †
| Namespace written to localStorage during quiz session but never in RT path | 2026-06-20 | 1 | 2026-06-20 | WATCHING. Flag when a new storage namespace isn't threaded through to the persistence hook. † |
| Pre-existing file-size violations worsened by bug-fix commits | 2026-06-21 | 1 | 2026-06-21 | WATCHING. Modestly worsened over-limit file = SUGGESTION class; the split is a separate refactor (#887). † |
| Fractional partial-credit SUM funneled through an `int` plpgsql var → rounded before percentage | 2026-06-21 | 1 | 2026-06-21 | WATCHING. Mig 121. Verify the receiving var stays `numeric` until after the percentage is derived. †
| Agent-memory curation: stub rows with archive pointer require the archive to hold the entry | 2026-06-22 | 1 | 2026-06-22 | WATCHING. Fuzzy-grep the archive + check other suffix forms first (#948: 9 apparent misses all resolved). †
| `if (orgId)` null-guard dropped when moving a describe block to a standalone file | 2026-06-23 | 1 | 2026-06-23 | RESOLVED — [full → topics/tracker-archive.md] |
| Header comment cross-references a block "above" that no longer exists after extraction | 2026-06-23 | 1 | 2026-06-23 | RESOLVED. When moving a describe block, audit "above"/"below"/"see block N" comments (#951). †
| packages/db migration NNN prefix collides with a parallel UNMERGED branch off the same baseline | 2026-06-26 | 1 | 2026-06-26 | WATCHING. Merge-sequencing hazard, not a staged-diff defect. †
| Integration fixture type changed to satisfy a new write-time trigger, keeping the original CHECK active | 2026-06-24 | 1 | 2026-06-24 | WATCHING. #828. Retarget to a trigger-allowed type so the CHECK stays the constraint under test. †
| Status/error-posture change updates some test tiers but leaves a sibling spec asserting the OLD value | 2026-06-26 | 2 | 2026-08-09 | RULE CANDIDATE. Grep the WHOLE repo for the old literal, not just the plan's named files. †
| No-insert seed scripts keep pre-existing `.single()` when plan specifies `.maybeSingle()` | 2026-07-13 | 1 | 2026-07-13 | RESOLVED (#1121) — 3 seed scripts switched; the 0-row branches are now reachable. |
| Restore UPDATE on a just-fetched row omits `.select('id')` zero-row no-op chain | 2026-07-13 | 1 | 2026-07-13 | WATCHING. SUGGESTION class only — zero-row is impossible when the id comes from a committed query in the same request (#1121). |
| Soft-delete restore UPDATE clears `deleted_at` but omits sibling nullable column (`deleted_by`) | 2026-07-13 | 1 | 2026-07-13 | WATCHING. 8 seed scripts missed `deleted_by: null` (#1119). Check the types.ts Update shape on restore. |
| `\|\| exit 1` inside `$(...)` aborts only the subshell, not the outer command | 2026-07-23 | 1 | 2026-07-23 | RESOLVED. Correct pattern: resolve into a var, guard in the OUTER shell (`BASE=$(cmd) \|\| { exit 1; }`), then use `"$BASE"` (#1137). |
| Cross-file prose divergence: rule clarified/retired in one surface, sibling surface left enumerating the old set | 2026-07-23 | 2 | 2026-08-15 | RULE CANDIDATE (was RESOLVED at #1137). Grep every surface that ENUMERATES the rule set. †
| Rules-file edit bumps one rules file's `Last updated` footer but not a sibling's, same commit | 2026-08-08 | 1 | 2026-08-08 | WATCHING. #1162. Distinct from cross-file prose divergence (that is rule TEXT drifting). †
| Playwright `getByRole('dialog')` used on a Base UI **AlertDialog** (role=`alertdialog`) | 2026-08-09 | 1 | 2026-08-09 | WATCHING. `queryRole` is strict role equality — no superclass matching, so the locator never resolves. Check which primitive the component uses (#815/#367). †
| Redirect target copied from a sibling helper without checking the route EXISTS (no `page.tsx`) | 2026-08-09 | 1 | 2026-08-09 | WATCHING. Before approving any new redirect literal, `find app -path '*<seg>/page.tsx'` (#1167). †
| Pre-existing UNTRACKED files swept into a scoped fixup commit by a broad `git add <dir>` | 2026-08-15 | 1 | 2026-08-15 | WATCHING. Diff the staged FILE LIST against the commit's stated scope; session-start `git status` names the pre-existing untracked set. †
| Claim-correction commit introduces a NEW wrong count/label/ENUMERATION while fixing others | 2026-08-15 | 2 | 2026-08-17 | RULE CANDIDATE. Every NEW claim in a correction commit needs the same measurement the corrected one got. #1207: a §10 comment rewritten to fix an omission ("unlike the precedents") asserted "quiz-recovery-handlers.ts is THE one that shares this exposure" — `resume-exam-handlers.ts` shares it too, and points AT that comment as canonical. Re-derive the SET, don't patch the sentence. † |
| New app-layer integration test reuses a REAL seeded reference code + omits `cleanupReferenceData` | 2026-08-09 | 1 | 2026-08-09 | WATCHING. `seedReferenceData` upserts `onConflict: 'code'` — use a unique suffixed code, like all 20 siblings. †
| A new authoring guard is justified by a RUNTIME/UI mechanism the component contradicts | 2026-08-17 | 1 | 2026-08-17 | WATCHING. §10 beyond SQL. `mc-content.ts`/importer claimed an option-id gap "leaves the runner rendering labels that skip a letter"; `answer-options.tsx` labels by ARRAY INDEX (`LETTERS[index]`), so a gap MISLABELS, never skips. Read the renderer before writing why a content rule exists. |
| New gate module ships a corpus-level export with ZERO non-test call sites while the commit comment claims importer/suite parity | 2026-08-17 | 1 | 2026-08-17 | WATCHING. `assertMcKeyBalance` is test-only; the importer imports only `assertMcItem`. Grep call sites of every export before accepting a "cannot drift apart" claim. |
| Content-file `authoring_notes` asserts a corpus invariant the shipped corpus violates | 2026-08-17 | 1 | 2026-08-17 | WATCHING. Part 3 MC R6: "longest in several others" = 1/18; "every option is lower-cased" = 20 texts start Adria/QNH/SQUAWK. Measure every countable claim in authoring_notes against the JSON. |

## Durable knowledge

- **CREATE OR REPLACE trace before flagging.** Trace to the LATEST migration definition first. Grep BOTH `CREATE OR REPLACE FUNCTION <fn>` AND bare `CREATE FUNCTION <fn>` (DROP+recreate form) — a CREATE-OR-REPLACE-only grep returns a superseded file as "latest".
- **Migration source of truth: `supabase/migrations/` ONLY.** `packages/db/migrations/` was FROZEN 2026-07-11 (historical, missing 81/222 files). Never flag a missing counterpart there; never cite it for current SQL.
- **Every start RPC auto-clears the caller's active `discovery` row** (migs 137/141/138/139/140, unconditionally, before the single-active guard), so an orphaned discovery row can never strand a user. Reject any comment claiming an orphan "blocks the retry". †
- **Security §11 (multi-permissive RLS) self-scope is load-bearing.** Per-caller RPCs reading multi-permissive tables must keep the explicit `<owner> = auth.uid()` predicate — RLS ORs the broader policy. Do not suggest removing it. †
- **types.ts nullable-SQL-column convention.** RPC entries may type nullable SQL columns as non-nullable; production query files carry their own local Row type. Not a deviation; SUGGESTION at most. †
- **types.ts stale column after DROP+CREATE migration: ISSUE class when not in staged diff.** When a DROP+CREATE removes a RETURNS TABLE column, types.ts must drop it too (#471). †
- **`rpc`/`authRpc` wrapper contract.** Returns `{ data, error }`, never throws on query errors, so `Promise.all([rpc(...), supabase.from(...)])` carries no unhandled-rejection risk. `fetchAllRows` guarantees `data: T[]` — `?? []` after it is redundant.
- **Bounded-await helpers never reject.** The `Promise.race([...]).finally(clearTimeout)` shape (code-style §6) cannot reject or leak its timer — `.finally` attaches at CREATION, not at the await site. Abandoning such a promise is safe; do NOT flag it.
- **Doc-only commits: mig comment vs guard line range.** When a citation spans comment+code, the code-only sub-range is more precise (mig 117; clean on #918). †
- **Count/page filter symmetry (pagination).** Count + paginated page query must carry byte-identical WHERE filters. `.order(...)` additions affect only the page query and never the count — adding an id tiebreaker does not break symmetry.
- **Offset-pagination id tiebreaker is the house pattern.** `.order('<ts>', {ascending:false}).order('id', {ascending:false})` + a one-line comment above the primary order. Canonical: `internal-exams/queries.ts`. `.limit(N)` reads (no `.range()`) do not need it.
- **Test title impl-detail leakage (code-style §7).** `it(...)` titles must not name internal helpers/types/validator branches; public props/SDK methods/Server-Action + RPC names ARE permitted. Audit inline comments after a title rename. †
- **Dead mock branches in test helpers — ISSUE class, not cosmetic.** Remove `if (table === 'X')` branches for tables the SUT no longer reads so the `Unexpected table` throw fires (PR-A1 dashboard.test.ts). †

### Cached-role pattern in SECURITY DEFINER RPCs

- **Cached role variable prevents NOT NULL abort on delayed soft-delete.** Fetch the actor's role once at authz time — an inline audit-INSERT subquery returns NULL on mid-txn soft-delete. §10 filter still required on the capturing SELECT. †
- **NULL-org guard doubles as NULL-role guard when role is fetched on the same SELECT.** After `SELECT u.organization_id, u.role INTO v_admin_org, v_admin_role`, the `IF v_admin_org IS NULL` guard ensures v_admin_role is non-null too.
- **ELP grader (`write_oral_section_grade`)** — section-row → session-row lock order with no inverse ordering, so no deadlock; its `auth.uid() IS NOT NULL → RAISE` guard is defense-in-depth for a service-role-only caller. Do NOT flag it. †

### Tooling/config

- **knip `ignoreDependencies` is workspace-scoped.** Use it inside the workspace key; `ignoreBinaries` + `ignore` live at top level. Verified clean on #325.
- **`@repo/ui` is a dep in `apps/web/package.json` with no `@repo/ui` import** — `packages/ui/src/index.ts` exports `{}` (Phase 5 placeholder). Ignoring it in knip is intentional.
- **Broad grep for component names returns false-positive matches** when siblings use same-named primitives from `@base-ui/react` directly (`SelectSeparator` uses `SelectPrimitive.Separator`). Verify import path, not just symbol name.
- **Tailwind v4 `@plugin` directive placement** — after all `@import`, before `@custom-variant`/`@theme`. Verified #325.
- **Playwright project ordering = dependency-depth PHASES, not config order.** Adding ONE `dependencies:` edge re-partitions EVERY project's phase; projects inside a phase interleave with no defined order even at `workers: 1` (#1143). †
- **Comment-only diffs: scope the review to §10 + §7.** When every `+`/`-` line is a `//` comment or an `it('…')` title, only comment accuracy (§10) and test naming (§7) are in scope — do not hunt for runtime defects that the diff cannot contain. Pairs with the CLAUDE.md stop rule: on a review-follow-up commit, act only on CRITICAL/ISSUE naming a *runtime* defect, and never on wording findings against prose the follow-up itself just rewrote.
- **`get-active-practice-session.ts`'s Discovery soft-delete claim is VERIFIED** (do not re-flag): `start_discovery_session`, mig `20260629000200`, does `UPDATE quiz_sessions SET deleted_at = now() WHERE mode = 'discovery' AND ended_at IS NULL AND deleted_at IS NULL` before inserting its new row.
- **localStorage read-then-delete in the discard handlers is cross-tab only** (#1205, PR #1207): two adjacent synchronous calls, strictly safer than the prior unconditional clear, and superseded by the server-side checkpointing in #1026/#1205. Deferral validated — do not re-raise as a race.

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
- **`blanks.every(...)` vacuous-true on `[]` is unreachable in the dialog-fill a11y path** — dialog_fill requires ≥1 `{{n}}` blank (mig 131 trigger), so feedback always has ≥1 entry. Not a missing empty-guard (`56678b99`). †

## Topic pointers

- [commit-notes](topics/commit-notes.md) — per-PR approval narrative + positive-patterns log (relocated for budget, #953)
- [tracker-archive](topics/tracker-archive.md) — older impl-critic findings (two dated spec-notes + the older "Positive patterns" approval log, pre-2026-06-07)
