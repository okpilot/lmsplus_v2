# implementation-critic — commit notes archive

> Per-PR approval narrative and the positive-patterns log, relocated out of `MEMORY.md`
> (#953 budget curation). The live tracker, durable knowledge, and false-positives stay in
> `MEMORY.md`; this file holds the verbose per-commit detail. History also lives in `git log`.

## Positive-pattern log

### batch/928-1010-1041-client-hardening CR-round-2 fixup (2026-07-13)

CLEAN. 12 files, 0 critical, 0 issues, 0 suggestions. All 7 plan items verified:
- (a) RecoveryDeps type conversion behavior-preserving: Pick<> signatures match original positional params exactly (Resume: userId+session+setError+router; Save: all 7; Discard: userId+session+inFlightRef+setSession); `inFlightRef: actionInFlightRef` key mapping in hook correct; `deps.router.refresh()` (non-terminal) preserved; all call sites confirmed via tsc-clean + grep.
- (b) "unfinished session" string: no test in start-handler-shared.test.ts / quiz-start-handlers.test.ts / exam-start-handlers.test.ts asserts the literal; start-handler-shared.test.ts uses `expect.stringContaining` with activity noun / subject name only. Safe.
- (c) buildRecoveryResume success test: `toSessionData` is the REAL function (not mocked — quiz-session-storage has no vi.mock); success assertion is non-vacuous. Failure test correctly derives `setResumeError('RPC error')` from QUESTIONS_FAILURE.error via real loadSessionData chain.
- (d) 12 files only — stat confirmed.
- (e) Worktrees using old positional signatures are separate branches, not staged — out of scope per critic rules.

### batch/928-1010-1041-client-hardening CR-round-1 fixup (2026-07-13)

CLEAN. 8 files, 0 critical, 0 issues, 0 suggestions. Checklist all clear:
- (a) Lock/reset semantics: cleanup helpers called before failStart; helpers internally try/catch, never propagate; failStart always reached → inFlight.current = false guaranteed. Matches exam-start-handlers.ts reference shape exactly.
- (b) Bounded flag fetch: `flags` has `.catch(()=>[])`, `timeout` only resolves → `Promise.race` always resolves; `.finally(()=>clearTimeout(timer))` runs on both paths (no leak); `loadSessionQuestions` NOT inside fetchFlaggedIdsBounded (stays unbounded). Correct.
- (c) No action files (study.ts, end-discovery.ts, discard.ts) in diff — imports only. Correct.
- (d) Fake-timer test: `vi.useRealTimers()` in `finally` block — restores on all paths. Correct.
- (e) Nothing unplanned — all 8 diff files match the 8 plan items.

Pattern: `Promise.race + .catch(() => []) + .finally(() => clearTimeout)` for cosmetic fetches with a hard timeout ceiling — first correct use of this shape in the codebase. Reference for future bounded-await implementations.

## Tracker-row & false-positive detail relocated from MEMORY.md (2026-07-11 budget curation)

Verbose bodies moved here verbatim; the MEMORY.md rows/bullets keep a terse summary + pointer.

### Row: Thin-wrapper page-error tests — mock-dependency form is valid (2026-06-01 / 2026-06-25)

WATCHING. PR-A4 (#699) 7 fetchUser* fns are pure `return fetchAllRows(...)` — no mapping. Mock-the-dependency proves propagation completely; non-vacuous because fetchAllRows is the ONLY path. Do NOT flag as "bypassing production logic". Count=2: PR #992 quiz-report{,-questions}.test.ts §7 page-error tests `vi.mock('@/lib/supabase-paginate')` + `mockResolvedValueOnce({data:[],error})` → assert caller surfaces error. Valid even when the caller DOES transform the result (here it counts/builds), because fetchAllRows is the only fetch path for that read. The §7 rule's "helper mocked as a dependency" form explicitly permits this.

### Row: Fractional partial-credit SUM through an `int` plpgsql variable (2026-06-21)

WATCHING. VFR RT Phase 2.3 mig 121 `batch_submit_quiz`: `SELECT sum(LEAST(correct_rows::numeric/total_blanks,1.0)) INTO v_correct_count` where `v_correct_count int` → implicit numeric→int ROUNDS the dialog_fill partial-credit sum BEFORE `v_score=round(v_correct_count::numeric/total*100,2)`. MC/short = lossless; dialog_fill partial (0.667) silently rounds to 1.0. Decision 47 documents partial credit → true deviation. Precedent mig 113 feeds `avg(LEAST(...))` into `numeric(5,2)`, never int. When a fractional aggregate is computed, verify the receiving var is `numeric` until after the percentage is derived.

### Row: packages/db migration NNN prefix collision across parallel unmerged branches (2026-06-26)

WATCHING. study-mode added `packages/db/134_*`,`135_*` (off master @ Phase4 base = 133); the unmerged feat/vfr-rt-training-phase5 (PR #998) ALSO claims `packages/db/134_*`..`140_*`. supabase timestamp files do NOT collide (20260626 vs 20260625) — only the NNN prefixes do. Not a defect in either staged diff; it's a merge-sequencing hazard. Whichever merges 2nd must renumber. Flag to orchestrator when two in-flight branches both number off the same baseline.

### Row: Agent-memory stub rows require archive to already contain the full entry (2026-06-22)

WATCHING. #948 learner MEMORY.md: stub rows pointed to tracker-archive.md but 9 had no corresponding full entry (6 fuzzy-matched differently-worded; 2 PROMOTED in the live table; 1 under a different suffix). All content conserved. Pre-check before flagging stub-row-with-no-archive-match: fuzzy grep the archive, check the live table, check different suffix forms.

### Row: Integration test fixture type changed to satisfy a new write-time trigger (2026-06-24)

WATCHING. #828 fix commit: `rpc-vfr-rt-constraint-regression.integration.test.ts` describe-block fixture retargeted from `short_answer` to `dialog_fill`. Root: mig 131 BEFORE INSERT trigger enforces `question_type='dialog_fill' ⇔ blank_index IS NOT NULL`; a `short_answer` fixture with `blank_index=-1` would now be blocked by the trigger (ERRCODE 23514) instead of the `answer_shape_check` CHECK — the test would still get a 23514 but the wrong constraint would be under test. The fix (dialog_fill + dialog_template + blanks_config; canonical_answer dropped; accepted_synonyms stays []) routes the -1 rejection to the CHECK (trigger passes, CHECK fires) as intended. POSITIVE: the fixture is fully valid per mig 094 `questions_question_type_columns_check`; all 4 tests are semantically correct. Pattern to watch: when a new trigger rejects a previously-valid constraint-regression fixture, the fixture type must be updated to the type the trigger ALLOWS, so the original CHECK remains the first-line constraint under test.

### Row: Unit test updated to throw; integration test still asserts old return-[] (2026-06-26)

WATCHING. Study-mode CR-fix: `study-queries.ts` changed from returning `[]` to throwing on RPC error. Unit test correctly updated (`.rejects.toThrow`). But integration test "returns an empty array when called without authentication" (line 174) still asserts `expect(result).toEqual([])` — the RPC explicitly raises "Not authenticated" (RAISE EXCEPTION, migration 20260626000200 L55-56), so the helper throws and the test fails in CI. Header comment on L10 also stale ("helper returns []"). When a query helper's error posture changes from return-empty to throw, grep the integration test for all assertions on the old return value (not just the unit test) before committing. NOTE: The round-2 fix batch (`getRandomQuestionIds` throw) confirmed the pattern works in reverse — when the helper has NO integration test tier, only the unit test needs updating, and both SA callers correctly wrapped in try/catch.

### FP: #1011 merge-fix studentId-scoped clearActiveSessions (verified clean, VFR-RT Phase 5 ordering merge #998)

**#1011 merge-fix `beforeEach(() => clearActiveSessions({ admin, studentIds: [studentId] }))` is correctly studentId-scoped, NOT org-wide.** After master's single-active-session invariant (mig 136, `uq_one_active_session_per_student`), integration suites that reuse ONE test student across many `start_quiz_session` calls must clear the prior test's still-active session before the next start raises `another_session_active`. When the suite ALSO spins up per-test students that intentionally HOLD an active session (soft-deleted-caller, other-student-ownership tests), the clear must be `studentIds: [studentId]` — an org-wide `orgId` clear would wipe those held sessions. Established master pattern: `rpc-check-non-mc-answer.integration.test.ts:173`. Do not suggest switching to `orgId`. Throwaway-org suites with no held per-test sessions correctly use `orgId` (start-session/submit-answer/complete-session/check-answer).

### FP: `blanks.every()` vacuous-true unreachable in dialog-fill a11y path (Phase 3 round-4 commit 56678b99)

**`blanks.every(b => b.isCorrect)` vacuous-true on `[]` is unreachable in the dialog-fill a11y path.** `dialog-fill-input.tsx` `allBlanksCorrect = graded && blanks.every(...)` would announce sr-only "Correct" for an empty `blanks` array. But `graded = locked && blanks != null`, and the grading path (`check-non-mc-answer-helpers.ts`) derives `blanks` from the template's blank indices — a dialog_fill question requires ≥1 `{{n}}` marker (mig 131 `blank_index ⇔ dialog_fill` trigger), so feedback always has ≥1 entry. Even the degenerate case is sr-only-text-only (no scoring/data impact). Do not flag as a missing empty-guard.

### Row: Dead helper in test file → Biome noUnusedVariables/noThenProperty pre-commit fail (2026-04-11 / 2026-05-27)

RULE CANDIDATE. queries.test.ts `buildChain`; PR-C `buildAnswersClient` (147 lines). Grep call sites for any large test helper before approving — delete if only self-referenced.

### Row: Hard DELETE on quiz_sessions in red-team afterAll/afterEach (2026-06-05)

WATCHING. #611 quiz-session-score-forgery.spec.ts afterAll used `.delete()` on quiz_sessions. Sibling specs use soft-delete. docs/database.md matrix marks quiz_sessions soft-delete only. Flag as ISSUE in future specs.

### Row: Conditional redirect regression when helper return value discarded (2026-04-14)

WATCHING. `handleSubmitSession` discarded `discardQuizSession` result; `router.push` fires only on success → stranded user. Check callers of helpers that made an unconditional side-effect conditional.

### Durable: Security §11 (multi-permissive RLS) self-scope is load-bearing

**Security §11 (multi-permissive RLS) self-scope is load-bearing.** Per-caller RPCs reading `student_responses`/`quiz_sessions`/`exam_configs`/`audit_events` must carry an explicit `<owner> = auth.uid()` predicate even with SECURITY INVOKER + RLS — RLS ORs the broader instructor/admin policy. The predicate is correct, not redundant; do not suggest removing it.

### Durable: Doc-only commits — mig comment vs guard line range

**Doc-only commits: mig comment vs guard line range.** `L69-75`→`L73-75` on mig 117 is a valid finding class: L69-72 was the comment block, L73-75 is the IF/RAISE/END IF. When a citation spans comment+code, the code-only sub-range is more precise. Confirmed clean on #918.

### Durable: Test title impl-detail leakage (code-style §7)

**Test title impl-detail leakage (code-style §7).** `it(...)` titles must not name internal helpers/types/validator branches (`forwards X to fetchAllRows`, `from FooOpts`, `typeof guard`). Public props, public SDK methods, integration-boundary RPC names ARE permitted (contracts). Audit inline comments after a title rename — they often go stale.

### FP: `count(*) OVER()` window with `p_limit:1` probe

**`count(*) OVER()` window with `p_limit:1` probe** still returns correct `total_count` — Postgres evaluates the window before LIMIT/OFFSET (verified mig `20260429000011` L64). Do not flag probe-limit as "may return wrong total".

### Row: Zero-row no-op — UPDATE/DELETE missing `.select('id')` + `data?.length` check (2026-04-10 → 2026-06-06)

PROMOTED → code-style.md §5. Recurs in prod (toggleExamConfig) AND test helpers (#622 afterEach, backdateSession, PR-A session-replay.spec.ts #256 question soft-delete + restore, PR-7 BE org-transfer). Still flag in new code. `cleanupReferenceData` split (#775 setup→cleanup.ts) confirmed clean.

### Row: Error message refactor breaks paired test assertion regex (2026-05-06)

WATCHING. #628 `pickSubjectWithQuestions` dropped "in org" suffix; seed.test.ts:152 regex stale. Grep test files for old message substring when context strings (orgId, table name, filter clause) change. #709 helper extraction kept message byte-identical — no recurrence.

### Row: Too-lenient INSERT rejection assertion — OR-branch allows vacuous pass (2026-05-31 / 2026-06-10)

RULE CANDIDATE. #314 flag-idor + server-action-unauthenticated used `expect(error !== null || (data?.length ?? 0) === 0).toBe(true)`. Count=2: feat/697 mig-094 CHECK tests used `errMsg.includes('23514')||...` boolean instead of `expect(error?.code).toBe('23514')`. PostgrestError always has `.code` (SQLSTATE) on `.from().insert()` AND `.rpc()` — assert it directly.

### Row: New _hooks/ util extracted without co-located test (2026-06-01 / 2026-06-20)

RULE CANDIDATE. PR-B1 (#565) quiz-recovery-handlers.ts; VFR RT Phase 1 use-vfr-rt-start.ts (90 lines) — both added to _hooks/ without a .test.ts. code-style.md §7 requires tests for new _hooks/ utilities. Flag as ISSUE on all future _hooks/ util additions lacking a test.

### Row: #582 Readonly<Props> sweep — plan said "5 exist", reconciled to 3 (2026-06-01)

WATCHING. 3 named `Readonly<Props>`; 1 remaining inline `Readonly<{...}>` in admin-internal-exam-report-header.tsx is a different idiom. Plan reconciled to 3 before execution — correct, no false positive. Track whether inline Readonly<{...}> should also be normalised.

### Row: Security.md doc bullet claims RPC performs capability it doesn't have (2026-06-05)

RESOLVED. AJ bullet (v1) claimed `upsert_exam_config` performs "audit logging" — RPC has no `INSERT INTO audit_events`. Revised bullet correct (verified vs mig 20260411000007/000008). Rule: when a doc bullet describes what an RPC "does", read the latest CREATE OR REPLACE before approving.

### Row: Doc describes trigger exemption/guard ordering that doesn't match the actual migration body (2026-06-06)

WATCHING. Batch A: (1) database.md described mig 089 trigger with `current_role != 'service_role'` exemption — actual body unconditional. (2) validation contract showed `too_many_questions` before `no_questions_provided` — mig 086 has the reverse. #532 mig 092 round-1 comment claimed "No admin-void path sets ended_at" — wrong; fixed round-2. When plan/migration comments claim which callers fire a trigger, grep `SET ended_at` across all RPCs before approving.

### Row: Cross-org red-team Attack uses sentinel UUID because target org has no seeded questions (2026-06-06)

WATCHING. #625 Attack 1: target=redteam-other-org (no seeded Qs) → falls back to sentinel '00000000-...' → proves "unknown UUID rejected", NOT "cross-org org guard fires". Fix: throw if other-org has no questions, or flip attacker/victim perspective (pattern in #623).

### Row: DB CHECK constraint violation from too-long document_version in test seed (2026-06-06)

WATCHING. PR-7 rpc-cross-tenant-x-1.0 (22 chars) exceeds BETWEEN 1 AND 20 on user_consents.document_version. Also dead constants (21 chars) in seed.ts. When seeding user_consents, count chars against the 20-char constraint.

### Row: Doc new-section insertion duplicates existing heading/entry (2026-06-10)

WATCHING. VFR RT Phase A: new plan.md section caused duplicate `## Security & Test-Hardening Sprint` heading; database.md RPC summary got a 2nd `complete_empty_exam_session` row. When inserting a section before an existing one, grep the target for the first line of the existing section to verify no duplicate.

### Row: plan.md integration-test count wrong — pre-existing wrong baseline propagated to new "now N" claim (2026-06-11)

FALSE POSITIVE (reconciled by orchestrator). The plan.md count literal convention is the VITEST RUNTIME total (`pnpm --filter @repo/db test:integration` summary), NOT a static `it(` grep (`test.each` undercounts). Vitest reported 136 at Phase A gate, 144 on branch — both claims correct. Do NOT re-raise count findings from static grep; verify via the run summary.

### Row: Red-team results spec uses wrong vector ID sub-labels — DB2/DB3 instead of DR2/DR3 (2026-06-14)

WATCHING. #825 rpc-vfr-rt-results.spec.ts header/titles use `DB2`/`DB3` — but matrix vector `DB` is the internal-exam double-redemption vector. Correct IDs are `DR2`/`DR3` (DR covers get_vfr_rt_exam_results). When writing specs covering sub-vectors of an existing matrix entry, use the matrix vector ID as prefix.

### Row: Red-team non-vacuity read missing `enabled` filter that the RPC itself uses (2026-06-14)

WATCHING. #825 DN2 cross-org config non-vacuity check: RPC filters `enabled = true` AND `deleted_at IS NULL`, but the test's absence proof filtered only org_id+subject_id+deleted_at (no `enabled`). A disabled config in attacker's org → `crossOrgConfig` non-null → false positive. Non-vacuity reads mirroring an RPC's filter must use ALL the same predicates.

### Row: Namespace written to localStorage during quiz session but never in RT path (2026-06-20)

WATCHING. VFR RT Phase 1: `use-vfr-rt-start.ts` reads/clears `RT_STORAGE_NAMESPACE`, but the runner (`useQuizPersistence`→`writeActiveSession`) always uses the default `quiz-active-session:userId` key. RT namespace only guards the pre-start confirm; once active the runner checkpoints to the quiz key → next checkpoint by an open quiz tab overwrites the RT session. Flag when a new storage namespace isn't threaded through to the persistence hook.

### Row: Pre-existing file-size violations worsened by bug-fix commits (2026-06-21)

WATCHING. #909: quiz-submit.ts (219→232, limit 200) and use-quiz-submit.ts (101→125, limit 80) both pre-existing over-limit; fix modestly expands both. agent-code-reviewer.md says "only flag size violations introduced or worsened by the commit" — technically worsened by + lines. SUGGESTION class for bug-fix context (splitting would be a separate refactor, tracked in #887).

### Row: Header comment cross-references a block "above" that no longer exists after extraction (2026-06-23)

RESOLVED. #951 new file header comment: "same reasoning as the mig 094 block above" — the mig 094 block is in the source file, not the new standalone file. SUGGESTION class: stale comment. Not present in HEAD for the standalone file — was fixed in the original #951 commit. When moving a describe block with cross-referencing comments, audit for forward/back references ("above", "below", "see block N") before committing.

### Durable: types.ts nullable-SQL-column convention

**types.ts nullable-SQL-column convention.** Admin/student RPC entries in `packages/db` `types.ts` may type nullable SQL columns as non-nullable (`avg_score: number`) — matches `get_admin_student_stats`. Production query files use the `authRpc`/`rpc` wrapper with their own local Row type capturing nullability. Not a deviation; SUGGESTION at most.

### Durable: types.ts stale column after DROP+CREATE migration — ISSUE class

**types.ts stale column after DROP+CREATE migration: ISSUE class when not in staged diff.** When a migration uses DROP FUNCTION + CREATE to change a RETURNS TABLE (removing a column), `packages/db/src/types.ts` must also drop the column from the Returns type. Auto-generated but committed — when not in the staged diff, flag as ISSUE. First seen: #471 `get_session_reports` dropped `answered_count`, types.ts:1385 not updated.

### Durable: Dead mock branches in test helpers — ISSUE class, not cosmetic

**Dead mock branches in test helpers — ISSUE class, not cosmetic.** When a test mocks `mockFrom` with a per-table dispatcher, any `if (table === 'X')` branch for a table the SUT no longer reads is dead code. The `throw new Error('Unexpected table: X')` guard means the dead branch was written defensively — but it masks future regressions where the SUT unexpectedly reads the dead table. Remove dead branches so the guard fires. First seen: PR-A1 dashboard.test.ts:383 `easa_topics`.

### Durable: Cached role variable prevents NOT NULL abort on delayed soft-delete

**Cached role variable prevents NOT NULL abort on delayed soft-delete.** When a SECURITY DEFINER RPC inserts into `audit_events` (actor_role TEXT NOT NULL), the actor's role must be fetched once into a local variable at authz time — not via repeated inline subqueries. An inline `(SELECT u.role ... WHERE u.id = v_admin_id AND u.deleted_at IS NULL)` in the INSERT VALUES returns NULL if the admin is soft-deleted between authz and the audit insert, aborting the transaction on the NOT NULL constraint. Pattern: mig 078 (batch_submit) → mig 084 (void_internal_exam_code, PR #731). security.md §10 deleted_at filter still required on the capturing SELECT.

### Durable: ELP grader lock order + service-role-only guard

**ELP grader (`write_oral_section_grade`) lock order is section-row → session-row; the student `submit_oral_section_response` locks only the session (FOR UPDATE) + inserts a NEW response row.** No inverse (session→existing-response) ordering exists, so no deadlock between concurrent grader/submit/two-grader calls. The grader's `IF auth.uid() IS NOT NULL THEN RAISE 'forbidden'` is pure defense-in-depth (primary control is REVOKE-from-authenticated + GRANT service_role); legitimate callers are service-role only (auth.uid() NULL), integration tests grade via `admin.rpc(...)` so the guard never fires on them. Do NOT flag it as blocking the grader path. Verified clean on the ELP Slice-0 CR-fixup (2026-07-02).

### FP: Probe-gate keyed on allRows (pre-filter) is correct

**Probe-gate keyed on allRows (pre-filter) is correct.** `probeOutOfRangeTotal` triggers only when `allRows.length === 0 && page > 1`. When `allRows` is non-empty but `rows` (post-filter) is empty, returns `totalCount: 0` without probing — correct. Do not flag `rows.length === 0 → totalCount: 0` as "missing probe".

### FP: Red-team spec with no afterEach is hermetic (#518/#638)

**Red-team spec with no `afterEach` is hermetic** when each test seeds NEW unique rows and doesn't mutate shared beforeAll state — confirmed rpc-void-internal-exam-code.spec.ts (#518/#638): DD/DE leave code rows un-voided (RPC rejects before write); DF/DG/CD/positive touch only own rows. Do not flag as hermiticity violation.

### FP: try/finally hermiticity hardening for org-transfer tests (#768)

**try/finally hermiticity hardening for org-transfer tests (#768)** — seed-insert + transfer UPDATE inside `try` + `let ... = null` before `try` is correct when a mid-test throw could strand shared state. Finally must use `console.error`, not `expect()`. Clean on #768.

## fix/pipeline-audit-remediation Commit 2 — production migration hard-stop + /endrun wiring — APPROVED (2026-07-11)

3 command .md files, ~12 lines added. All 4 spec requirements verified:
- Hard-stop blockquote is the first element under "Merge policy" in automerge.md — no plausible skip path. Conditions list unreachable for migration PRs.
- `packages/db/migrations/**` mirror, handoff-note language, LLM-override rejection, and `production`-environment-as-backstop language all present.
- db-deploy.yml `environment: production` at line 40 confirmed by grep.
- P7 pre-commit claim corrected: "the two mechanical guards — unit tests deliberately do NOT run pre-commit; first test execution is CI." Factually accurate.
- /endrun wired in terminal position in all 3 files: automerge.md last post-merge bullet; autonomerge.md step 4 after the handoff report; wrapup.md Section 7 (last section).
- autonomerge.md one-line WHY present under "Merge policy — 🛑 DO NOT MERGE" with the "even if this command's no-merge rule is ever loosened" future-proofing clause.
- No contradiction with automerge.md:27 two-dir-mirror line (consistent `packages/db/migrations/**` reference).
1 SUGGESTION: P7 parenthetical has a period mid-sentence before "commit-msg: conventional format" — a semicolon would match the original delimiter rhythm and remove the ambiguity. Non-blocking.
0 critical, 0 issues.

## fix/pipeline-audit-remediation: stdin error handlers + tests — APPROVED (2026-07-11)

4 files, 116 lines added. Semantic-reviewer SUGGESTION (explicit stdin 'error' handlers) applied cleanly in both guard-bash.js and review-gate.js. Test-writer additions (guard-bash case 5 + new cr-local-plan-reminder.test.sh) all pass (5/5 each). Verified:
- Error handlers registered BEFORE data/end handlers in both files — correct Node.js stream ordering.
- Error handlers call `process.exit(0)` (fail-open) + `console.error` to stderr — observable.
- Block/exit-2 path (the 'end' handler) is untouched in both files.
- guard-bash.test.mjs case 5: flat JSON `{"command":"DROP DATABASE x"}` → exit 2, BLOCKED in stderr. Correct.
- cr-local-plan-reminder.test.sh 5 cases: nested match fires, non-match silent, flat match fires, empty silent, garbage silent. All pass.
- No unrelated staged hunks.
0 critical, 0 issues, 0 suggestions.

## #1097 CR-local fixup round-2 (redirectOnPageOverflow extraction + ReportCard props test) — APPROVED (2026-07-10)

3 CR findings applied. 4 files changed. Verified:
- `redirectOnPageOverflow` formula, `>` comparison, and redirect URL template are byte-identical to the removed inline block. Argument order at call site correct.
- ReportCard props test: `page=2, totalCount=12, PAGE_SIZE=10 → totalPages=2 → 2 > 2 = false → no redirect → render path reached`. `expect.objectContaining` asserts all 5 data props.
- 4 unit tests non-vacuous; `Math.max(1,…)` floor tested by zero-count case. `vi.hoisted(() => vi.fn())` pattern correct.
0 critical, 0 issues, 0 suggestions.

## #1097 CR-local fixup round-1 (report-view-logic extraction + cast-guard) — APPROVED (2026-07-08)

5 CR findings applied. 7 files changed. Verified:
- `canonicalReportBasePath`, `namespaceHome`, `UUID_RE`, `ReportNamespace` extracted byte-for-byte from `report-view.tsx` to `_utils/report-view-logic.ts`; `redirect()` still throws; `isVfrRtPracticeReport` is a pure function (no mock needed in the new test).
- Cast guard in `resolve-subject-info.ts`: `as { name: unknown; code: unknown }` + `typeof x === 'string' ? x : null` narrowing is correct; only affects malformed DB rows.
- `Props` still `Readonly<{...}>`; no barrel file; no `any`.
- `report-view-logic.test.ts` asserts exact redirect URLs (e.g. `/app/vfr-rt/report?session=${UUID}&page=1`). 5 cases cover all branches.
- `QuizReportView` body 34 lines (23–56) — within the 35-line Server Component orchestrator boundary.
- New `_utils/` file ships co-located `.test.ts` (code-style §7 compliant).
0 critical, 0 issues, 0 suggestions.

## seed-vfr-rt-pool CR-round-4 robustness fixes — APPROVED (2026-07-03)

Test-infra only (2 files). Fix A: `buildVfrRtAnswers` else-branch correctly placed after `multiple_choice`; 3 known types unaffected; throw unreachable for callers using the VFR-RT seeded pool (short_answer/dialog_fill/multiple_choice only). Test title "throws on a question_type outside the RT pool" is behavior-first. Fix B: `insertRows` type-predicate `(r): r is {id:string}` uses `{id?:unknown}` cast (not `any`) + no unchecked cast in `data.map((r) => r.id)` after predicate narrows type. 0 critical, 0 issues, 0 suggestions.

## #1061+#1076 rule-promotion docs-only — APPROVED (2026-07-03)

Docs/config promotion PR: code-style.md (§5 fan-out Array.isArray + §7 COALESCE vacuity), agent-doc-updater.md (file-path cite count 2→3), agent-coderabbit-local.md (pitfall #7 broadened to cloud CR, count=4), .coderabbit.yaml (2 mirror bullets). 0 critical, 0 issues, 0 suggestions.

## #1061+#1076 rule-promotion fixup — APPROVED (2026-07-03)

8-line docs-only fixup applying 5 post-commit findings: (1) §5 Fan-Out prose reworded for clarity ("empty array stays in the array branch" unambiguous); (2) §7 CORRECT block gained concrete seedActor({role:'admin'})+expect(..).toBe('admin') — non-vacuous example, fence balanced; (3) §8 new bullet mirrors the fan-out rule; (4) §5 count attribution reconciled (learner logged count=3 counting `mapping` as an instance, git shows only order/blankAnswers were ever defective — ≥2 threshold met, reconciliation prose added); (5) pitfall #7 count 4→5 with explanatory 4th-instance prose to match learner tracker row 59 (count=5, authoritative). 0 critical, 0 issues, 0 suggestions.

Verification checklist passed:
- All 3 new SHAs (75ea1de8, 2e8aaf7b, 0168f7dc) confirmed master-reachable via git merge-base.
- Pre-existing ee4d5544 preserved verbatim in agent-doc-updater.md.
- Code fences balanced in both new rules.
- .coderabbit.yaml new bullets at 8-space indent matching siblings.
- Counts/dates internally consistent (doc-updater 2→3, CR-local 3→4, both 2026-07-03).
- Exactly 4 files staged; no production code, no agent-memory files.

## PR-4 refactor/quiz-session-splits — APPROVED (2026-07-03)

Pure-structural splits of 4 over-cap files. 0 critical, 0 issues, 0 suggestions.

Positive patterns confirmed:
- Builder-factory extraction (buildHandleSubmit/buildHandleSave/buildHandleDiscard) correctly preserves synchronous ref behavior: inFlight/submitted refs passed via deps object remain stable; handlers recreated each render exactly as before. No stale-closure regression.
- useEffect reset (confirmingDiscard/confirmingSubmit) migrated correctly into useFinishQuizDialog hook, not dropped.
- Lazy useState initializer `useState(() => orderFromSubmitted(...))` and `if (locked||disabled||submitting) return` drag guard both preserved verbatim in useOrderingInput.
- useMemo(questionIds) hoisted from inside return object literal to a named const — correct hook positioning, identical behavior.
- All new components carry Readonly<Props>; no barrel files; no any types.
- `React.RefObject` in plain `.ts` file without import follows pre-existing pattern in session-types.ts (global React namespace confirmed via tsconfig chain — not a new deviation).
- finish-quiz-dialog.tsx at 149/150 lines — at cap limit per plan, intentional.

## Positive patterns

- **#1047 seed.ts split (670L → 6 modules, pure mechanical refactor): APPROVED 0/0/0.** All 55 changed files (50 spec importers + 6 new modules + 1 renamed test + 1 helper file) showed ONLY import repointing — no test body, assertion, or logic changes. 6 new module line counts matched plan exactly (81/198/170/144/54/25). Function bodies byte-identical to originals (upsertUser, seedConsentRecords, VictimResponseFixture type). Visibility promotions (OTHER_ORG_SLUG, getEgmontOrgId, upsertUser from private→exported in seed-core.ts) were plan-intentional (seed-users.ts cross-module import). No barrel re-export created (code-style §4 honored). seed.test.ts → seed-quiz.test.ts rename: only import path updated, vi.mock path unchanged. POSITIVE: precise plan compliance, confirmed by line-count match to the exact digit.

- **VFR RT Phase 6 (`diagram_label`, #697 — 7 migs 150–156 + full app wire chain): clean, Opus-depth security-path review.** All 7 packages/db↔supabase migration pairs byte-identical (`diff` verified). Answer-key hiding complete at all 4 surfaces: (a) `diagram_config` column added AFTER mig 094's explicit GRANT list → auto-gated by omission; (b) `get_quiz_questions` (152) projects only `{image_ref,zones,labels}` with `answer` OMITTED + labels `ORDER BY random()`; (c) `DiagramConfigPublic` (`_types/session.ts`, `load-session-questions.ts`) has no answer field; (d) runner `correctMapping` used only when `graded` (post-submit practice reveal), report keys from `ended_at`-gated `get_report_answer_keys` (156). `_grade_record_diagram_label` (154) REVOKE names PUBLIC+anon+authenticated (all three), SECURITY DEFINER + search_path, no re-GRANT. Wire-shape mutually consistent across 3 layers: client fanOut emits `{selectedOptionId:labelId, responseText:zoneId, blankIndex:i}` → `batch-submit.ts` maps camel→snake → mig 155 dispatcher passes `response_text`→p_zone_id, `selected_option`→p_label_id; self-defence = DISTINCT zone (response_text) + DISTINCT label (selected_option) + real-zone check, allows partial+distractors (INVERTED vs ordering's permutation check); grader derives blank_index server-side. `is_valid_diagram_config` (150) CASE-guards every `::numeric` cast behind `jsonb_typeof='number'` and every array behind `jsonb_typeof='array'`. 4-way `answer_type_mismatch` parity in 153 (each existing branch `OR p_mapping IS NOT NULL`; diagram requires others NULL). Guard-set parity maintained across all 4 extended RPCs. Partial-credit sum lands in `v_correct_credit numeric` (not int) — addresses the 2026-06-21 fractional-int tracker row. Seed asserts zone/label id-disjointness + exact-once coverage, throws loudly. plan.md count 311→356 = exactly +45 (matches 45 `it(` across 8 new integration files). APPROVED 2026-07-02, 0 CRITICAL/ISSUE, 2 SUGGESTION (mig 154 header comment says NULL canonical "yields false" but SQL `label = NULL` is NULL — unreachable via the write-time bijection CHECK, defense-in-depth `coalesce`/`IS NOT NULL AND` would harden + fix the comment, cf. Phase 2 lesson (d); plan.md running-total bumped inside the Phase-5 historical sentence, Phase 6 narrative entry still pending the Docs step).

- **PR #1050 CR-fixup (Readonly double-wrap unwrap ×27, MAX_ORDER_ITEMS upper bound, ordering constant extraction, test title renames): all clean.** Readonly unwrap: all 5 ambiguous named-type aliases not visible in diff context (OrderingInputItemProps, OrderingInputProps, SessionRecoveryPromptProps, SortableTableHeadProps<T>, weak-topics-list Props) confirmed `Readonly<{…}>` by reading source files — no single-wrap site accidentally unwrapped. MAX_ORDER_ITEMS: semantic-reviewer had called the absence "intentional" but the ordering-validation.ts docstring explicitly names query helpers as bounds consumers — that was a false positive; the defense-in-depth guard is correct. isUniquePermutation: body is `new Set(ids).size === ids.length` — byte-equivalent to the inlined expression it replaced. `as string[]` casts guarded: in both check-non-mc-answer-helpers.ts and load-draft-helpers.ts, `Array.isArray()` + `.every((s) => typeof s === 'string')` precede the cast in the same `&&` chain. Test title renames behavior-first without stripping behavioral signal. APPROVED 2026-07-02, 0 CRITICAL/ISSUE/SUGGESTION.

- **Combined batch PR (36de86f2 — #1027 Readonly sweep + #1044 ordering util + #1005 redteam + #1031 lefthook): all clean.** #1044: all 7 inline replacements preserve exact prior behavior (same Set-equality uniqueness semantics, same bounds); `as string[]` casts in quiz-session-validators guarded by prior `Array.isArray()` + `.every(isNonEmptyString)` checks; load-session-questions correctly preserves no max bound. #1005: non-vacuous (knownQuestionId from real DB), mig 20260629000700 confirmed raises 'Not authenticated', correctly positioned in serial chain. #1031: correct quote fix. agent-workflow.md: coherent new rule. #1027 Readonly sweep: 142 .tsx files, annotation-only changes, no logic/JSX/import deviations in all 6 spot-checked files, no non-component .ts files touched, no unexpected files. 2 SUGGESTIONs (double-wrap on already-Readonly named types; constant-value test titles in ordering-validation.test.ts). APPROVED 2026-07-02.

- **#1035+#1018 integration tests (single-active-session + resend): non-vacuous, hermetic, correctly ordered.** resend (#1035): two separate transactions → `secondEmailedAt > firstEmailedAt` is sound; reads via service-role `admin` client; migration confirms no `emailed_at IS NULL` guard. single-active-session (#1018): Gap A-1 non-vacuity established before block + `toEqual([quizId])` after; Gap A-2 reads discovery `deleted_at NOT NULL` + `ended_at NULL` + active length 1 + mode assertion; Gap B-1 mirrors A-1; Gap B-2 uses `requireRpcResult` (correct — `start_vfr_rt_exam_session RETURNS jsonb`, not TABLE) + session_id equality + question_ids deepEqual. afterAll multi-step accumulator: codes hard-deleted first (FK into users/orgs/quiz_sessions; no ON DELETE CASCADE), `if (errors.length === 0)` gates dependent steps 2-3. Nested describe uses `rtSubjectId` (different from outer `subjectId`) — no unique-index collision on `uq_exam_configs_org_subject_active`. Outer `afterEach` applies to nested describe tests (Vitest scoping). 3 SUGGESTIONs only (section label (i) before (h); Gap A-2 direct boolean vs requireRpcRows; theoretical timestamp microsecond collision). APPROVED 2026-07-02, 0 CRITICAL/ISSUE.
- **#995/#996 rpc-report-answer-keys.spec.ts (marker cleanup + ordering positive control): clean, all plan items verified.** `createdQuestionIds` Set fully removed (variable + both `.add()` calls + `.clear()` + early-return guard). Marker sweep in beforeAll (`admin.update…like(EN_MARKER_LIKE).is('deleted_at',null).select('id')`) and afterAll both correctly destructure `{data,error}`, check error, log only when `length>0` (zero-row observability). Ordering insert correctly spreads `baseQuestion` then overrides `question_number/question_text/question_type/ordering_items/canonical_answer/accepted_synonyms/dialog_template/blanks_config`. New ordering positive-control test declared at line 362, BEFORE EN1 (line 401). Per-slot answer rows (blank_index 0/1/2, response_text=item.id for each slot). Assertions non-vacuous: `toHaveLength(3)` + per-slot `byIndex.get(i)===ORDER_CANONICAL_TEXTS[i]` + blank_index-set check `[0,1,2]`. No leftover references, no unused imports. Test title clean (no leakage patterns). APPROVED 2026-07-02, 0 CRITICAL/ISSUE/SUGGESTION.

- **PR C Discovery UX (#1013 seen-coloring + #1014 header-slot): clean, all navigation paths verified, no normal-quiz regression.** `seenIndices` seeded with `startIndex` via lazy `useState(() => new Set([startIndex]))` — correct (initializer runs once). `navigateTo` guard (`index >= 0 && index < totalQuestions`) blocks out-of-range before marking seen — no stale index in the Set. All 4 navigation paths (grid click→`s.navigateTo`→`p.navigateTo`→`nav.navigateTo`; relative→`s.navigate`→`p.navigate`→`wrappedNavigate`→`nav.navigateTo`; keyboard same; direct index same) all funnel through `nav.navigateTo` — seen-tracking is universal. Normal study/exam: `seenIds=undefined` → `isSeen = !isCurrent && false = false` → `isSeen` branch in `getSquareClass` never fires; `isCorrect` coloring unchanged. Exam mode: `isAnsweredInExam` check precedes `isSeen`, but `isSeen` is already `false` for exam — no interference. Discovery: empty `feedbackMap` to grid (isCorrect=null for all squares) + `seenIds=s.seenIndices`; answer panel uses `s.currentFeedback` (from pipeline feedback seeded by handoff draftFeedback) — correct option still shown. `getSquareClass` precedence (current→answeredInExam→isSeen→isCorrect→else) correct for all modes. `quiz-session.tsx` exactly at 150-line cap after +2 lines. APPROVED 2026-06-29, 0 CRITICAL/ISSUE, 1 SUGGESTION (quiz-session.tsx at 150-line cap).

- **Study Mode CR-fix batch (PR #1006 round 2): coercions, EO spec hardening, finally-pattern, title renames — all correct.** (1) `toStudyQuestion` coercions: all 12 RETURNS TABLE fields match `StudyQuestion` type exactly (required → `''`, nullable → `null`; `id`/`correct_option_id` pre-filtered by row guard). `mapOptions` destructures only `{id,text}` — `correct` field dropped at destructuring site. (2) EO5 full-contract assertions cover all 12 mig 20260626000200 columns between pre-existing value assertions (`explanation_text` line 374, `correct_option_id` line 372, `options` lines 377–381) and new type/shape checks. (3) EO6 self-contained preflight runs before session seeded, proving base case without relying on EO5 ordering. (4) Both integration `finally` blocks and EO6 cleanup use accumulate-and-throw-after pattern; Biome `noUnsafeFinally` clean; single-step cleanups correctly exempt from per-step gating. (5) All test title renames behavior-first; `waitFor(errorSpy)` correctly waits for catch-block settlement rather than just function-call start. APPROVED 2026-06-27, 0 CRITICAL/ISSUE, 1 SUGGESTION (draft-status test lacks EO-prefixed vector sub-label).

- **CR-local round 3 fixes (start-button, use-flagged-questions, mode-toggle title, attack-surface doc): all correct and behavior-preserving.** (1) `disabled={disabled || loading}` in start-button.tsx — all 3 callers (study-config-form L88, quiz-config-form L129 exam, quiz-config-form L139 quiz) already include `loading` in their `disabled` prop, so no behavior change for current callers; defensive for future callers. (2) `cancelled` flag in use-flagged-questions.ts — `let cancelled = false` declared AFTER both early-return guards (lines 15, 17-19), so only the fetch-starting path declares it; cleanup `return () => { cancelled = true }` returned AFTER `startTransition(...)` call; both `setFlaggedIds` guarded with `if (!cancelled)`; hook is 77/80 lines (under cap). (3) New stale-completion test uses explicit deferred-promise ordering to control resolution sequence; deterministic. (4) Mode-toggle title drop of `aria-pressed` impl detail; new title behavior-first. (5) attack-surface.md error string "before studying." → "first." matches `study.ts:53` `'Finish or exit your active exam first.'`. APPROVED 2026-06-27, 0 CRITICAL/ISSUE/SUGGESTION.

- **Study Mode UI relocation (Discovery segment): clean SessionMode decoupling + correct early-return pattern.** `SessionMode = Exclude<QuizMode, 'discovery'>` introduced in `types.ts` and threaded consistently into all 4 persisted-session structures (`QuizStateOpts`, `ActiveSession`, `SessionData`, `BuildOpts`) + 2 component props (`quiz-session.tsx`, `session-recovery-prompt.tsx`). `use-quiz-start.ts` confirmed to NOT pass `mode` to `startQuizSession` — so `config.mode: QuizMode` (now including 'discovery') never flows into session structures; the TypeScript change is a contractual tightening with zero runtime risk. Discovery early-return in `quiz-config-form.tsx` calls all hooks first (correct React hook ordering), then early-returns before Card 1; ModeToggle rendered in both branches. `unseenLabel` applied via `opt.value === 'unseen' ? (unseenLabel ?? opt.label) : opt.label` — scoped to only the `unseen` entry. All 7 affected test files updated. All docs updated (design.md, requirements.md, tasks.md, database.md, decisions.md, plan.md, security.md). APPROVED 2026-06-26, 0 CRITICAL/ISSUE, 2 SUGGESTIONs (ModeToggle assertion missing from discovery test; unseenLabel forwarding not tested at StudyConfigForm level).

- **VFR RT #983 (EM) + #989 (EN) red-team Playwright specs: hermetic, non-vacuous, token-correct.** EM: single test in Hub A describe, `unauthClient.rpc('check_non_mc_answer', ...)` correctly hits the RPC (not the Server Action), `/not_authenticated/i` matches mig 119 L75 (`RAISE EXCEPTION 'not_authenticated'` — snake_case). EN: new `rpc-report-answer-keys.spec.ts` — positive control seeds real `short_answer` + `dialog_fill` questions before all four negative probes; `dialog_template` satisfies mig 125 `questions_dialog_fill_template_wellformed` CHECK (`{{0|cleared to land}}`, `{{1|two seven;27}}`); `blanks_config` keys `index`/`canonical`/`synonyms` match mig 119/133 access patterns; afterEach `createdSessionIds.clear()` inside `finally`; afterAll outer-describe single-step (single-step exempt from accumulator); EN4 inner-afterAll best-effort (`console.error`, not throw); EN4 test restores user in `finally` and defers security assertions outside it (noUnsafeFinally clean). Hermeticity markers `[E2E_REDTEAM_EN]` in `question_number`. APPROVED 2026-06-25, 0 CRITICAL/ISSUE/SUGGESTION.

- **quiz-report-helpers.ts helper extraction (size-warning resolution): verbatim move, fully correct.** AnswerKeyRow type + buildDistinctQuestionOrder + buildAnswerKeyMap moved byte-identical from quiz-report-questions.ts to quiz-report-helpers.ts. AnswerKeyRow still imported and used at line 153 (rpc<AnswerKeyRow[]>). AnswerKeyEntry import correctly dropped from quiz-report-questions.ts (now consumed only by helpers.ts). No other callers of the moved functions exist in the codebase. New quiz-report-helpers.test.ts covers both functions with behavior-focused titles, non-vacuous edge cases (null blank_index/answer_key filtering, empty input). File counts: quiz-report-questions.ts 213→169L (below 200L cap ✓), quiz-report-helpers.ts 45L. APPROVED 2026-06-25, 0 CRITICAL/ISSUE/SUGGESTION.
- **VFR RT Phase 4 CR-triage fixes (a11y sr-only, shrink-0 sweep, page<1 guard, integration test for omitted-blank RPC path, security.md timestamp): all changes in-scope and correct.** (1) sr-only per-blank in dialog-fill-report matches options-list pattern; asymmetry from short_answer justified by row-level aria-label covering single correctness state. (2) flex-shrink-0→shrink-0 sweeps all 4 files, no remaining instances in source. (3) page<1 guard placement correct — `from = (page-1)*PAGE_SIZE` negative for page<1; guard fires before the slice, mirrors both files symmetrically. (4) integration test's single-blank submission yields 3 rows because mig 133's CROSS JOIN LATERAL on blanks_config (3 entries) cross-joins against the single matching quiz_session_answers row — all 3 blank indexes appear, DISTINCT ON dedupes within each (b->>'index')::int group. (5) security.md footer timestamp-only change is accurate (§15 example (c) already present in the doc body). APPROVED 2026-06-25, 0 CRITICAL/ISSUE/SUGGESTION.
- **agent-coderabbit-local.md Pitfall #7 (docs-only): accurate, non-contradictory.** Single new pitfall item. `errors.length === 0` gate language faithful to code-style.md §7 line 801 (verified verbatim). "Inverse of #1–5" framing consistent with #6's "CR can be wrong" paradigm. correct_count ×2 instances corroborated by implementation-critic MEMORY.md (2026-06-21 int-rounding tracker row). No content overlap with existing items. APPROVED 2026-06-24, 0 CRITICAL/ISSUE/SUGGESTION.

- **VFR RT Phase 4 Commit 2 (new get_report_answer_keys non-MC report-key RPC, mig 133): clean rule-11c sibling-guard clone + 42702-safe qualification + non-vacuous owner-proof.** mig 133 ≡ supabase `20260624000200` byte-identical (`diff`). Genuinely NEW fn. Guard set mirrors LATEST sibling get_report_correct_options (mig 114) EXACTLY: auth null → active-caller(users.deleted_at IS NULL, student form not admin-org form) → owner(student_id=auth.uid())+ended_at IS NOT NULL+session deleted_at IS NULL → SET search_path=public + SECURITY DEFINER + GRANT EXECUTE TO authenticated + §15 carve-out comment. 42702 deferred-validation class STRUCTURALLY avoided: every body ref table-qualified (q.*, sa.*) or literal/expr (NULL::int, (b->>'index')::int, b->>'canonical') — no bare ref matches any of the 4 OUT params (question_id/question_type/blank_index/answer_key); `sa.question_id` is the table column, unambiguous because qualified. blanks_config keys `b->>'index'`/`b->>'canonical'` verified against mig 119 check_non_mc_answer body (NOT `blank_index`). short_answer→1 row+NULL blank_index; dialog_fill→1 row/blank via CROSS JOIN LATERAL jsonb_array_elements; MC→type-filtered out (returns nothing). REVOKE-gated cols (canonical_answer/blanks_config, mig 094) read only under SECURITY DEFINER on completed+owned sessions. Test: SA+DF assert canonical VALUES not counts; all 4 guard rejections; non-owner NON-VACUOUS (owner key proven = SA_CANONICAL before attacker reject); all results via requireRpcRows/requireRpcResult (§5 cast-guard in tests); 8 it() = plan.md +8 (212→220). Scope clean (migration-only, no /app/quiz report-layer files). APPROVED 2026-06-24, 0 CRITICAL/ISSUE/SUGGESTION.
- **#839 submit-RPC expired-replay flag (migs 129/130): clean verbatim-predecessor + exactly-3-additions + jsonb-concat idempotency.** Both new migs are full CREATE OR REPLACE = predecessor body VERBATIM (129 vs 124, 130 vs 121 — `diff` of bodies shows ONLY the 3 intended additions: declare `v_replay_expired boolean := false`, EXISTS lookup, `|| CASE WHEN v_replay_expired ...` concat). Predecessor chain traced: 124 is latest submit_vfr_rt before 129, 121 is latest batch_submit before 130. Mirrors byte-identical (129≡20260623000800, 130≡20260623000900). Placement correct: 129 lookup keys `vfr_rt_exam.expired` inside `IF v_already_ended THEN`, concat on the FINAL shared return (v_replay_expired stays false on fresh-normal path; fresh-expiry early-returns hardcoded expired:true untouched). 130 lookup `event_type IN ('exam.expired','internal_exam.expired')` inside `IF v_ended_at IS NOT NULL THEN` replay branch ONLY (IN list complete — timer guard only fires when time_limit NOT NULL = exam modes). audit_events read needs no deleted_at (append-only) + no ownership scope (FOR UPDATE upstream). Tests: fresh-expired assertion makes replay non-vacuous; service-role backdated-session (started_at −1860s vs 1800+30s grace) reuses the proven timer-expiry fixture pattern; titles behavior-first. plan.md 200→202 committer-duty bump preserved prior chain. APPROVED 2026-06-24, 0 CRITICAL/ISSUE/SUGGESTION.
- **VFR RT Phase 2 Task 2.2 (new check_non_mc_answer non-MC practice grader RPC): clean rule-11c sibling-guard clone + §15 membership-before-read ordering.** mig 119 + supabase mirror `20260621000200` byte-identical (`diff`). Genuinely NEW fn (CREATE OR REPLACE chain: only the staged files define it). Guard set mirrors LATEST check_quiz_answer (mig 117) EXACTLY: auth null → active-caller(users.deleted_at IS NULL) → owner+ended_at IS NULL+deleted_at(rule 11 multi-permissive scope) → practice whitelist IN('smart_review','quick_quiz') → config-shape explicit IS NULL → membership(=ANY frozen config.question_ids) → SET search_path=public + SECURITY DEFINER + GRANT EXECUTE only (no answer-key column-level grant). §15 CRITICAL invariant HOLDS: membership(L126) precedes the ONLY answer-key read(L138-153). Grading byte-faithful to submit_vfr_rt(mig 20260619000300 L160-207). ONLY finding: docs/security.md §15 RPC-list entry not yet present — correctly DEFERRED to doc-sync pass. SCOPE-SPLIT RULE: when a commit is intentionally migration-only, the central-doc cross-reference (security.md §15 list, RPC summary table) belongs to the doc-sync pass — do not flag as missing-from-this-commit ISSUE. APPROVED 2026-06-21, 0 CRITICAL/ISSUE.
- **VFR RT Phase 2 Task 2.1 (extend get_quiz_questions for non-MC q-types): clean DROP+recreate + strip-precedent reuse + cast-guard.** mig 118 + supabase mirror `20260621000100` byte-identical (`diff`). DROP+CREATE for the RETURNS TABLE widen; 12 existing cols verbatim in mig-059 order + 3 new (question_type/dialog_template/blanks_safe). Phase-defeating LATERAL+GROUP BY correctly REPLACED by mig-105's correlated-subquery CASE. Strip logic byte-matches mig 105. NO answer-key cols selected. All guards preserved. Caller `load-session-questions.ts` uses `Array.isArray(q.blanks_safe) ? cast : null` (§5 cast-guard). APPROVED 2026-06-21, 0 findings.
- **#925 Phase 4 C3 (coderabbit-sync + fixes commit): clean hash replacement + YAML placement + accuracy fixes.** All 5 dangling pre-squash hashes removed from code-style.md; both replacement squash refs (`fb2921c6`/`f4c76c83`) reachable on master. `.coderabbit.yaml` validates; new query-site instruction under `actions.ts` block, cast-guard instruction under `**/*.test.{ts,tsx}` block. Decision 46 edits accurate. APPROVED 2026-06-21.
- **#925 Phase 4 C2 (docs-only commit): clean placement, preservation, no count-literal drift.** decisions.md Decision 46 correctly numbered/placed; footer prepends preserving prior chain. plan.md new section first `##`; integration-test count literals untouched. APPROVED 2026-06-21.
- **#925 Phase 2 (quiz-action integration tests): clean paired-positive vacuity discipline + raw-coalescing guard.** 5 `.integration.test.ts`. Every cross-user/not-found negative paired with a positive proving the victim/own session resolves. batch-submit raw `toBeNull()`/`toBe(false)` (no in-test coalescing) guards source batch-submit.ts:73-74. §7 lifecycle test drives start→submit×3→complete through the action layer (66.67%, not echoed). APPROVED 2026-06-20, 2 SUGGESTIONs.
- **#925 Phase 1 commit 1 (simple-read integration tests): clean count-isolation + RLS-vacuity reasoning.** `get_question_counts` SECURITY INVOKER scoped by `questions` tenant_isolation RLS → two orgs seeding 3 Qs each under shared easa_* refs → broken scope WOULD read 6, asserting 3 is non-vacuous. Omitting exam_configs `enabled:false` negative CORRECT (student_select_exam_configs USING already filters). APPROVED 2026-06-20.
- **#925 Phase 0 app-layer DB integration tier: clean harness/plumbing.** `*.integration.test.ts` gated: unit vitest exclude + tsconfig exclude + dedicated tsconfig.integration.json. `@repo/db/test-helpers` re-export import-safe. `next/headers` cookie-jar mock hoist-safe; one globalThis jar so signInAs session persists. afterAll single internally-isolating cleanupTestData → §7 per-step-accumulator EXEMPT. APPROVED 2026-06-20, 2 SUGGESTIONs.
- **#902 record-emailed E2E spec: clean hermiticity + non-vacuity pattern.** Per-step error-accumulator (2 independent try/catch/finally, sets cleared in finally), soft-delete of both internal_exam_codes + quiz_sessions with `.select('id')` + conditional log, EB existence proof before cross-org attack, consumed/voided seeding satisfies both pair-consistency CHECKs. APPROVED 2026-06-19.
- **#915 EC E2E redesign: clean discrimination-control pattern for transport-dependent actions.** Dropping audit-count assertions was correct — the audit row requires a successful email send (RESEND_API_KEY absent in CI under NODE_ENV=production, resend.ts:29 fails closed → ok:false → 'Failed to send email' toast). NEXT_PUBLIC_APP_URL IS set in CI (e2e.yml:134/142), so the early-return guard at send-code-email.ts:42 does NOT fire — the discrimination control deterministically reaches 'Failed to send email' in CI. Regex /Code emailed to student|Failed to send email/ covers both local-configured and CI-no-key outcomes. Non-vacuity genuine. Voided seeding satisfies voided_pair_consistency. afterEach `.select('id')` + zero-row log per §5. APPROVED 2026-06-22, 0 CRITICAL/ISSUE.
- **#945 EJ soft-deleted-admin answer-key spec: clean vacuity + hermiticity.** Two rejection regexes (`/forbidden|user not found/i`, `/forbidden|caller has no organization/i`) provably disjoint from the positive-control regex and each other. Dedicated throwaway admin distinct from EI's. Soft-delete asserts exactly 1 row; restore in finally, assert outside. afterAll cascade-delete (single step, §7 exempt). No audit-count check correctly dropped (read-only RPCs). APPROVED 2026-06-21.
- **#864 has-image filter: clean mirror of calc-mode pattern.** DROP+CREATE targeted the 6-arg calc-mode overloads; all 3 bodies carried SECURITY INVOKER / SET search_path / STABLE/VOLATILE / status+deleted_at / auth.uid() verbatim; byte-identical two-dir mirror; imageMode threaded through both Zod schemas, both RPC wrappers, all 5 hooks, QuestionFilters. APPROVED 2026-06-14.
- **#862 keyboard shortcuts: stale-closure ref pattern applied correctly.** `optsRef.current`/`highlightRef.current` set every render (outside the once-attached effect); `onKeyDown` reads via `.current`. Hooks before early return; `optionIds ?? []` safe; `enabled === false` strict-equality guard. APPROVED 2026-06-14.

## Notes on PR-A3 sweep pattern

- **Type-widening for DB-typed RPC columns (`n: number` in `get_question_counts`).** `exam-config/queries.ts` + `syllabus/queries.ts` apply `Number(row.n)` where DB types.ts declares `n: number`. `Number(n)` on a `number` is a harmless identity, correct at runtime if PostgREST sends a string. Do NOT flag the missing local type widening — the DB types are the contract.
- **`(x != null ? Number(x) : null) ?? 0` is the correct pattern for nullable NUMERIC with a non-null fallback.** `quiz-report.ts` + `admin-quiz-report.ts` use this two-step form. Inner ternary handles null→null; outer `?? 0` is the pre-existing non-null default. Verified PR-A3.

## Notes on PR-A2 sweep pattern

- **GROUP 1 real-error tests omit console.error assertion.** upsert-subject/topic/subtopic real-error tests assert `result.success === false` + message but don't spy on `console.error`. Not flagged as ISSUE (plan only required the two behavioral outcomes); flagged as SUGGESTION.

## Notes on middleware anti-cache headers + cookie-orphan fix (#446)

- **Accepted trade-off on request-cookie propagation.** The old `response = NextResponse.next({ request })` in setAll propagated freshly-set request cookies into downstream Server Components. The mutate-in-place fix loses that path. Plan explicitly accepted this ("that benefit was already lost (orphaned response)"). Do NOT re-flag request-cookie propagation loss — documented trade-off.
- **Duplicate not-throw test is a SUGGESTION-class finding, not ISSUE.** The added "does not throw when setAll is called without a headers argument" is semantically identical to the pre-existing "writes set-cookie headers...". Duplicate test cases are not flagged by Biome (contrast: named helpers → noUnusedVariables). Log as SUGGESTION only.

## Notes on #533 loading-state commit 2 (answer-submit controls)

- **Clean commit — all plan items verified.** Both AnswerOptions callers (quiz-main-panel + session-answer-block) thread `submitting`. `aria-busy={submitting || undefined}` emits no attribute when idle. `finish-quiz-dialog` `aria-busy` on Save for Later only (Submit uses text swap). `SessionRunner` unused (no callers) — no missed path. Internal-exam answer path goes through the same `session-answer-block.tsx` chain. False-positive guard: `finish-quiz-dialog.tsx` is 307 lines pre-existing; diff adds 7 lines — any file-size flag is on pre-existing bloat.

## Notes on #533 Part C + regression fix (UNIT 1 + UNIT 2)

- **consent-form canSubmit still includes `!isPending` — LoadingButton double-disables, behavior preserved.** `canSubmit = acceptedTos && acceptedPrivacy && !isPending` unchanged. With `loading={isPending}` AND `disabled={!canSubmit}`, LoadingButton computes `disabled={isPending || !canSubmit}` — functionally identical. Not a deviation.
- **issue-code-form `canSubmit` refactor (remove `&& !isPending`) is behavior-preserving.** `canSubmit` guards `handleSubmit` (`if (!canSubmit) return`) AND the submit button. Since `loading={isPending}` already disables during pending, removing `&& !isPending` removes a redundant gate. The `if (!canSubmit) return` still covers double-submit.
- **Files that retain `Button` alongside `LoadingButton` — correct.** All files still rendering a Cancel/Close button keep `Button`. Files that converted their ONLY button removed the import.
- **quiz-main-panel `disabled={s.submitting}` revert is correct.** The previous `|| s.answering` blocked option clicks on the NEW question while the prior checkAnswer was in flight ("tracks answered count" test failed 1 vs 2). `lockedRef` prevents same-question double-submit; option-area disable is correctly scoped to session-level `s.submitting`.

## Notes on #533 CR fix commit (CR-1/CR-2/CR-3)

- **inFlightAnswers counter — nested try/finally pattern verified clean.** Outer try increments before the nested try; outer finally always decrements via `Math.max(0, n-1)`. Inner catch returns `false` then falls to outer finally. No double-decrement; counter cannot go negative.
- **ConfirmPanel `busy` prop: `disabled={submitting}` retained, `aria-busy={busy||undefined}` scoped to own action.** Both call sites pass `busy={pendingAction === '<action>'}`. New test exercises `pendingAction==='save'` while submit-anyway panel open — attribute absent when wrong action pending.
- **`h-7` is the genuine size="sm" class in button.tsx cva.** cva line 28: `sm: "h-7 ..."`. CR-3 assertion non-vacuous.

## Notes on #789 recordAuthEvent wiring (commit 2)

- **Client-level mock intercepts helper correctly.** Tests for all 4 action files mock `supabase.rpc` at the client object level. `recordAuthEvent` receives the same client and calls `supabase.rpc(...)` — `mockRpc` intercepts. No `vi.mock('@/lib/audit/record-auth-event')` needed.
- **Plan description of MEMORY.md change was inaccurate (benign).** Plan said "typo correction"; actual was a new positive-signal bullet. Stale plan description, not a behavioral deviation.
- **`toggle-student-status-mutations.ts` in `actions/` does not require own test.** §7 requires tests for new files in `_hooks/`/`_utils/`/`lib/`; `actions/` is not in that list. Existing `toggle-student-status.test.ts` covers both helpers end-to-end.

## Notes on VFR RT Phase A migrations commit (#697)

- **Large multi-migration commit (14 migrations): verbatim-copy diff approach.** For N verbatim-copy migrations with documented changes, run `diff <src> <dest>` to confirm ONLY documented changes appear — don't read both bodies line by line. Verified clean on #697.
- **GDPR type widening for new nullable columns is a secondary change class.** New nullable columns (`response_text`, `blank_index`) → check 3 sites: SELECT string in the GDPR query, GdprExportPayload type (widen to `string | null`), test fixture (add fields as `null`). All 3 aligned in #697.
- **tasks.md A.10 completed but checkbox not ticked.** Artifacts staged but checkbox not ticked. SUGGESTION class (workflows item).

## Notes on #838 CR round-3 applies (legacy-mode whitelist + active-user gate)

- **Mig 104 'not authenticated' (space) vs sibling 'not_authenticated' (underscore)** is a pre-existing divergence inherited from the copy source. Do not flag when the copy source is the source of truth. SUGGESTION only.
- **`forceEndSession` inline (not try/finally) in whitelist tests** is safe: (a) `start_vfr_rt_exam_session` resumes idempotently; (b) `cleanupTestData` in afterAll hard-deletes all sessions by org_id. Hermetic without per-test try/finally.
- **#838 review clean (0 CRITICAL, 0 ISSUE, 1 SUGGESTION)** — twin-file identity, guard placement, copy-source fidelity, test non-vacuity/hermiticity verified.
- **Post-#838 fix-cycle commit APPROVED (0/0/1).** Mig 104 deleted_at guard test non-vacuous (rollback `ended_at IS NULL`), hermetic. Doc edits accurate (094–104 range, 15 files). plan.md 132→133. SUGGESTION: finally-block UPDATEs lack `.select('id')` — acceptable for cleanup per §5.
- **PR #830 cloud-CR commit APPROVED (0/0/0).** Guard ordering verified in both RPCs. Twin-file identity. `submit_quiz_answer` block in database.md intentionally pre-#838 (prose bullets describe current model). vfr_rt rejection tests non-vacuous with narrowed whitelist. Exam-session cleanup uses `ended_at + deleted_at` soft-delete. plan.md both count lines updated. Code-block staleness pre-existing, not introduced.

## Notes on agent-health.yml false-positive fix (#810)

- **`var=$(cmd)` is exempt from `set -e`.** `set -euo pipefail` does NOT abort on a failing command substitution in a variable assignment. The old `|| true` after `xargs` was NOT load-bearing; removing it (replacing xargs with `trim()`) is safe.
- **`trim()` placement in Check 3** — defined line 88 (before the while-loop), outside the loop. Correct hoisting.
- **Check 4 security-auditor comment placement** — explanatory comment inside the while-loop body describes the `find` in the process substitution. Cosmetically misplaced — SUGGESTION only.

## Notes on #796 spec-split (rpc-cross-tenant + audit-completeness)

- **`cleanupFixtures` flagged_questions filter is student_id-unscoped by design.** Uses `.in('question_id', ...)` without student_id filter — intentionally broader. In the test DB only redteam seed users exist. Flagged ISSUE in review; may be accepted trade-off.
- **`seedVictimResponses()` correctly belongs to the isolation spec, not the reports spec.** BY/BE/Q/X/CL3 tests in rpc-cross-tenant-reports.spec.ts seed their own fixtures. Do not flag the omission as missing non-vacuity seeding.
- **force-token-refresh.ts helper is a Playwright E2E seam** — §7 Vitest test requirement does NOT apply to `e2e/redteam/helpers/*.ts`.

## Notes on vfr-rt-spec-fixes (docs/697 branch, 2026-06-10)

- **Spec cites stale "latest" migration identifier for batch_submit_quiz.** design.md + tasks.md named `20260430000012`; actual latest is `20260601000001_align_batch_submit_audit_metadata_keys.sql`. Flagged ISSUE. When a spec documents a "latest: <timestamp>" pointer, verify it's the most recent `CREATE OR REPLACE` before committing.
- **Spec-specified guard message casing doesn't match cited precedent.** design.md mig 103 wrote `'session not found...'` (lowercase) citing `get_report_correct_options`; actual precedent uses capital 'S'. Test regex `/i` so no failure. When a spec says "same wording as X", grep X's RAISE string.
- **discard.ts line count off by 1.** tasks.md said 104, actual 105. SUGGESTION.

## Notes on redteam-e2e-coverage-batch (#784, #786, #788, #781)

- **Spec-count drift in steering + decisions on new-spec batch** — adding 2 specs moves count 37→39. `tech.md` (3 places) + `docs/decisions.md` Decision 27. SUGGESTION (doc-updater handles post-commit).
- **actor-liveness pre-check pattern confirmed.** rpc-record-auth-event.spec.ts beforeAll asserts all 3 RPC callers have `deleted_at IS NULL` before any test — prevents gate-2 pre-empting gate-3 assertions. Correct pattern.
- **force-token-refresh.ts helper is a Playwright E2E seam, not a `_hooks/` util** — §7 does NOT apply to `e2e/redteam/helpers/*.ts`.
- **CL2 non-vacuity acknowledged in plan as control, not the proof.** CL2 asserts error null + empty array for cross-org user with no sessions; CL3 is the non-vacuous ownership proof. Do not re-flag CL2.
- **CT user.deactivated: soft-delete target without `.is('deleted_at', null)` guard is acceptable.** Service-role client doesn't enforce the soft-delete guard; afterEach restore uses `.not('deleted_at', 'is', null)`.
- **RAISE-string casing verified for all 4 RPCs.** `record_auth_event` → `'not authenticated'`; `get_session_reports` → `'Not authenticated'`; `void_internal_exam_code` → `'not_authenticated'`. All anon assertions use case-insensitive regex.

## Notes on #831 get_vfr_rt_exam_questions org-filter fix

- **NULL-org guard doubles as NULL-user guard — confirmed again.** `SELECT u.organization_id INTO v_caller_org_id ... WHERE u.id = v_caller AND u.deleted_at IS NULL; IF v_caller_org_id IS NULL THEN RAISE` preserves the old EXISTS gate exactly. Mirrors mig 099 lines 67–71.
- **questions.organization_id is NOT NULL (initial schema line 107).** `AND q.organization_id = v_caller_org_id` non-nullable both sides — no null-equality trap.
- **adminUserId2 not pushed to the describe-scope `userIds` — correct by design.** Passed as `userIds: [adminUserId2]` in its own cleanupTestData call.

## Notes on #869 batch_submit_quiz idempotent-replay output-contract test

- **`score_percentage` serialization via jsonb RETURNS is a number, not a string.** `batch_submit_quiz` RETURNS jsonb; `v_score numeric(5,2)` in `jsonb_build_object` serializes as a JSON number. `toBe(100)`/`toBe(0)` correct. Do NOT flag as BIGINT/NUMERIC string-serialization (that applies to column-level SELECT reads, not RETURNS jsonb values). APPROVED 2026-06-19.
- **`quick_quiz` leaves `passed` NULL** — mig 095c pass-mark gating (L247–257) only runs for mock_exam OR internal_exam. `v_passed` defaults NULL. Both `toBeNull()` correct.

## Notes on PR #830 CR-local fixes (5 fixes, vfr_rt_exam race + test hardening)

- **uq_vfr_rt_exam_session_active is the ONLY unique index that can fire on a `mode='vfr_rt_exam'` INSERT.** The three partial unique indexes predicate on mutually exclusive mode values; PK is `gen_random_uuid()`. Exception handler unambiguous; RETURN inside EXCEPTION exits before the audit INSERT.
- **Fixture A correct_count = 34 verified from seed.** 8 SA + 9 dialog_fill ×2 blanks (18 rows) + 8 MC = 34 answer rows, all canonical → all true. Fixture B = 16 correct.
- **`v_resume record` type is safe for EXCEPTION re-read SELECT.** Declared `record`; EXCEPTION SELECTs the same 4 columns used in RETURN. Type-safe.
- **23505 test is hermetic post-cleanup.** Cleanup soft-deletes by student_id+org+subject+mode+IS NULL ended_at+IS NULL deleted_at. Happy-path after triggers its own fresh INSERT.

## Notes on #326 attack-surface matrix registration (orphaned specs bookkeeping)

- **Bookkeeping-only diff is comment/title changes only — no assertion/logic changes.** 3 spec files had ONLY `+` lines touching doc comments + describe/test titles. Zero assertion/logic changes confirmed.
- **Old V/BE–BI labels correctly left in their original matrix rows.** Those rows reference sibling specs by filename — no edit needed. Grep of V/BE/BF/BG/BH/BI in the renamed files returns zero hits post-rename.
- **Migration cite accuracy for bookkeeping PRs.** Matrix Notes cite line ranges (e.g. "L261-263") not exact lines; actual RAISE lines fall inside. Acceptable precision — do not flag range claims unless the RAISE string itself is wrong.

## Notes on #833/#840 semantic-SUGGESTION fixes (mig 105 VOLATILE + cleanup.ts exam_configs + docs)

- **VOLATILE drop confirmed clean.** `STABLE` removed from both mirrors (byte-identical via `cmp`); no TS caller, no integration test asserts volatility; not-yet-deployed migration.
- **`exam_configs` FK order correct.** References `organizations(id)` — deleted BEFORE organizations (position 54 vs 56). `exam_config_distributions` is ON DELETE CASCADE → no explicit delete.
- **`deleteOrLog` without `.select('id')` is the established cleanup.ts pattern.** All sibling calls omit the chain. `.select('id')` + zero-row-log only in `cleanupReferenceData` (different contract). Do not flag as §5 violation.
- **Mig 094 GRANT confirmed.** `explanation_text` + `explanation_image_url` on lines 143–144 of the GRANT block.
- **Line 2401 (pre-existing, outside diff) not inconsistent** — "revealed only via `get_vfr_rt_exam_results`" consistent with "only here among the VFR RT RPCs".

## Notes on #832 verdict parser fix (run-security-auditor.sh)

- **`set -euo pipefail` + non-zero function return in `if` condition is safe.** Bash exempts the condition of `if`/`while`/`until`. Both call sites in `if` positions. Do not flag as a `set -e` hazard.
- **`${1:-}` guard is the correct `set -u` idiom for optional first argument.**
- **Bash test scripts should use `set -u` only, NOT `set -e`.** The `|| actual=$?` exit-code capture works only when `set -e` is not active.
- **Test false-pass risk via wrong path: exit 127 (file-not-found) ≠ expected 1 or 0 → FAIL.** All expected values are 0 or 1, so a bad hook path reports FAIL — cannot silently pass.

## Notes on #839 round-3 expiry-detection predicate broadening (migs 129/130 LIKE '%.expired')

- **`event_type LIKE '%.expired'` is strictly safer than the prior enumeration — APPROVED clean.** Enumerated every dotted `event_type` literal in the migration tree: the ONLY three ending in `.expired` are `exam.expired` / `internal_exam.expired` / `vfr_rt_exam.expired`, all expiry-only. Completions emit `*.completed` (excluded). No non-expiry token ends in `.expired`.
- **Scope safety = single owned session.** Lookup is `resource_type='quiz_session' AND resource_id = p_session_id AND event_type LIKE '%.expired'`. resource_id is one session already owned via the upstream `FOR UPDATE` owner SELECT. A session has one mode; every expiry writer (timer guards + mig 102 `complete_overdue_/empty_exam_session`, `v_event_type` CASE L138-142) keys event_type off that session's own `v_mode`. So the suffix match is semantically equivalent to the enumeration for any real session, and future-proof against a new timed mode. No cross-session/cross-tenant surface.
- **SQL LIKE wildcard note:** `.` is a literal in LIKE (only `%`/`_` are wildcards); pattern has no `_`, so no accidental single-char match.
- **Mirrors byte-identical** (`129≡20260623000800`, `130≡20260623000900` via `diff`). Diff touches only the comment block + one predicate line per file — no other body drift.
- **`Number(answered_count)`/`Number(correct_count)` test coercion** mirrors the existing `Number(score_percentage)` + code-style §5 BIGINT/NUMERIC defensive posture. Not a deviation. NO new tracker row — clean approval, no recurring deviation.

## Notes on #828 blank_index⇔dialog_fill BEFORE INSERT trigger (mig 131) — APPROVED clean

- **SECURITY INVOKER via keyword-omission matches sibling convention.** New `enforce_answer_blank_index_shape()` omits the SECURITY keyword (INVOKER default), exactly like mig 092 `stamp_last_active_on_session_complete`. `SET search_path = public` present. Plan-critic's one blocking ISSUE (INVOKER not DEFINER) correctly implemented. Do NOT flag the missing explicit keyword.
- **Non-vacuity proven against mig 095 CHECK.** Both REJECT fixtures (short_answer+`blank_index>=0`; dialog_fill+`blank_index NULL`) PASS the existing text-branch CHECK `(selected_option_id NULL AND response_text NOT NULL AND (blank_index NULL OR >=0))` and fail ONLY the trigger. Trigger has NO `service_role` exemption (unlike mig 079 protect_immutable), so the service-role test inserts ARE validated — that's why the negative tests are non-vacuous.
- **No inserter wrongly rejected (prod-outage check).** Traced LATEST writer defs: submit_quiz_answer (123), batch_submit helpers/dispatch (120/121), submit_vfr_rt (129). mig 129 inits `v_blank_index:=NULL`, MC/short branches require `v_blank_text IS NULL`, dialog_fill sets non-NULL, ELSE RAISEs unsupported_question_type before insert → biconditional-exact.
- **No E2E/seed regression.** No direct insert into either answer table (redteam specs, seed-*-eval.ts, helpers/seed.ts) sets `blank_index`; no `dialog_fill` question used in any of them → trigger's ELSE branch (blank_index NULL) passes for all existing direct inserts.
- **Mirror byte-identical** (blob `98172e59`). Sequencing 131 after 130 / `20260623001000` after `…000900`. plan.md 202→211 (+9) consistent with test count.
- **`unsupported_question_type` types (ordering/diagram_label) out of scope** — current inserters RAISE before insert, so the trigger is never exercised on them. Future graded types with blank semantics would need a trigger update; NOT a current-diff finding. NO new tracker row — clean approval, no recurring deviation.

## Notes on #986 VFR RT Phase 3 — 6 CodeRabbit findings (C1/C3/C4/C5/C8) — APPROVED clean

- **C1 error-branch split is sanitized.** `verifySessionMembership` splits `error || !session`: PGRST116→'Session not found'; other error→`console.error(..., error.message)` + return generic 'Could not check answer' (raw msg LOGGED not returned — §5 ok); residual `!session`→'Session not found'. Test PGRST116 case carries `code:'PGRST116'`; new real-error test uses genuine non-PGRST116 `'08006'` (good — not a placeholder), asserts generic msg + exact console.error args.
- **C3 `.max(50)`+dup-index superRefine stay INSIDE the dialog_fill discriminatedUnion variant** (on the `blanks` array, before sibling explanation keys). Outer feedback-key superRefine is on the `.record()` wrapper — structurally untouched. Mirrors `answers.blankAnswers`.
- **C8 `length>0` short-circuits before `.every`** in `isValidDialogFillFeedback`; populated path unaffected.
- **C5 key `b-${i}-${seg.index}`** — `i` is unique segment position → unique across repeated marker indices. input/aria/testid correctly still key off `seg.index`.
- **C4 `isSessionConfig`** rejects present-but-non-string subjectName/subjectCode; still accepts valid + absent(undefined).
- **SUGGESTION (not a blocker, pre-existing):** empty-blanks asymmetry — C8 added `length>0` to the rehydrate validator but the load-draft `toFeedbackEntry` dialog case (load-draft-helpers.ts:63) and draft-schema feedback `blanks` (.max(50), no .min(1)) still accept `[]`. Predates this diff; CR flagged only C8. load-draft comment claiming "symmetric with" the rehydrate path is now slightly stale. Optional same-commit fix: add `.length>0` at :63 + `.min(1)` at draft-schema:87. NO new tracker row — clean approval, no recurring deviation.
- **RESOLVED (follow-up commit, 2026-06-24):** the empty-blanks asymmetry SUGGESTION above was fully closed. draft-schema `.min(1)` landed in the prior commit; this fix added `r.blanks.length > 0 &&` at load-draft-helpers.ts:65 (4th/final validator), refreshed the comment to name all three siblings, and added behavior-first tests (load-draft-helpers.test.ts:84 empty-blanks → feedback undefined; draft.test.ts:9/28/51 for .min(1)/.max(50)/dup-index). Four-way dialog_fill `length>0` parity now holds: draft-schema(save) / quiz-session-validators isValidDialogFillFeedback(rehydrate) / check-non-mc-answer-helpers isDialogFillRpcResult(RPC) / load-draft-helpers toFeedbackEntry(DB load). APPROVED clean.

## PR-level note: CR-local round-2 fixup batch (pipeline-audit #1110, 2026-07-11)

APPROVED with 1 SUGGESTION (non-blocking). 14 staged files — guard-bash.js, run-security-auditor.sh+test, endrun.md, crlocal.md, run-log.md, tracker-archive.md, doc-updater.md, agent-critic.md, agent-workflow.md, tech.md, .coderabbit.yaml, 3 agent-memory files.

**All three executable changes verified clean:**
- `guard-bash.js` catch block: `process.stderr.write(msg, cb)` + `return` correctly prevents fall-through to blocked-patterns check when parse fails. ✓
- `run-security-auditor.sh`: `fail_closed_no_llm_output()` defined at line 24 (before both call sites at lines 134 and 160); message byte-identical to the two blocks it replaced; `exit 1` inside the function exits the script (not just the function, as required). ✓
- `run-security-auditor.test.sh`: new timeout case (case 13) — shim exits 124, `timeout 120` propagates child's exit code (both actual-timeout and child-exit-124 yield exit code 124 from `timeout`), hook enters `EXIT_CODE -eq 124` branch, fallback grep finds nothing on clean diff, `fail_closed_no_llm_output` fires → exit 1 + "push blocked". Test suite: 14/14 pass. ✓

**SUGGESTION (non-blocking):** `guard-bash.js` 1MB branch — `process.stderr.write(msg, () => process.exit(0))` defers the exit asynchronously, allowing the `end` event handler to fire and process the oversized payload before `process.exit(0)` fires. The original `console.error` + synchronous `process.exit(0)` prevented the `end` handler from running. In theory: a 1MB+ payload that is valid JSON containing a blocked command could cause `process.exit(2)` to fire from the `end` handler before the pending stderr-write callback fires `process.exit(0)` — violating the "fail open" policy for the 1MB branch. In practice: impossible (Claude Code payloads are a few KB; a 1MB+ valid JSON blocked-command payload cannot originate from Claude Code's normal hook delivery). The guard-bash test suite (9/9 passing, with the new 1MB test) confirms the intended "exit 0" behavior. A proper fix would require a `bailedOut` flag checked at the start of the `end` handler — more invasive than the stated CR finding (which targeted stderr flushing). Not flagged as ISSUE given zero practical risk and green test suite.
