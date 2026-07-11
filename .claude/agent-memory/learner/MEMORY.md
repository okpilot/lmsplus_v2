# Learner Agent — Memory

> Cross-agent pattern synthesis + false-positive frequency tracking.
> Governed by `.claude/rules/agent-memory.md`. **Update rows IN PLACE — never append a dated session log.** History lives in git (`git log -p -- .claude/agent-memory/learner/`).
> Migrated 2026-05-29 from the 6606-line append-only `patterns.md` journal. Terminal-state (PROMOTED/RESOLVED/FALSE POSITIVE) rows live in `topics/tracker-archive.md`.

## Issue Frequency Tracker (live — active rows only; PROMOTED rows → tracker-archive.md)

Full detail in `topics/tracker-archive.md`. Schema: `Issue Type | Count | Last Seen | Status`. Count=1 rows carry their archive row number — full narrative lives in the archive row, never here.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Test fixture shape mismatch (wrong/missing field in fixture object) | 2 | 2026-03-13 | RULE CANDIDATE. [full → archive] |
| Bare `catch {}` without error-type narrowing | 2 | 2026-04-08 | RULE CANDIDATE → code-style.md §6. [full → archive] |
| Partial fix applied to sibling file group (cross-cutting concern) | 13 | 2026-07-11 | RULE CANDIDATE (active). [full → archive] |
| useTransition + manual loading state hybrid fragility | 2 | 2026-03-13 | RULE CANDIDATE. [full → archive] |
| Silent numeric fallback without observability logging | 2 | 2026-03-13 | RULE CANDIDATE. [full → archive] |
| Query missing student_id scope (returns wrong student's data) | 2 | 2026-03-15 | RULE CANDIDATE → security.md (on 3rd). [full → archive] |
| UI event handler missing re-entry guard (double-fire) | 2 | 2026-03-16 | RULE CANDIDATE. [full → archive] |
| UPDATE returning zero rows treated as success (silent no-op) | 2 | 2026-03-20 | RULE CANDIDATE → code-style.md §5. [full → archive] |
| Error path in existing function untested (count-error branch) | 7 | 2026-06-27 | RULE CANDIDATE (7). [full → archive] |
| Derived value correct by coincidence (index used as count proxy) | 2 | 2026-03-13 | RULE CANDIDATE. [full → archive] |
| Auth callback guard ordering error (guards in wrong order → bypass) | 2 | 2026-03-17 | RULE CANDIDATE. [full → archive] |
| Supabase SELECT error swallowed in auth helper (distinct from mutation) | 3 | 2026-06-04 | RULE CANDIDATE → code-style.md §5 ext. [full → archive] |
| Zod error message pinned to exact internal text | 2 | 2026-03-16 | RULE CANDIDATE. [full → archive] |
| Missing `setSubmitting(true)` before async call in form/button handler | 2 | 2026-04-27 | RULE CANDIDATE → code-style.md (on 3rd). [full → archive] |
| Idempotent RPC returns hardcoded values instead of reading DB state | 2 | 2026-04-27 | RULE CANDIDATE. [full → archive] |
| Code-reviewer flags file outside the commit diff scope | 2 | 2026-04-08 | RULE CANDIDATE → agent-code-reviewer.md FP. [full → archive] |
| Function exceeding 30-line limit in Server Action file | 3 | 2026-04-10 | RULE CANDIDATE (3) → code-style.md §3 extract helper. [full → archive] |
| ZodError escaping Server Action via parse() without try/catch or safeParse | 2 | 2026-03-26 | RULE CANDIDATE → code-style.md use safeParse. [full → archive] |
| Hardcoded constant values in tests instead of importing source constants | 3 | 2026-05-29 | RULE CANDIDATE → test-writer/MEMORY.md. [full → archive] |
| CodeRabbit false-positive rate elevated on exam-mode PRs | 2 | 2026-04-14 | RULE CANDIDATE → .coderabbit.yaml. [full → archive] |
| Manual-eval bug invisible to unit tests (dual-source UI only in full app) | 2 | 2026-04-28 | RULE CANDIDATE → code-style.md §7. [full → archive] |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (deferred — same file/migration). [full → archive] |
| Server Action ERROR_MESSAGES not synced with new RPC `RAISE EXCEPTION` literals | 3 | 2026-06-19 | RULE CANDIDATE (3). [full → archive] |
| Red-team spec-count prose drift across multiple doc surfaces | 7 | 2026-07-03 | RULE CANDIDATE; rule in agent-doc-updater.md; doc-updater catches each cycle. [full → archive] |
| Spec-doc literal counts drifting from distinct-count implementations | 2 | 2026-05-31 | RULE CANDIDATE. [full → archive] |
| Red-team RLS error-code assertions pinned to 42501 (instead of generic error non-null) | 2 | 2026-06-04 | RULE CANDIDATE (2), deferred. [full → archive] |
| CR-local false positives on Postgres CREATE OR REPLACE migration chain | 3 | 2026-06-30 | RULE CANDIDATE → agent-coderabbit-local.md pitfall #6. [full → archive] |
| Doc residual-vector claims missing DB-level constraint that exists (symmetric drift) | 2 | 2026-06-05 | RULE CANDIDATE. [full → archive] |
| Migration added to packages/db/migrations but not supabase/migrations (or vice versa) | 2 | 2026-07-11 | RESOLVED (policy: packages/db/migrations FROZEN 2026-07-11, supabase/ sole source of truth — #1111). [full → archive] |
| ON CONFLICT clause with no supporting UNIQUE constraint (dead code or 42P10 at execution) | 2 | 2026-06-06 | RULE CANDIDATE. [full → archive] |
| plpgsql function body contains deferred-validation SQL (clean migration apply ≠ execution correctness) | 4 | 2026-06-21 | RULE CANDIDATE (4). [full → archive] |
| Semantic reviewer stale-baseline false positive (compared wrong predecessor migration/definition) | 2 | 2026-06-06 | RULE CANDIDATE. [full → archive] |
| Stale local Supabase volume / in-place migration edit causing local e2e failures | 2 | 2026-06-10 | RULE CANDIDATE. [full → archive] |
| Haiku code-reviewer false positives on Playwright E2E spec complexity | 2 | 2026-06-05 | RULE CANDIDATE (elevated FP rate on E2E scope). [full → archive] |
| Query helper promoted to throw on error, but SA caller missing catch boundary | 2 | 2026-06-01 | RULE CANDIDATE. [full → archive] |
| Red-team spec field-type assertion without nullability check across RPC modes | 2 | 2026-06-06 | RULE CANDIDATE. [full → archive] |
| Red-team RPC output-contract assertions under-asserted (positive paths assert existence but not field values) | 4 | 2026-06-13 | RULE CANDIDATE (4) — codified §7 "RPC Output Contract". [full → archive] |
| Shared test-infra helpers (setup.ts, helpers/*.ts) exceed 200-line utility cap | 2 | 2026-06-06 | RULE CANDIDATE. [full → archive] |
| Red-team spec self-labels vector mnemonic colliding with existing matrix ID | 3 | 2026-06-09 | RULE CANDIDATE (3). [full → archive] |
| Integration-test count in plan.md goes stale on each test-adding commit | 6 | 2026-07-02 | RULE CANDIDATE (6). [full → archive] |
| Identical type union declared in N Server Action files instead of extracted to lib/ | 2 | 2026-06-07 | WATCHING (2). On 3rd: code-style.md §4. [full → archive] |
| Test-writer agent generates cleanup/restore mutation without `{ error }` destructure | 2 | 2026-06-10 | RULE CANDIDATE. [full → archive] |
| Vitest passes / tsc fails on test file (esbuild strips types, tsc strict-mode catches) | 3 | 2026-06-24 | RULE CANDIDATE (3). [full → archive] |
| Test comment restating/paraphrasing the it() title (§7 enforcement gap) | 2 | 2026-06-14 | RULE CANDIDATE. [full → archive] |
| DB/caller-supplied value interpolated into HTML/SVG/XML template string without escaping | 2 | 2026-06-19 | RULE CANDIDATE → code-style.md §5. [full → archive] |
| Raw internal/third-party error.message exposed through exported result type | 2 | 2026-06-19 | RULE CANDIDATE → code-style.md §5 ext. [full → archive] |
| Single-concern sequential DB-seed/infra helpers exceeding 30-line function cap | 5 | 2026-07-02 | RULE CANDIDATE (5); proposed §3 exception pending #903. [full → archive] |
| `vi.spyOn` spy restore hygiene gap (spy leaks across tests on assertion failure) | 2 | 2026-06-20 | RULE CANDIDATE. [full → archive] |
| CLAUDE.md QA-pipeline section drifts when lefthook.yml changes | 2 | 2026-06-20 | RULE CANDIDATE. [full → archive] |
| Test-file split drops a test-branch guard or condition during the move | 2 | 2026-06-23 | RULE CANDIDATE. [full → archive] |
| Conventional-commit subject/scope hook failures (uppercase subject start, compound scope/type) | 2 | 2026-06-24 | RULE CANDIDATE. [full → archive] |
| docs/database.md "Last updated" footer changelog entry stale when database.md content changes | 2 | 2026-06-26 | RULE CANDIDATE. [full → archive] |
| Rename/move leaves stale string references in source/test file inline comments | 2 | 2026-07-02 | RULE CANDIDATE. [full → archive] |
| Missing route entry in docs/plan.md route-structure tree after new route added | 2 | 2026-07-08 | RULE CANDIDATE → agent-doc-updater.md sub-rule (when page.tsx added, flag missing plan.md route entry as DRIFT). [full → archive] |
| Merging a branch with a new global DB invariant silently breaks existing integration tests that lack beforeEach state-clearing | 1 | 2026-06-30 | WATCHING (archive row 474) |
| Spec tasks.md task-number sweep incomplete after merging master into feature branch | 1 | 2026-07-01 | WATCHING (archive row 475) |
| Plan-critic catches `_`-as-LIKE-wildcard in E2E marker constants (accepted as-is) | 1 | 2026-07-02 | WATCHING (archive row 477) |
| Assertions placed before result-capture inside try/finally block (failure skips result assignment) | 1 | 2026-07-02 | WATCHING (archive row 480) |
| Manual-eval-driven UI redesign grows a component file over the size cap outside the original plan | 1 | 2026-07-02 | WATCHING (archive row 481) |
| Cloud CR stale-review false positive on updated PR HEAD (re-raises already-handled findings) | 1 | 2026-07-02 | WATCHING (archive row 483) |
| Plan-critic dependency-graph omission when splitting a file (import order not listed in plan) | 1 | 2026-07-02 | WATCHING (archive row 484) |
| Dynamic URL query-param interpolated into redirect URL without encodeURIComponent (URL-injection; distinct from code-style.md §5 markup-escaping — different output context) | 1 | 2026-07-10 | WATCHING (archive row 489) |
| Hook/hook-wiring changed or added without live-probe runtime verification (hooks found dead for months) | 1 | 2026-07-11 | WATCHING (archive row 490) |
| Pre-existing infra/tooling bug missed by N prior verifiers, caught only by impl-critic | 1 | 2026-07-11 | WATCHING (archive row 491) |
| Rule text updated in .claude/rules/*.md or CLAUDE.md without updating its commands/*.md restatement (stale mirror) | 2 | 2026-07-11 | PROMOTED → agent-workflow.md § Rule-Mirror Sync (2026-07-11). [full → archive] |
| Semantic-reviewer FP from recalled-not-verified runtime behavior when tests exist to run | 1 | 2026-07-11 | WATCHING (archive row 493) |
| Doc-updater FP on planned-batch-N work (misreads own exclusion list) | 2 | 2026-07-11 | PROMOTED → agent-doc-updater.md NEVER (2026-07-11; archive row 494). Clean ×2 post-promotion (batch-5/6). |
| DROP+CREATE redefinition bypasses CREATE-OR-REPLACE-only grep when finding latest function definition | 1 | 2026-07-11 | WATCHING (archive row 495) |

## Durable knowledge (cross-agent)

- This agent does cross-agent synthesis + owns **false-positive frequency tracking** — see `topics/cross-agent-lessons.md` for the FP catalog and the full rule-promotion record.
- A count reaches promotion threshold at **2 distinct mechanisms** across different commits; same-file/same-migration repeats are NOT distinct.
- On any rule promotion, schedule the **Sweep-On-Rule-Promotion** (`agent-learner.md`): fix or file issues for ALL existing offenders, not just the triggering sites.
- The biggest recurring defect class is **partial fix to a sibling-file group** (tracker count 12) — always grep all instances in the file AND siblings before committing.
- **Learner tracker is authoritative over rule-file parenthetical counts.** Read this tracker, not the rule file's parenthetical — the parenthetical can lag (e.g. stale at count=4 for pitfall #7, caught 2026-07-03).
- *(Other bullets relocated to `topics/cross-agent-lessons.md` § Durable knowledge relocated 2026-06-07.)*

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — durable rule-promotion record, false-positive catalog, recurring meta-lessons.
- [tracker-archive](topics/tracker-archive.md) — full tracker record; original journal at git `2e87c3e6`. **Before adding a NEW row, grep this file first — if it exists, increment it and lift to live table.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — Server Actions must catch now-throwing query helpers at the client boundary.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — two valid test forms for caller-level page-error recovery; promoted to code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — SECURITY INVOKER functions on RLS-protected tables return `error: null + data: []` on unauth calls; impl-critic FP suppression pattern.
