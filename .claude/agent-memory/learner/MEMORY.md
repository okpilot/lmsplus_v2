# Learner Agent — Memory

> Cross-agent pattern synthesis + false-positive tracking. Update IN PLACE — no dated logs; history in git. Terminal-state rows → tracker-archive.md.

## Issue Frequency Tracker (active rows; terminal-state → tracker-archive.md)

Schema: Issue Type | Count | Last Seen | Status. Count=1 rows: archive row# in status, full narrative in archive.

**2026-08-24 compaction:** single-occurrence WATCHING rows were migrated out of this index for space; their detail is in `topics/tracker-archive.md` — grep it by row number rather than this file. No count or row list is kept here on purpose: the first version of this note claimed "77 rows" over a range list that expanded to 85, and named rows 508/634/635/636 as preserved when the compaction had in fact dropped them (restored 2026-08-24) and row 507, which never existed.

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
| DROP+CREATE redefinition bypasses CREATE-OR-REPLACE-only | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md § Delegation Protocol (archive row 495). |
| Regression test can't detect fix's own reversion (passes | 4 | 2026-08-19 | RULE CANDIDATE (4) (archive row 598) |
| Reviewer asserts code/test element absent or unreachable | 2 | 2026-08-16 | RULE CANDIDATE (2) → agent-semantic-reviewer.md + agent-red-team.md DO (archive row 514). |
| Behavior-first test-title rename overclaims a stronger | 3 | 2026-08-09 | RULE CANDIDATE (3) → code-style.md §7 (archive row 517). |
| Claim-correction commit updates a count but leaves its | 3 | 2026-08-16 | RULE CANDIDATE (3) → archive row 519 (await cross-branch recurrence). |
| CR fabricates repo-history claims (SHA/PR/issue "doesn't | 3 | 2026-08-19 | RULE CANDIDATE (3) (archive row 599) |
| check-test-title-leakage.mjs misses bare snake_case token | 2 | 2026-08-17 | RULE CANDIDATE (2) → extend hook DISALLOWED_PATTERNS or §7 note (archive row 526). |
| Status/error-posture change leaves a sibling spec | 2 | 2026-08-09 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation (archive row 531). |
| Post-commit gates miss new site violating a promoted §7 | 2 | 2026-08-19 | RULE CANDIDATE (2) (archive row 600) |
| Proposed verification command silently verifies nothing | 3 | 2026-08-18 | RULE CANDIDATE (3) (archive row 602) |
| Plan prose states unverified content-item count that | 2 | 2026-08-16 | RULE CANDIDATE (2) → agent-workflow.md §Plan Validation — grep-verify counts (archive row 547). |
| Fix commit correcting §10 violations introduces fresh §10 | 15 | 2026-08-24 | RULE CANDIDATE (15) → propose §10 "whole-block re-read after every edit" (archive row 604). POSITIVE SIGNAL: `cd479557` broke the streak — first clean commit, citations verified pre-commit not post-hoc. |
| Sibling-parity test-coverage gap found via it() | 2 | 2026-08-18 | RULE CANDIDATE (2) (archive row 605) |
| Inline comment enumerating sibling files/call-sites by | 2 | 2026-08-17 | RULE CANDIDATE (2) (archive row 606) |
| Follow-up commit misses review-follow-up line bound by margin | 2 | 2026-08-17 | RULE CANDIDATE (2) (archive row 608) |
| §10 violations (non-DB form) cluster in content/authoring commit | 4 | 2026-08-19 | RULE CANDIDATE (4) (archive row 609) |
| Evidence cited predates the code it certifies (stale build artifact as proof) | 2 | 2026-08-18 | RULE CANDIDATE (2) (archive row 610) |
| Prose asserts an issue is closed/resolved without `gh issue view` | 4 | 2026-08-19 | RULE CANDIDATE (4) (archive row 611) |
| Implementation-critic skipped under a self-invented size exemption | 2 | 2026-08-19 | RULE CANDIDATE (2) (archive row 632) |
| Self-invalidating relative reference in durable rules/doc file | 3 | 2026-08-19 | RULE CANDIDATE (3) (archive row 612) |
| Verification gate's pass condition is empty result — fails open on malformed input | 2 | 2026-08-19 | RULE CANDIDATE (2) (archive row 613) |
| Mirror sweep scoped by file extension rather than by claim phrase — misses .ts/.spec-workflow occurrences | 3 | 2026-08-20 | RULE CANDIDATE (3) → propose agent-workflow.md §Rule-Mirror-Sync addition (archive row 637) |
| Correct advice with invented rationale (correct conclusion shields false WHY from scrutiny) | 2 | 2026-08-20 | RULE CANDIDATE (2) (archive row 638) |
| Post-cycle agent-memory delta written but not committed before push — caught only by pre-push sweep | 3 | 2026-08-20 | RULE CANDIDATE (3) (archive row 639) |
| §10 fix edits staged partially — correct text in working tree, not in commit; `git grep` returns clean | 2 | 2026-08-20 | RULE CANDIDATE (2) → pre-commit: `git diff --staged` before any §10 fix commit (archive row 640) |
| Doc-updater reports 1 stale claim in security doc block; whole-block read by orchestrator finds additional sibling claims | 2 | 2026-08-20 | RULE CANDIDATE (2) → agent-doc-updater.md: whole-block read on any stale claim, not only structural cross-references (archive row 641) |
| Empirical measurement correct for tested scenario but scenario excludes the failure case | 3 | 2026-08-20 | RULE CANDIDATE (3) → code-style.md §10 clause 5; unified w/ row 650 (archive rows 649+650) |
| Explore report accurate for its narrow question is read as answering a broader plan claim (mirror "pointer" vs inline restatement) | 1 | 2026-08-24 | WATCHING (archive row 651) |
| Commit message cites a config/rule file's lines to justify a decision, but cited lines are scoped narrower than the claim | 1 | 2026-08-24 | WATCHING (archive row 652) |
| Mirror-sync phrase-grep misses a mirror restated in NUMBERS not matching words — distinct from extension-scoping (row 637) | 1 | 2026-08-24 | WATCHING (archive row 653) |
| Subagent's own justification for its proposed diff fabricates coverage that diff does not have (coderabbit-sync, 42702/23502→42803) | 1 | 2026-08-24 | WATCHING (archive row 654) |

## Durable knowledge (cross-agent)

- Promotion threshold = **2 distinct mechanisms**, different commits (not same-file repeats). Schedule Sweep-On-Rule-Promotion on every promotion. Tracker > rule-file parenthetical counts.
- Biggest recurring defect: **partial fix to a sibling-file group** (count 19) — grep siblings before committing.
- First evidence CR mirror adds value beyond local agents: `b1280606` (chore/backlog-flow-control) caught by a `.coderabbit.yaml` rule the branch's own author added in `a0e01943`, 12 commits earlier. The mirror is not redundant. (The "3 commits" in b1280606's own message is wrong — re-derived here, per code-style.md §10 clause 1.)
- Wording-refinement bound proven: `387a29ac` bounded every refinement finding raised in one round; chain cap fired at `1c22b201` and again on fix/1175-tenant-isolation-select-only (3rd data point, 2026-08-20) — escalated to the user per agent-critic.md and applied without a 4th cycle. All terminate by rule, not by convergence.
- Empirical measurement discipline working: grep-over-checkout identified RSC flight payload, not DOM (reversed a design decision); A/B instrumentation found 4→1 and 5→1 body executions (disproved issue's network-dedup rationale); running local red-team specs against origin/master under identical DB state proved failures were environmental not code regressions (PR #1238). Cheap wrong method consistently agreed with expected answer — measure before concluding.
- FP catalog + full rule-promotion record + more lessons → `topics/cross-agent-lessons.md`.
- Row 604 first clean cycle: `cd479557` shipped with zero false claims after two straight instances (`32ed663d`, `39887952`) — orchestrator verified citations pre-commit instead of relying on review to catch them. One data point, not resolved yet — watch for whether it holds.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — rule-promotion record, FP catalog, meta-lessons.
- [tracker-archive](topics/tracker-archive.md) — full tracker record. **Grep before adding a NEW row.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — Server Actions must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — two valid test forms for caller-level page-error recovery; promoted to code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — SECURITY INVOKER functions on RLS-protected tables return `error: null + data: []` on unauth calls; impl-critic FP suppression pattern.
