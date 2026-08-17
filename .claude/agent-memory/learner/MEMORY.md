# Learner Agent — Memory

> Cross-agent pattern synthesis + false-positive tracking. Update IN PLACE — no dated logs; history in git. Terminal-state rows → tracker-archive.md.

## Issue Frequency Tracker (active rows; terminal-state → tracker-archive.md)

Schema: Issue Type | Count | Last Seen | Status. Count=1 rows: archive row# in status, full narrative in archive.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Test fixture shape mismatch | 2 | 2026-03-13 | RULE CANDIDATE. |
| Bare `catch {}` without error-type narrowing | 2 | 2026-04-08 | RULE CANDIDATE → code-style.md §6. |
| useTransition + manual loading state hybrid fragility | 2 | 2026-03-13 | RULE CANDIDATE. |
| Silent numeric fallback without observability logging | 2 | 2026-03-13 | RULE CANDIDATE. |
| Query missing student_id scope (returns wrong student's data) | 2 | 2026-03-15 | RULE CANDIDATE → security.md (on 3rd). |
| UI event handler missing re-entry guard (double-fire) | 2 | 2026-03-16 | RULE CANDIDATE. |
| UPDATE returning zero rows treated as success (silent no-op) | 2 | 2026-03-20 | RULE CANDIDATE → code-style.md §5. |
| Error path in existing function untested (count-error branch) | 8 | 2026-08-11 | RULE CANDIDATE (8). |
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
| plpgsql body contains deferred-validation SQL (clean apply ≠ execution correctness) | 4 | 2026-06-21 | RULE CANDIDATE (4). |
| Semantic reviewer stale-baseline false positive (wrong predecessor migration) | 2 | 2026-06-06 | RULE CANDIDATE. |
| Stale local Supabase volume / in-place migration edit causing local e2e failures | 2 | 2026-06-10 | RULE CANDIDATE. |
| Haiku code-reviewer false positives on Playwright E2E spec complexity | 2 | 2026-06-05 | RULE CANDIDATE. |
| Query helper promoted to throw on error, but SA caller missing catch boundary | 2 | 2026-06-01 | RULE CANDIDATE. |
| Red-team spec field-type assertion without nullability check across RPC modes | 2 | 2026-06-06 | RULE CANDIDATE. |
| Red-team RPC output-contract assertions under-asserted (positive paths assert existence but not field values) | 4 | 2026-06-13 | RULE CANDIDATE (4). |
| Shared test-infra helpers (setup.ts, helpers/*.ts) exceed 200-line utility cap | 2 | 2026-06-06 | RULE CANDIDATE. |
| Red-team spec self-labels vector mnemonic colliding with existing matrix ID | 3 | 2026-06-09 | RULE CANDIDATE (3). |
| Integration-test count in plan.md goes stale on each test-adding commit | 7 | 2026-08-16 | RULE CANDIDATE (7). |
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
| New global DB invariant breaks integration tests missing beforeEach state-clearing (on merge) | 1 | 2026-06-30 | WATCHING (archive row 474) |
| Spec tasks.md task-number sweep incomplete after merging master into feature branch | 1 | 2026-07-01 | WATCHING (archive row 475) |
| Plan-critic catches `_`-as-LIKE-wildcard in E2E marker constants (accepted as-is) | 1 | 2026-07-02 | WATCHING (archive row 477) |
| Assertions before result-capture in try/finally (failure skips assignment) | 1 | 2026-07-02 | WATCHING (archive row 480) |
| Manual-eval UI redesign grows component over size cap outside plan | 1 | 2026-07-02 | WATCHING (archive row 481) |
| Cloud CR stale-review FP on updated PR HEAD (re-raises already-handled findings) | 1 | 2026-07-02 | WATCHING (archive row 483) |
| Plan-critic omits import dependency order when splitting a file | 1 | 2026-07-02 | WATCHING (archive row 484) |
| Dynamic URL param in redirect without encodeURIComponent (URL-injection) | 1 | 2026-07-10 | WATCHING (archive row 489) |
| Hook wiring added without live-probe verification (hooks found dead for months) | 1 | 2026-07-11 | WATCHING (archive row 490) |
| Pre-existing infra/tooling bug missed by N prior verifiers, caught only by impl-critic | 1 | 2026-07-11 | WATCHING (archive row 491) |
| Semantic-reviewer FP: recalled-but-unverified runtime behavior (tests disprove) | 1 | 2026-07-11 | WATCHING (archive row 493) |
| DROP+CREATE redefinition bypasses CREATE-OR-REPLACE-only grep | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol (archive row 495). |
| CR-local re-raises adjudicated skip verdicts in later rounds of the same session | 1 | 2026-07-11 | WATCHING (archive row 496) |
| CR-local catches shell/hook robustness gaps TypeScript-focused agents miss | 1 | 2026-07-11 | WATCHING (archive row 499) |
| Parallel implementer diverges from sibling-established extraction pattern in same commit | 1 | 2026-07-12 | WATCHING (archive row 504) |
| Plan validated against stale master; post-rebase reveals deleted file (plan item removed) | 1 | 2026-07-12 | WATCHING (archive row 505) |
| Test assertions dropped during extraction refactor (coverage gap caught by semantic-reviewer) | 1 | 2026-07-12 | WATCHING (archive row 506) |
| Internal Opus critics accepted error-path gap; external CR required the fix | 1 | 2026-07-13 | WATCHING (archive row 508) |
| Security-path trigger floor derived from intent not mechanical glob | 1 | 2026-07-23 | WATCHING (archive row 500) |
| Dep advisory evaluated at branch HEAD not merge base (fix looks redundant) | 1 | 2026-07-23 | WATCHING (archive row 501) |
| impl-critic false assurance on dep-bump side effects ("no lockfile regen required") | 1 | 2026-07-23 | WATCHING (archive row 502) |
| Orchestrator asserts CVE applicability without verifying preconditions vs repo config | 1 | 2026-07-23 | WATCHING (archive row 503) |
| Idempotency/safety comment masks a real side effect, propagated to sibling helpers | 1 | 2026-07-31 | WATCHING (archive row 504) |
| Playwright setup project ordering assumed not declared (undeclared dependencies → race) | 1 | 2026-07-31 | WATCHING (archive row 505) |
| Cycle commit message or drive-by comment introduces inaccuracy (caught by semantic-reviewer) | 1 | 2026-07-31 | WATCHING (archive row 506) |
| Regression test can't detect fix's own reversion (passes on old and new code) | 1 | 2026-08-07 | WATCHING (archive row 511) |
| Fake-timer test timeout leaks timer mode into later tests (finally skipped) | 1 | 2026-08-07 | WATCHING (archive row 513) |
| Reviewer asserts code/test element absent or unreachable without grepping to verify (FP) | 2 | 2026-08-16 | RULE CANDIDATE (2; archive row 514 + this run: red-team claimed no test for `'Could not check answer'` branch, contradicted by source). Propose: agent-semantic-reviewer.md + agent-red-team.md DO. |
| Dep-bump type error cascades into N CI suite failures (shared build step aborts) | 1 | 2026-08-07 | WATCHING (archive row 515) |
| Severity-gated verification misses sub-threshold advisories (gate-clean ≠ safe to remove) | 1 | 2026-08-08 | WATCHING (archive row 516) |
| Behavior-first test-title rename overclaims a stronger property than the assertion body proves | 3 | 2026-08-09 | RULE CANDIDATE (3) → code-style.md §7 (archive row 517). |
| Test-file split duplicates unused fixture (Biome noUnusedVariables ERROR, no --unsafe fallback) | 1 | 2026-08-08 | WATCHING (archive row 518) |
| Claim-correction commit updates a count but leaves its supporting arithmetic stale | 3 | 2026-08-16 | RULE CANDIDATE (3; same branch; await cross-branch recurrence; see archive row 519). |
| Branch memory/run-log SHAs orphaned on each forced rebase (repair commit per cycle) | 1 | 2026-08-08 | WATCHING (archive row 520) |
| CR fabricates repo-history claims (SHA/PR/issue "doesn't exist"/"unsupported") — distinct from pitfall #8 | 2 | 2026-08-17 | RULE CANDIDATE (2) → propose broadening agent-coderabbit-local.md Pitfall #8 (archive row 521). |
| Multi-row tracker transition leaves sibling archive row STATUS token mismatched | 1 | 2026-08-08 | WATCHING (archive row 522) |
| Orchestrator embeds unverified schema identifier (column/RPC count) in rule/doc prose | 2 | 2026-08-10 | RULE CANDIDATE (2) → agent-doc-updater.md cite-before-writing NEVER bullet. |
| Playwright getByRole('dialog') on AlertDialog (renders alertdialog) → zero matches | 1 | 2026-08-09 | WATCHING (archive row 524) |
| Integration test uses real prod code in onConflict upsert, corrupts shared seed; missing cleanupReferenceData | 1 | 2026-08-09 | WATCHING (archive row 525) |
| check-test-title-leakage.mjs misses bare snake_case token leakage in test titles (column names, enum/mode values) | 2 | 2026-08-17 | RULE CANDIDATE (2) → propose extending the hook's DISALLOWED_PATTERNS or a §7 textual note (archive row 526). |
| as T cast on dynamic array access in test without runtime guard (§5 not relaxed in tests) | 1 | 2026-08-09 | WATCHING (archive row 527) |
| afterEach teardown uses undefined fixture ids when beforeEach fails partway | 1 | 2026-08-09 | WATCHING (archive row 528) |
| Stray apps/web/.git causes Turbopack to misidentify workspace root (local dev broken, CI clean) | 1 | 2026-08-09 | WATCHING (archive row 529) |
| fix-local-grants.sql re-grants blanket DML contradicting migrations; local grants diverge | 1 | 2026-08-09 | WATCHING (archive row 530) |
| Status/error-posture change leaves a sibling spec asserting the OLD value | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md § Plan Validation (archive row 531). |
| Orchestrator acts on ISSUE without Finding Validation; impl-critic falsifies premise | 1 | 2026-08-09 | WATCHING (archive row 532) |
| buildChain mock Proxy absorbs any chain call — new guard ships with zero coverage | 1 | 2026-08-09 | WATCHING (archive row 533) |
| Post-commit gates miss new site violating a promoted §7 rule; CR-local catches it | 1 | 2026-08-09 | WATCHING (archive row 535) |
| Local DB queried for grant evidence when drift is additive (local presence ≠ migration truth) | 1 | 2026-08-09 | WATCHING (archive row 536) |
| Internal subagent fabricates repo-artifact identifier (wrong issue# or matrix row range) | 1 | 2026-08-09 | WATCHING (archive row 537) |
| Agent appends session-log to memory in REVIEW ONLY scope (habit overrides task constraint) | 1 | 2026-08-09 | WATCHING (archive row 538) |
| Suppression on advisory surfaces missing from blocking pre-push gate (stakes-inverted) | 1 | 2026-08-10 | WATCHING (archive row 540) |
| §10 GRANT/REVOKE chain tracing stopped at function body (reachability claim proved wrong) | 1 | 2026-08-10 | WATCHING (archive row 541) |
| Rule/skill asserts "effectively absolute" while cited section documents the exception class | 1 | 2026-08-10 | WATCHING (archive row 542) |
| Prod-capable script copies behavioral semantics from local-only seed, inheriting local-context assumptions | 1 | 2026-08-11 | WATCHING (archive row 539) |
| CR/reviewer suggestion adopted verbatim without checking established codebase idiom (style drift, non-defective) | 1 | 2026-08-11 | WATCHING (archive row 543) |
| Sibling-scope sweep keyed on RPC/function-name rather than code structure — misses same-structure call sites with a different RPC | 1 | 2026-08-11 | WATCHING (archive row 544) |
| Stale self-certified line-count claim in plan revision carries forward after subsequent plan rounds add lines | 1 | 2026-08-11 | WATCHING (archive row 545) |
| Proposed verification command silently verifies nothing (`tsc --noEmit` positional-path bypass; `&& echo` masks TS5112 exit 0) | 2 | 2026-08-11 | RULE CANDIDATE (2) → agent-workflow.md § Plan Validation |
| Plan prose states unverified content-item count that diverges from actual codebase | 2 | 2026-08-16 | RULE CANDIDATE (2; archive row 547 + this run: plan claimed "6 of 8 sites clear", grep showed 4). Propose: agent-workflow.md § Plan Validation — grep-verify counts. |
| Broad `git add <subdir>` sweeps unrelated untracked files into a commit (new loc., apps/web stray-.git class) | 1 | 2026-08-15 | WATCHING (archive row 548). |
| `json.dumps` round-trip reformats an entire tracked JSON file to edit one string | 1 | 2026-08-15 | WATCHING (archive row 549). |
| Blanket find/replace during tracker state-transition corrupts unrelated rows (status-token match, not distinctive text) | 1 | 2026-08-15 | WATCHING (archive row 550). |
| Doc-updater flags drift by comparing against superseded migration body (lacks trace-before-flagging guidance unlike semantic-reviewer/critics) | 1 | 2026-08-16 | WATCHING (archive row 551) |
| plan.md count bumped without reconciling its own N+M parenthetical decomposition | 1 | 2026-08-16 | WATCHING (archive row 552) |
| Mechanical guard silently not running reads identically to passing — guard scope excludes the relevant path, output is "0 files clean" either way | 1 | 2026-08-16 | WATCHING (archive row 553) |
| Verification tool parse stops at nested brace, reporting a field absent when it exists — spurious negative indistinguishable from genuine negative | 1 | 2026-08-16 | WATCHING (archive row 554) |
| Fix commit correcting §10 violations introduces fresh §10 violations of its own (wrong line-ref, wrong enumeration count, wrong mechanism name, wrong glob semantics) | 1 | 2026-08-16 | WATCHING (archive row 555) |
| Plan cites correct sibling precedent but implements its inverse disposition (author-plan variant; distinct from CR Pitfall #9) | 1 | 2026-08-16 | WATCHING (archive row 556) |
| Doc-updater transposes two issue numbers and proposes to close a partially-fixed issue as fully resolved | 1 | 2026-08-16 | WATCHING (archive row 557) |
| Sibling-parity test-coverage gap found by diffing `it()` titles between two sibling test files, not by re-deriving mechanisms file-by-file | 1 | 2026-08-17 | WATCHING (archive row 558). Sibling-file-audit meta-pattern (durable knowledge below, count=19) recurring in a NEW domain: test files/title lists, not code structure. |

## Durable knowledge (cross-agent)

- Promotion threshold = **2 distinct mechanisms**, different commits (not same-file repeats). Schedule Sweep-On-Rule-Promotion on every promotion. Tracker > rule-file parenthetical counts.
- Biggest recurring defect: **partial fix to a sibling-file group** (count 19) — grep siblings before committing.
- FP catalog + full rule-promotion record + more lessons → `topics/cross-agent-lessons.md`.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, meta-lessons.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — Server Actions must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — two valid test forms for caller-level page-error recovery; promoted to code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — SECURITY INVOKER functions on RLS-protected tables return `error: null + data: []` on unauth calls; impl-critic FP suppression pattern.
