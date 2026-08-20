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
| Supabase SELECT error swallowed in auth helper (distinct from mutation) | 3 | 2026-06-04 | RULE CANDIDATE (archive row 617) |
| Zod error message pinned to exact internal text | 2 | 2026-03-16 | RULE CANDIDATE. |
| Missing `setSubmitting(true)` before async call in form/button handler | 2 | 2026-04-27 | RULE CANDIDATE (archive row 618) |
| Idempotent RPC returns hardcoded values instead of reading DB state | 2 | 2026-04-27 | RULE CANDIDATE. |
| Code-reviewer flags file outside the commit diff scope | 2 | 2026-04-08 | RULE CANDIDATE → agent-code-reviewer.md FP. |
| Function exceeding 30-line limit in Server Action file | 3 | 2026-04-10 | RULE CANDIDATE (3) → code-style.md §3. |
| ZodError escaping Server Action via parse() without try/catch or safeParse | 2 | 2026-03-26 | RULE CANDIDATE (archive row 619) |
| Hardcoded constant values in tests instead of importing source constants | 3 | 2026-05-29 | RULE CANDIDATE (archive row 620) |
| CodeRabbit false-positive rate elevated on exam-mode PRs | 2 | 2026-04-14 | RULE CANDIDATE → .coderabbit.yaml. |
| Manual-eval bug invisible to unit tests (dual-source UI only in full app) | 2 | 2026-04-28 | RULE CANDIDATE (archive row 621) |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (deferred). |
| Server Action ERROR_MESSAGES not synced with new RPC `RAISE EXCEPTION` literals | 3 | 2026-06-19 | RULE CANDIDATE (3). |
| Red-team spec-count prose drift across multiple doc surfaces | 7 | 2026-07-03 | RULE CANDIDATE (7) → agent-doc-updater.md. |
| Spec-doc literal counts drifting from distinct-count implementations | 2 | 2026-05-31 | RULE CANDIDATE. |
| Red-team RLS error-code assertions pinned to 42501 (instead of generic error non-null) | 2 | 2026-06-04 | RULE CANDIDATE (2) (archive row 622) |
| CR-local false positives on Postgres CREATE OR REPLACE migration chain | 3 | 2026-06-30 | RULE CANDIDATE (archive row 623) |
| Doc residual-vector claims missing DB-level constraint that exists (symmetric drift) | 2 | 2026-06-05 | RULE CANDIDATE. |
| ON CONFLICT clause with no supporting UNIQUE constraint (dead code or 42P10 at execution) | 2 | 2026-06-06 | RULE CANDIDATE. |
| plpgsql body contains deferred-validation SQL (clean apply ≠ execution correctness) | 4 | 2026-06-21 | RULE CANDIDATE (4). |
| Semantic reviewer stale-baseline false positive (wrong predecessor migration) | 2 | 2026-06-06 | RULE CANDIDATE. |
| Stale local Supabase volume / in-place migration edit causing local e2e failures | 2 | 2026-06-10 | RULE CANDIDATE. |
| Haiku code-reviewer false positives on Playwright E2E spec complexity | 2 | 2026-06-05 | RULE CANDIDATE. |
| Query helper promoted to throw on error, but SA caller missing catch boundary | 2 | 2026-06-01 | RULE CANDIDATE. |
| Red-team spec field-type assertion without nullability check across RPC modes | 2 | 2026-06-06 | RULE CANDIDATE. |
| Red-team RPC output-contract assertions under-asserted (positive paths assert existence but not field values) | 4 | 2026-06-13 | RULE CANDIDATE (4) (archive row 624) |
| Shared test-infra helpers (setup.ts, helpers/*.ts) exceed 200-line utility cap | 2 | 2026-06-06 | RULE CANDIDATE. |
| Red-team spec self-labels vector mnemonic colliding with existing matrix ID | 3 | 2026-06-09 | RULE CANDIDATE (3). |
| Integration-test count in plan.md goes stale on each test-adding commit | 7 | 2026-08-16 | RULE CANDIDATE (7). |
| Identical type union declared in N Server Action files instead of extracted to lib/ | 2 | 2026-06-07 | WATCHING (2) (archive row 625) |
| Test-writer agent generates cleanup/restore mutation without `{ error }` destructure | 2 | 2026-06-10 | RULE CANDIDATE. |
| Vitest passes / tsc fails on test file (esbuild strips types, tsc strict-mode catches) | 3 | 2026-06-24 | RULE CANDIDATE (3). |
| Test comment restating/paraphrasing the it() title (§7 enforcement gap) | 2 | 2026-06-14 | RULE CANDIDATE. |
| DB/caller-supplied value interpolated into HTML/SVG/XML template string without escaping | 2 | 2026-06-19 | RULE CANDIDATE (archive row 626) |
| Raw internal/third-party error.message exposed through exported result type | 2 | 2026-06-19 | RULE CANDIDATE (archive row 627) |
| Single-concern sequential DB-seed/infra helpers exceeding 30-line function cap | 5 | 2026-07-02 | RULE CANDIDATE (5). |
| `vi.spyOn` spy restore hygiene gap (spy leaks across tests on assertion failure) | 2 | 2026-06-20 | RULE CANDIDATE. |
| CLAUDE.md QA-pipeline section drifts when lefthook.yml changes | 2 | 2026-06-20 | RULE CANDIDATE. |
| Test-file split drops a test-branch guard or condition during the move | 2 | 2026-06-23 | RULE CANDIDATE. |
| Conventional-commit subject/scope hook failures (uppercase subject start, compound scope/type) | 2 | 2026-06-24 | RULE CANDIDATE (archive row 628) |
| docs/database.md "Last updated" footer changelog entry stale when database.md content changes | 2 | 2026-06-26 | RULE CANDIDATE (archive row 629) |
| Rename/move leaves stale string references in source/test file inline comments | 2 | 2026-07-02 | RULE CANDIDATE. |
| Missing route entry in docs/plan.md route-structure tree after new route added | 2 | 2026-07-08 | RULE CANDIDATE (archive row 630) |
| New global DB invariant breaks integration tests missing | 1 | 2026-06-30 | WATCHING (archive row 474) |
| Spec tasks.md task-number sweep incomplete after merging | 1 | 2026-07-01 | WATCHING (archive row 475) |
| Plan-critic catches `_`-as-LIKE-wildcard in E2E marker | 1 | 2026-07-02 | WATCHING (archive row 477) |
| Assertions before result-capture in try/finally (failure | 1 | 2026-07-02 | WATCHING (archive row 480) |
| Manual-eval UI redesign grows component over size cap | 1 | 2026-07-02 | WATCHING (archive row 481) |
| Cloud CR stale-review FP on updated PR HEAD (re-raises | 1 | 2026-07-02 | WATCHING (archive row 483) |
| Plan-critic omits import dependency order when splitting | 1 | 2026-07-02 | WATCHING (archive row 484) |
| Dynamic URL param in redirect without encodeURIComponent | 1 | 2026-07-10 | WATCHING (archive row 489) |
| Hook wiring added without live-probe verification (hooks | 1 | 2026-07-11 | WATCHING (archive row 490) |
| Pre-existing infra/tooling bug missed by N prior | 1 | 2026-07-11 | WATCHING (archive row 491) |
| Semantic-reviewer FP: recalled-but-unverified runtime | 1 | 2026-07-11 | WATCHING (archive row 493) |
| DROP+CREATE redefinition bypasses CREATE-OR-REPLACE-only | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol (archive row 495). |
| CR-local re-raises adjudicated skip verdicts in later | 1 | 2026-07-11 | WATCHING (archive row 496) |
| CR-local catches shell/hook robustness gaps | 1 | 2026-07-11 | WATCHING (archive row 499) |
| Parallel implementer diverges from sibling-established | 1 | 2026-07-12 | WATCHING (archive row 504) |
| Plan validated against stale master; post-rebase reveals | 1 | 2026-07-12 | WATCHING (archive row 505) |
| Test assertions dropped during extraction refactor | 1 | 2026-07-12 | WATCHING (archive row 506) |
| Internal Opus critics accepted error-path gap; external | 1 | 2026-07-13 | WATCHING (archive row 508) |
| Security-path trigger floor derived from intent not | 1 | 2026-07-23 | WATCHING (archive row 500) |
| Dep advisory evaluated at branch HEAD not merge base (fix | 1 | 2026-07-23 | WATCHING (archive row 501) |
| impl-critic false assurance on dep-bump side effects ("no | 1 | 2026-07-23 | WATCHING (archive row 502) |
| Orchestrator asserts CVE applicability without verifying | 1 | 2026-07-23 | WATCHING (archive row 503) |
| Idempotency/safety comment masks a real side effect | 1 | 2026-07-31 | WATCHING (archive row 504) |
| Playwright setup project ordering assumed not declared | 1 | 2026-07-31 | WATCHING (archive row 505) |
| Cycle commit message or drive-by comment introduces | 1 | 2026-07-31 | WATCHING (archive row 506) |
| Regression test can't detect fix's own reversion (passes | 4 | 2026-08-19 | RULE CANDIDATE (4) (archive row 598) |
| Fake-timer test timeout leaks timer mode into later tests | 1 | 2026-08-07 | WATCHING (archive row 513) |
| Reviewer asserts code/test element absent or unreachable | 2 | 2026-08-16 | RULE CANDIDATE (2) → agent-semantic-reviewer.md + agent-red-team.md DO (archive row 514). |
| Dep-bump type error cascades into N CI suite failures | 1 | 2026-08-07 | WATCHING (archive row 515) |
| Severity-gated verification misses sub-threshold | 1 | 2026-08-08 | WATCHING (archive row 516) |
| Behavior-first test-title rename overclaims a stronger | 3 | 2026-08-09 | RULE CANDIDATE (3) → code-style.md §7 (archive row 517). |
| Test-file split duplicates unused fixture (Biome | 1 | 2026-08-08 | WATCHING (archive row 518) |
| Claim-correction commit updates a count but leaves its | 3 | 2026-08-16 | RULE CANDIDATE (3) → archive row 519 (await cross-branch recurrence). |
| Branch memory/run-log SHAs orphaned on each forced rebase | 1 | 2026-08-08 | WATCHING (archive row 520) |
| CR fabricates repo-history claims (SHA/PR/issue "doesn't | 3 | 2026-08-19 | RULE CANDIDATE (3) (archive row 599) |
| Multi-row tracker transition leaves sibling archive row | 1 | 2026-08-08 | WATCHING (archive row 522) |
| Orchestrator embeds unverified schema identifier | 3 | 2026-08-17 | PROMOTED → agent-doc-updater (archive row 631) |
| Playwright getByRole('dialog') on AlertDialog (renders | 1 | 2026-08-09 | WATCHING (archive row 524) |
| Integration test uses real prod code in onConflict | 1 | 2026-08-09 | WATCHING (archive row 525) |
| check-test-title-leakage.mjs misses bare snake_case token | 2 | 2026-08-17 | RULE CANDIDATE (2) → extend hook DISALLOWED_PATTERNS or §7 note (archive row 526). |
| as T cast on dynamic array access in test without runtime | 1 | 2026-08-09 | WATCHING (archive row 527) |
| afterEach teardown uses undefined fixture ids when | 1 | 2026-08-09 | WATCHING (archive row 528) |
| Stray apps/web/.git causes Turbopack to misidentify | 1 | 2026-08-09 | WATCHING (archive row 529) |
| fix-local-grants.sql re-grants blanket DML contradicting | 1 | 2026-08-09 | WATCHING (archive row 530) |
| Status/error-posture change leaves a sibling spec | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation (archive row 531). |
| Orchestrator acts on ISSUE without Finding Validation | 1 | 2026-08-09 | WATCHING (archive row 532) |
| buildChain mock Proxy absorbs any chain call — new guard | 1 | 2026-08-09 | WATCHING (archive row 533) |
| Post-commit gates miss new site violating a promoted §7 | 2 | 2026-08-19 | RULE CANDIDATE (2) (archive row 600) |
| Local DB queried for grant evidence when drift is | 1 | 2026-08-09 | WATCHING (archive row 536) |
| Internal subagent fabricates repo-artifact identifier | 1 | 2026-08-09 | WATCHING (archive row 537) |
| Agent appends session-log to memory in REVIEW ONLY scope | 1 | 2026-08-09 | WATCHING (archive row 538) |
| Suppression on advisory surfaces missing from blocking | 1 | 2026-08-10 | WATCHING (archive row 540) |
| §10 GRANT/REVOKE chain tracing stopped at function body | 1 | 2026-08-10 | WATCHING (archive row 541) |
| Rule/skill asserts "effectively absolute" while cited | 1 | 2026-08-10 | WATCHING (archive row 542) |
| Prod-capable script copies behavioral semantics from | 1 | 2026-08-11 | WATCHING (archive row 539) |
| CR/reviewer suggestion adopted verbatim without checking | 3 | 2026-08-20 | PROMOTED → agent-coderabbit-local.md pitfall #9 (archive row 601) |
| Sibling-scope sweep keyed on RPC/function-name rather | 1 | 2026-08-11 | WATCHING (archive row 544) |
| Stale self-certified line-count claim in plan revision | 1 | 2026-08-11 | WATCHING (archive row 545) |
| Proposed verification command silently verifies nothing | 3 | 2026-08-18 | RULE CANDIDATE (3) (archive row 602) |
| Plan prose states unverified content-item count that | 2 | 2026-08-16 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation — grep-verify counts (archive row 547). |
| Broad `git add <subdir>` sweeps unrelated untracked files | 5 | 2026-08-19 | RESOLVED (archive row 603) |
| `json.dumps` round-trip reformats an entire tracked JSON | 1 | 2026-08-15 | WATCHING (archive row 549). |
| Blanket find/replace during tracker state-transition | 1 | 2026-08-15 | WATCHING (archive row 550). |
| Doc-updater flags drift by comparing against superseded | 1 | 2026-08-16 | WATCHING (archive row 551) |
| plan.md count bumped without reconciling its own N+M | 1 | 2026-08-16 | WATCHING (archive row 552) |
| Mechanical guard silently not running reads identically | 1 | 2026-08-16 | WATCHING (archive row 553) |
| Verification tool parse stops at nested brace, reporting | 1 | 2026-08-16 | WATCHING (archive row 554) |
| Fix commit correcting §10 violations introduces fresh §10 | 8 | 2026-08-20 | RULE CANDIDATE (8) → propose §10 "grep old phrase across all types" addition (archive row 604) |
| Plan cites correct sibling precedent but implements its | 1 | 2026-08-16 | WATCHING (archive row 556) |
| Doc-updater transposes two issue numbers, proposes | 1 | 2026-08-16 | WATCHING (archive row 557) |
| Sibling-parity test-coverage gap found via it() | 2 | 2026-08-18 | RULE CANDIDATE (2) (archive row 605) |
| Inline comment enumerating sibling files/call-sites by | 2 | 2026-08-17 | RULE CANDIDATE (2) (archive row 606) |
| Promoted rule (§1 same-commit-extraction, count=8) not | 1 | 2026-08-17 | WATCHING (archive row 559). |
| Review-follow-up exemption misapplied — commit pushed | 1 | 2026-08-17 | WATCHING (archive row 560). |
| Orchestrator copies a critic finding LABEL into a comment | 1 | 2026-08-17 | WATCHING (archive row 607) |
| Plan instructs a comment naming ONE cause of a multi-cause | 1 | 2026-08-17 | WATCHING (archive row 562). branch, without the plan enumerating the others. |
| Fix clears one of two state stores; comment claims "the" path | 1 | 2026-08-17 | WATCHING (archive row 563). sessionStorage vs module-level cache, caught by semantic-reviewer. |
| Follow-up commit misses review-follow-up line bound by margin | 2 | 2026-08-17 | RULE CANDIDATE (2) (archive row 608) |
| §10 violations (non-DB form) cluster in content/authoring commit | 4 | 2026-08-19 | RULE CANDIDATE (4) (archive row 609) |
| Evidence cited predates the code it certifies (stale build artifact as proof) | 2 | 2026-08-18 | RULE CANDIDATE (2) (archive row 610) |
| MC answer-key corpus balance gap visible only at corpus level | 1 | 2026-08-17 | WATCHING (archive row 566). Tool-fixed: assertMcKeyBalance in test suite + importer. |
| Prose asserts an issue is closed/resolved without `gh issue view` | 4 | 2026-08-19 | RULE CANDIDATE (4) (archive row 611) |
| Implementation-critic skipped under a self-invented size exemption | 2 | 2026-08-19 | RULE CANDIDATE (2) (archive row 632) |
| Verification date from local clock, not UTC (future-dated claim) | 1 | 2026-08-19 | WATCHING (archive row 633) |
| Comment about what a test assertion proves written without mutation-verification | 1 | 2026-08-19 | WATCHING (archive row 594) |
| Self-invalidating relative reference in durable rules/doc file | 3 | 2026-08-19 | RULE CANDIDATE (3) (archive row 612) |
| Verification gate's pass condition is empty result — fails open on malformed input | 2 | 2026-08-19 | RULE CANDIDATE (2) (archive row 613) |
| Rule-mirror written from memory of new text rather than source — multi-way drift | 2 | 2026-08-19 | PROMOTED → agent-workflow (archive row 614) |
| Ceiling or bound defined in terms of an unreachable precondition | 1 | 2026-08-19 | WATCHING (archive row 595) |
| Pipeline bookkeeping lines pushed review-follow-up commit over 20-line threshold | 1 | 2026-08-19 | WATCHING (archive row 596) |
| Open-set member enumeration in durable rules/doc file | 2 | 2026-08-19 | PROMOTED → code-style (archive row 615) |
| Measurement quoted next to a command that cannot produce it | 1 | 2026-08-19 | WATCHING (archive row 597) |
| Canonical amended, mirror left behind — in a commit that edits the mirror anyway | 1 | 2026-08-19 | WATCHING (archive row 616) |
| Mirror sweep scoped by file extension rather than by claim phrase — misses .ts/.spec-workflow occurrences | 3 | 2026-08-20 | RULE CANDIDATE (3) → propose agent-workflow.md §Rule-Mirror-Sync addition (archive row 637) |
| Correct advice with invented rationale survives §10 review (advice correct → false WHY unchecked) | 1 | 2026-08-20 | WATCHING (archive row 638) |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 1 | 2026-08-20 | WATCHING (archive row 639) |
| Derivation query replacing an open-set enumeration is unverified before publish (LIKE/NOT LIKE false negative) | 1 | 2026-08-20 | WATCHING (archive row 634) |
| Plan-critic round reverses its own prior round's misread; mirror-edit generalized a conditional carve-out past its precondition | 1 | 2026-08-20 | WATCHING (archive row 635) |
| Red-team spec positive controls pass via fixture-order coupling, not construction — no mutation gate for Playwright specs | 1 | 2026-08-20 | WATCHING (archive row 636) |

## Durable knowledge (cross-agent)

- Promotion threshold = **2 distinct mechanisms**, different commits (not same-file repeats). Schedule Sweep-On-Rule-Promotion on every promotion. Tracker > rule-file parenthetical counts.
- Biggest recurring defect: **partial fix to a sibling-file group** (count 19) — grep siblings before committing.
- First evidence CR mirror adds value beyond local agents: `b1280606` (chore/backlog-flow-control) caught by a `.coderabbit.yaml` rule the branch's own author added in `a0e01943`, 12 commits earlier. The mirror is not redundant. (The "3 commits" in b1280606's own message is wrong — re-derived here, per code-style.md §10 clause 1.)
- Wording-refinement bound proven: `387a29ac` bounded every refinement finding raised in one round; chain cap fired at `1c22b201` and again on fix/1175-tenant-isolation-select-only (3rd data point, 2026-08-20) — escalated to the user per agent-critic.md and applied without a 4th cycle. All terminate by rule, not by convergence.
- FP catalog + full rule-promotion record + more lessons → `topics/cross-agent-lessons.md`.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, meta-lessons.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — Server Actions must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — two valid test forms for caller-level page-error recovery; promoted to code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — SECURITY INVOKER functions on RLS-protected tables return `error: null + data: []` on unauth calls; impl-critic FP suppression pattern.
