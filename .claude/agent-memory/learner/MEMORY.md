# Learner Agent — Memory

> Cross-agent pattern synthesis + false-positive tracking. Update IN PLACE — no dated logs; history in git. Terminal-state rows → tracker-archive.md.

## Issue Frequency Tracker (active rows; terminal-state → tracker-archive.md)

Schema: Issue Type | Count | Last Seen | Status. Count=1 rows: archive row# in status, full narrative in archive.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Test fixture shape mismatch (wrong/missing field in fixture object) | 2 | 2026-03-13 | RULE CANDIDATE. |
| Bare `catch {}` without error-type narrowing | 2 | 2026-04-08 | RULE CANDIDATE → code-style.md §6. |
| Partial fix applied to sibling file group (cross-cutting concern) | 17 | 2026-08-09 | RULE CANDIDATE (active). |
| useTransition + manual loading state hybrid fragility | 2 | 2026-03-13 | RULE CANDIDATE. |
| Silent numeric fallback without observability logging | 2 | 2026-03-13 | RULE CANDIDATE. |
| Query missing student_id scope (returns wrong student's data) | 2 | 2026-03-15 | RULE CANDIDATE → security.md (on 3rd). |
| UI event handler missing re-entry guard (double-fire) | 2 | 2026-03-16 | RULE CANDIDATE. |
| UPDATE returning zero rows treated as success (silent no-op) | 2 | 2026-03-20 | RULE CANDIDATE → code-style.md §5. |
| Error path in existing function untested (count-error branch) | 7 | 2026-06-27 | RULE CANDIDATE (7). |
| Derived value correct by coincidence (index used as count proxy) | 2 | 2026-03-13 | RULE CANDIDATE. |
| Auth callback guard ordering error (guards in wrong order → bypass) | 2 | 2026-03-17 | RULE CANDIDATE. |
| Supabase SELECT error swallowed in auth helper (distinct from mutation) | 3 | 2026-06-04 | RULE CANDIDATE → code-style.md §5 ext. |
| Zod error message pinned to exact internal text | 2 | 2026-03-16 | RULE CANDIDATE. |
| Missing `setSubmitting(true)` before async call in form/button handler | 2 | 2026-04-27 | RULE CANDIDATE → code-style.md (on 3rd). |
| Idempotent RPC returns hardcoded values instead of reading DB state | 2 | 2026-04-27 | RULE CANDIDATE. |
| Code-reviewer flags file outside the commit diff scope | 2 | 2026-04-08 | RULE CANDIDATE → agent-code-reviewer.md FP. |
| Function exceeding 30-line limit in Server Action file | 3 | 2026-04-10 | RULE CANDIDATE (3) → code-style.md §3. |
| ZodError escaping Server Action via parse() without try/catch or safeParse | 2 | 2026-03-26 | RULE CANDIDATE → code-style.md use safeParse. |
| Hardcoded constant values in tests instead of importing source constants | 3 | 2026-05-29 | RULE CANDIDATE → test-writer/MEMORY.md. |
| CodeRabbit false-positive rate elevated on exam-mode PRs | 2 | 2026-04-14 | RULE CANDIDATE → .coderabbit.yaml. |
| Manual-eval bug invisible to unit tests (dual-source UI only in full app) | 2 | 2026-04-28 | RULE CANDIDATE → code-style.md §7. |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (deferred). |
| Server Action ERROR_MESSAGES not synced with new RPC `RAISE EXCEPTION` literals | 3 | 2026-06-19 | RULE CANDIDATE (3). |
| Red-team spec-count prose drift across multiple doc surfaces | 7 | 2026-07-03 | RULE CANDIDATE (7) → agent-doc-updater.md. |
| Spec-doc literal counts drifting from distinct-count implementations | 2 | 2026-05-31 | RULE CANDIDATE. |
| Red-team RLS error-code assertions pinned to 42501 (instead of generic error non-null) | 2 | 2026-06-04 | RULE CANDIDATE (2), deferred. |
| CR-local false positives on Postgres CREATE OR REPLACE migration chain | 3 | 2026-06-30 | RULE CANDIDATE → agent-coderabbit-local.md pitfall #6. |
| Doc residual-vector claims missing DB-level constraint that exists (symmetric drift) | 2 | 2026-06-05 | RULE CANDIDATE. |
| ON CONFLICT clause with no supporting UNIQUE constraint (dead code or 42P10 at execution) | 2 | 2026-06-06 | RULE CANDIDATE. |
| plpgsql function body contains deferred-validation SQL (clean migration apply ≠ execution correctness) | 4 | 2026-06-21 | RULE CANDIDATE (4). |
| Semantic reviewer stale-baseline false positive (compared wrong predecessor migration/definition) | 2 | 2026-06-06 | RULE CANDIDATE. |
| Stale local Supabase volume / in-place migration edit causing local e2e failures | 2 | 2026-06-10 | RULE CANDIDATE. |
| Haiku code-reviewer false positives on Playwright E2E spec complexity | 2 | 2026-06-05 | RULE CANDIDATE. |
| Query helper promoted to throw on error, but SA caller missing catch boundary | 2 | 2026-06-01 | RULE CANDIDATE. |
| Red-team spec field-type assertion without nullability check across RPC modes | 2 | 2026-06-06 | RULE CANDIDATE. |
| Red-team RPC output-contract assertions under-asserted (positive paths assert existence but not field values) | 4 | 2026-06-13 | RULE CANDIDATE (4). |
| Shared test-infra helpers (setup.ts, helpers/*.ts) exceed 200-line utility cap | 2 | 2026-06-06 | RULE CANDIDATE. |
| Red-team spec self-labels vector mnemonic colliding with existing matrix ID | 3 | 2026-06-09 | RULE CANDIDATE (3). |
| Integration-test count in plan.md goes stale on each test-adding commit | 6 | 2026-07-02 | RULE CANDIDATE (6). |
| Identical type union declared in N Server Action files instead of extracted to lib/ | 2 | 2026-06-07 | WATCHING (2). On 3rd: code-style.md §4. |
| Test-writer agent generates cleanup/restore mutation without `{ error }` destructure | 2 | 2026-06-10 | RULE CANDIDATE. |
| Vitest passes / tsc fails on test file (esbuild strips types, tsc strict-mode catches) | 3 | 2026-06-24 | RULE CANDIDATE (3). |
| Test comment restating/paraphrasing the it() title (§7 enforcement gap) | 2 | 2026-06-14 | RULE CANDIDATE. |
| DB/caller-supplied value interpolated into HTML/SVG/XML template string without escaping | 2 | 2026-06-19 | RULE CANDIDATE → code-style.md §5. |
| Raw internal/third-party error.message exposed through exported result type | 2 | 2026-06-19 | RULE CANDIDATE → code-style.md §5 ext. |
| Single-concern sequential DB-seed/infra helpers exceeding 30-line function cap | 5 | 2026-07-02 | RULE CANDIDATE (5). |
| `vi.spyOn` spy restore hygiene gap (spy leaks across tests on assertion failure) | 2 | 2026-06-20 | RULE CANDIDATE. |
| CLAUDE.md QA-pipeline section drifts when lefthook.yml changes | 2 | 2026-06-20 | RULE CANDIDATE. |
| Test-file split drops a test-branch guard or condition during the move | 2 | 2026-06-23 | RULE CANDIDATE. |
| Conventional-commit subject/scope hook failures (uppercase subject start, compound scope/type) | 2 | 2026-06-24 | RULE CANDIDATE. |
| docs/database.md "Last updated" footer changelog entry stale when database.md content changes | 2 | 2026-06-26 | RULE CANDIDATE. |
| Rename/move leaves stale string references in source/test file inline comments | 2 | 2026-07-02 | RULE CANDIDATE. |
| Missing route entry in docs/plan.md route-structure tree after new route added | 2 | 2026-07-08 | RULE CANDIDATE → agent-doc-updater.md. |
| Merging a branch with a new global DB invariant silently breaks existing integration tests that lack beforeEach state-clearing | 1 | 2026-06-30 | WATCHING (archive row 474) |
| Spec tasks.md task-number sweep incomplete after merging master into feature branch | 1 | 2026-07-01 | WATCHING (archive row 475) |
| Plan-critic catches `_`-as-LIKE-wildcard in E2E marker constants (accepted as-is) | 1 | 2026-07-02 | WATCHING (archive row 477) |
| Assertions placed before result-capture inside try/finally block (failure skips result assignment) | 1 | 2026-07-02 | WATCHING (archive row 480) |
| Manual-eval-driven UI redesign grows a component file over the size cap outside the original plan | 1 | 2026-07-02 | WATCHING (archive row 481) |
| Cloud CR stale-review false positive on updated PR HEAD (re-raises already-handled findings) | 1 | 2026-07-02 | WATCHING (archive row 483) |
| Plan-critic dependency-graph omission when splitting a file (import order not listed in plan) | 1 | 2026-07-02 | WATCHING (archive row 484) |
| Dynamic URL query-param interpolated into redirect URL without encodeURIComponent (URL-injection) | 1 | 2026-07-10 | WATCHING (archive row 489) |
| Hook/hook-wiring changed or added without live-probe runtime verification (hooks found dead for months) | 1 | 2026-07-11 | WATCHING (archive row 490) |
| Pre-existing infra/tooling bug missed by N prior verifiers, caught only by impl-critic | 1 | 2026-07-11 | WATCHING (archive row 491) |
| Semantic-reviewer FP from recalled-not-verified runtime behavior when tests exist to run | 1 | 2026-07-11 | WATCHING (archive row 493) |
| DROP+CREATE redefinition bypasses CREATE-OR-REPLACE-only grep when finding latest function definition | 2 | 2026-08-09 | RULE CANDIDATE (2) → propose agent-workflow.md § Delegation Protocol (archive row 495). |
| CR-local re-raises already-adjudicated skip verdicts in later rounds of the same local loop session | 1 | 2026-07-11 | WATCHING (archive row 496) |
| Reviewer-proposed fix introduces a new defect caught by a subsequent reviewer (reviewer fixes need the same scrutiny as original code) | 2 | 2026-08-09 | RULE CANDIDATE. |
| CR-local systematically catches shell/hook robustness gaps that TypeScript-focused internal agents miss | 1 | 2026-07-11 | WATCHING (archive row 499) |
| Parallel implementer in batch dispatch diverges from extraction pattern the sibling implementers establish in the same commit | 1 | 2026-07-12 | WATCHING (archive row 504) |
| Plan validation completed against stale master; post-approval rebase reveals a deleted file (plan item removed as deviation) | 1 | 2026-07-12 | WATCHING (archive row 505) |
| Test assertions dropped during extraction-fixup refactor, leaving coverage gaps caught by semantic-reviewer | 1 | 2026-07-12 | WATCHING (archive row 506) |
| Internal Opus critics accepted a forward-looking error-path gap; external CR independently required the fix | 1 | 2026-07-13 | WATCHING (archive row 508) |
| Security-path trigger floor derived from semantic intent instead of mechanical diff-file glob | 1 | 2026-07-23 | WATCHING (archive row 500) |
| Dependency advisory evaluated against branch HEAD instead of merge base (fix looks redundant at HEAD) | 1 | 2026-07-23 | WATCHING (archive row 501) |
| impl-critic false assurance on dep-bump infrastructure side effects (claims "no lockfile regen required") | 1 | 2026-07-23 | WATCHING (archive row 502) |
| Orchestrator asserts CVE applicability without verifying structural preconditions vs repo config | 1 | 2026-07-23 | WATCHING (archive row 503) |
| Reassuring idempotency/safety comment masking a real side effect, propagated verbatim across sibling helpers | 1 | 2026-07-31 | WATCHING (archive row 504) |
| Playwright setup project execution ordering assumed rather than declared (`dependencies:` undeclared → scheduling race) | 1 | 2026-07-31 | WATCHING (archive row 505) |
| Cycle output (commit message / drive-by comment fix) introduces documentation inaccuracy caught by semantic-reviewer | 1 | 2026-07-31 | WATCHING (archive row 506) |
| Behavior fix ships with a regression test that can't detect the fix's own reversion (test passes identically on old and new code) | 1 | 2026-08-07 | WATCHING (archive row 511) |
| Fake-timer test that times out leaks fake-timer mode into later tests in the file (`finally` doesn't run on timeout) | 1 | 2026-08-07 | WATCHING (archive row 513) |
| Semantic-reviewer asserts a code path is unreachable without grepping for the triggering caller (reachability FP) | 1 | 2026-08-07 | WATCHING (archive row 514) |
| Dep-bump type error cascades into N unrelated CI suite failures (suites abort at shared build step, never test their own subject) | 1 | 2026-08-07 | WATCHING (archive row 515) |
| Verification gate's severity threshold makes it blind to sub-threshold advisories, so a removal justified by "gate is clean" is under-verified | 1 | 2026-08-08 | WATCHING (archive row 516) |
| Behavior-first test-title rename overclaims a stronger property than the assertion body proves | 3 | 2026-08-09 | RULE CANDIDATE (3) → propose code-style.md §7 (archive row 517). |
| Test-file split duplicates unused shared-scaffolding fixture into the destination file (Biome `noUnusedVariables` ERROR, no `--unsafe` fallback) | 1 | 2026-08-08 | WATCHING (archive row 518) |
| A promoted rule's inline count-label parenthetical desyncs from its own same-commit enumerated precedent list | 1 | 2026-08-08 | WATCHING (archive row 519) |
| Self-referential commit SHAs in branch memory/run-log files re-orphaned on each forced rebase (repair commit required per rebase cycle) | 1 | 2026-08-08 | WATCHING (archive row 520) |
| CR fabricates repo-history claims (asserts commit SHA / PR / issue does not exist when it does) — distinct from pitfall #8 code-construct class | 1 | 2026-08-08 | WATCHING (archive row 521) |
| Multi-row tracker state transition leaves one sibling archive row's leading STATUS token at RULE CANDIDATE while body says PROMOTED | 1 | 2026-08-08 | WATCHING (archive row 522) |
| Orchestrator asserts unverified codebase metric or RPC-enumeration claim in rules prose (caught pre-commit) | 1 | 2026-08-08 | WATCHING (archive row 523) |
| Playwright `getByRole('dialog')` used on an AlertDialog that renders `role="alertdialog"` — strict role match → locator never resolves → deterministic CI failure | 1 | 2026-08-09 | WATCHING (archive row 524) |
| Integration test uses a real reference-entity code in an `onConflict` upsert, silently overwriting shared seed row's other fields; missing `cleanupReferenceData` despite 20/21 siblings calling it | 1 | 2026-08-09 | WATCHING (archive row 525) |
| `check-test-title-leakage.mjs` does not detect bare snake_case column-name leakage in test titles (hook keys on forwards/from/maps/matches — not bare column names) | 1 | 2026-08-09 | WATCHING (archive row 526) |
| `as T` cast on dynamic array access in a test file without a runtime guard — code-style.md §5 cast-guard explicitly not relaxed in tests | 1 | 2026-08-09 | WATCHING (archive row 527) |
| `afterEach`/`afterAll` teardown runs with undefined fixture ids when `beforeEach` fails partway through setup | 1 | 2026-08-09 | WATCHING (archive row 528) |
| Stray nested `.git` in workspace sub-directory (`apps/web/.git`) causes Turbopack to misidentify workspace root — breaks local dev/build, CI unaffected | 1 | 2026-08-09 | WATCHING (archive row 529) |
| `fix-local-grants.sql` workaround re-grants blanket DML contradicting what later migrations explicitly revoke; live local DB grants diverge from migration history | 1 | 2026-08-09 | WATCHING (archive row 530) |
| Status/error-posture change leaves a sibling spec asserting the OLD value | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md § Plan Validation (archive row 531). |
| Orchestrator acts on a semantic-reviewer ISSUE without Finding Validation; premise falsified by impl-critic | 1 | 2026-08-09 | WATCHING (archive row 532) |
| Shared `buildChain` mock Proxy absorbs any chain call — new guard ships with zero test coverage | 1 | 2026-08-09 | WATCHING (archive row 533) |
| Inline comment enumerating sibling files/helpers by name/count goes stale as siblings are added | 1 | 2026-08-09 | WATCHING (archive row 534) |
| Internal post-commit gates miss an already-promoted §7 rule violation on a NEW site; CR-local catches it | 1 | 2026-08-09 | WATCHING (archive row 535) |
| Local DB queried as positive evidence when local grant-drift is additive (fix-local-grants.sql re-grants broadly; local presence ≠ migration truth) | 1 | 2026-08-09 | WATCHING (archive row 536) |
| Internal subagent confabulates repo-artifact identifier (wrong issue association, wrong matrix row range) | 1 | 2026-08-09 | WATCHING (archive row 537) |
| Agent appends session-log entry to memory file when task scope is REVIEW ONLY (task constraint overridden by memory-writing habit) | 1 | 2026-08-09 | WATCHING (archive row 538) |

## Durable knowledge (cross-agent)

- This agent does cross-agent synthesis + owns **false-positive frequency tracking** — see `topics/cross-agent-lessons.md` for the FP catalog and the full rule-promotion record.
- A count reaches promotion threshold at **2 distinct mechanisms** across different commits; same-file/same-migration repeats are NOT distinct.
- On any rule promotion, schedule the **Sweep-On-Rule-Promotion** (`agent-learner.md`): fix or file issues for ALL existing offenders, not just the triggering sites.
- Biggest recurring defect class: **partial fix to a sibling-file group** (tracker count 17) — grep all instances in the same file AND siblings before committing. Scope-out decisions are per-defect, not per-file.
- **Tracker is authoritative over rule-file parenthetical counts** — parentheticals lag; read the tracker.
- Convergent "not mechanically enforceable" verdicts from two agents = classification signal (text-only rule), not a coderabbit-sync gap.
- code-style.md §10 now also covers **RLS POLICY** migrations, not only `CREATE OR REPLACE FUNCTION` (verified in implementation-critic/MEMORY.md 3→4, #1167; not re-counted here).
- *(Other bullets → `topics/cross-agent-lessons.md`)*

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — durable rule-promotion record, false-positive catalog, recurring meta-lessons.
- [tracker-archive](topics/tracker-archive.md) — full tracker record; original journal at git `2e87c3e6`. **Before adding a NEW row, grep this file first — if it exists, increment it and lift to live table.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — Server Actions must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — two valid test forms for caller-level page-error recovery; promoted to code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — SECURITY INVOKER functions on RLS-protected tables return `error: null + data: []` on unauth calls; impl-critic FP suppression pattern.
