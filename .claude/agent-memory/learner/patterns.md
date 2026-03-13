# Learner Agent — Pattern Memory

## Issue Frequency

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Test fixture shape mismatch (wrong or missing field in fixture object) | 2 | 2026-03-13 | RULE CANDIDATE — first: missing `short` prop (2026-03-11); second: wrong SubjectOption shape in 6722e97; both caught pre-commit by type-check; test-writer patterns memory should note: always derive fixture shapes from the exported TypeScript type, not by hand |
| `possibly undefined` in test assertions | 1 | 2026-03-11 | Fixed — biome now allows `!` in test files |
| Missing vitest imports (beforeEach) | 1 | 2026-03-11 | Fixed — 3 test files missing import |
| External agent output invisible | 1 | 2026-03-11 | Fixed — Decision 20: agents now run as in-session subagents |
| Duplicate Next.js installs (Playwright) | 1 | 2026-03-11 | Fixed — excluded e2e/ from tsconfig, cast in proxy.ts |
| Pre-push hooks too slow for large diffs | 1 | 2026-03-11 | Fixed — diff cap + timeout + grep fallback |
| Hook file exceeding 80-line limit | 4 | 2026-03-13 | RULE EXISTS — 70-line watch added to code-reviewer memory (9f5a6cc); still recurring despite watch threshold; use-quiz-state.ts hit 117 lines in 741ae30 (4th occurrence); fix required hook split in 34a9352 |
| SQL score aggregation over full table (not current batch) | 1 | 2026-03-12 | Watch — batch_submit_quiz RPC; fixed in f53eccf |
| Array positional pairing instead of Map lookup (FSRS) | 1 | 2026-03-12 | Watch — batch-submit.ts updateFsrsCards; fixed in f53eccf |
| Empty-array guard missing at SQL level | 1 | 2026-03-12 | Watch — batch_submit_quiz RPC; fixed in f53eccf |
| New hook/utility file shipped without a test file | 3 | 2026-03-12 | RULE ADDED (9f5a6cc) — still recurring; rule exists but not followed at write time |
| Top-level await in node16 package test file | 1 | 2026-03-12 | Watch — packages/db/src/server.test.ts; fixed with dynamic import helper |
| Bare `catch {}` without error-type narrowing | 1 | 2026-03-12 | Watch — packages/db/src/server.ts; suggestion from semantic-reviewer |
| `finally` clearing loading state during navigation | 1 | 2026-03-12 | Fixed in a269284 — only clear loading in catch/error branch |
| Supabase mutation result not destructured (error silently dropped) | 3 | 2026-03-12 | RULE EXISTS (code-style.md Section 5) — 5 new call sites found in Sprint 3 analytics cycle (db5d8ea); compliance gap, rule is clear |
| Unstable useEffect dependency (inline function prop) | 1 | 2026-03-12 | Watch — onTabChange in question-tabs.tsx; suggestion only, first occurrence |
| `vi.stubGlobal` without `vi.unstubAllGlobals` teardown in test | 1 | 2026-03-12 | Watch — use-quiz-navigation.test.ts; suggestion only, first occurrence |
| E2E test clicks UI without waiting for React state flush (race condition) | 1 | 2026-03-12 | Watch — quiz-flow.spec.ts + progress.spec.ts; fixed with progress-bar DOM gate |
| Broad E2E selector without accessible name / overly loose text match | 1 | 2026-03-12 | Watch — quiz-flow.spec.ts; fixed by scoping getByText and getByRole with name |
| Missing route entry in docs/plan.md route tree after new page added | 1 | 2026-03-12 | Watch — /app/quiz/report missing; fixed by doc-updater in same cycle |
| Concurrent session mutation without row-level lock (FOR UPDATE) | 1 | 2026-03-12 | Watch — batch_submit_quiz RPC; fixed in fe12342 with FOR UPDATE on session row |
| Partial-submission not rejected at RPC level | 1 | 2026-03-12 | Watch — batch_submit_quiz RPC; fixed in fe12342 with answer count mismatch guard |
| Import from Next.js internal module path instead of public API | 1 | 2026-03-12 | Watch — quiz-submit.ts AppRouterInstance; fixed in b312922 with ReturnType<typeof useRouter> |
| useEffect data fetching in client component (not hydration guard) | 3 | 2026-03-13 | RULE EXISTS (code-style.md Section 6) — 3rd occurrence: statistics-tab.tsx extracted to hook in 6722e97; rule exists, compliance gap |
| LANGUAGE sql instead of plpgsql for SECURITY DEFINER RPC | 1 | 2026-03-12 | Watch — Sprint 3 analytics RPCs (845923b); fixed migration 014 (86c8da4); single root introduction; plpgsql required for RAISE EXCEPTION; if second introduction occurs, add to security.md |
| ?? [] fallback applied after an explicit error guard (silent data loss path) | 1 | 2026-03-12 | Watch — subjects ?? [] in statistics-tab.tsx after null/error guard (845923b); fixed in 86c8da4; data is already known bad at that point, fallback hides the gap |
| Server Action shipped without Zod input validation | 1 | 2026-03-12 | Watch — fetch-stats.ts Server Action (845923b); fixed in 86c8da4; rule exists (security.md rule 4); compliance gap, not rule gap |
| RPC missing identity guard (auth.uid() = p_student_id check) | 1 | 2026-03-12 | Watch — Sprint 3 analytics RPCs (845923b); fixed migration 015 (7b824c2); security.md rule 7 covers null check only — does NOT require identity comparison; gap in rule text; clarify rule 7 on second occurrence |
| Partial fix applied to sibling file group (cross-cutting concern) | 1 | 2026-03-12 | Watch — auth error destructuring applied to 2 of 8 query files (2190dd5); remaining 6 fixed in follow-up commits (3a0d1e6, 78cb130); cost: 3 extra commits; when a fix is a cross-cutting pattern across a file family, all siblings must be fixed in the same commit |
| Auth error from getUser() not destructured in query file | 1 | 2026-03-12 | Watch — 7 of 8 query files under apps/web/lib/queries/ missing authError destructuring (2190dd5 → 3a0d1e6 → 78cb130); distinct from mutation error pattern (that is about .insert/.update/.delete); first occurrence as a named pattern |
| Auth error from getUser() swallowed without logging | 1 | 2026-03-12 | Watch — quiz-report.ts (78cb130); auth failure path returned early with no console.error; first occurrence; silent auth failure is harder to diagnose than silent mutation failure |
| Raw Supabase error message leaked to student UI | 1 | 2026-03-12 | Watch — load-session-questions.ts (78cb130); error.message from Supabase returned directly to student-facing caller; first occurrence; internal error strings must not be exposed to UI — return a generic message or error code |
| Unconditional setState in render body (spurious re-renders) | 1 | 2026-03-13 | Watch — statistics-tab.tsx (53efbdd); `setIsLoading(false)` called unconditionally in a render-path reset block, causing a state update on every render when isLoading was already false; fixed with `if (isLoading) setIsLoading(false)` guard in b555b50; first occurrence |
| useTransition + manual loading state hybrid fragility | 2 | 2026-03-13 | RULE CANDIDATE — statistics-tab.tsx (53efbdd, f0f8d0e); semantic-reviewer flagged this suggestion twice across two consecutive commits: isPending from useTransition and manual isLoading state tracked in parallel can both be false simultaneously during a question-switch mid-fetch, briefly showing the idle "Load Statistics" button while a fetch is still in-flight; generation counter mitigates stale data but does not close the UI-state race; suggestion-level only (not fixed); second occurrence reached — propose rule clarification in code-style.md when next commit arrives in this component's area; NOT flagged in 8863926 (pure JSX presenter refactor, no state logic touched) — no further action this cycle |
| Silent numeric fallback without observability logging | 2 | 2026-03-13 | RULE CANDIDATE — first: analytics.ts (53efbdd); `boundParam` silently clamped NaN/±Infinity without console.warn; suggestion-level; second: reports.ts (33c1fa8); `answeredCount` fell back to 0 for completed sessions with no answer rows with no console.warn — fixed in d06c25b; both share same root cause: a fallback that produces a valid-looking result with no server-side signal; the fix pattern is always a console.warn before the fallback value is returned; applies to any numeric computation that falls back to 0 or a minimum when the source data is empty/malformed |
| test-writer produces TS2532 (unchecked array index) errors | 2 | 2026-03-13 | RULE CANDIDATE — test-writer pattern memory should be updated with a note to always use optional chaining (`arr?.[i]`) when accessing array elements in generated test code; first seen in an earlier cycle (test fixture access), second occurrence confirmed in 99c67d2 where a `formatActivityData` test accessed an array index without `?.` and triggered TS2532; the error was caught and fixed before commit, so no broken test reached git; fix is optional chaining or a non-null assertion with a preceding length check; NOT triggered in 8863926 (test-only edits were a beforeEach reset and a rename — no new index access generated) — gate held |
| Shared hoisted mock capture without beforeEach reset | 1 | 2026-03-13 | Watch — activity-chart.test.tsx (8863926); capturedBarChartData shared across tests without reset allowed cross-test contamination; fixed with beforeEach reset; first occurrence |
| Direct SELECT from `questions` bypassing RPC (correct-answer exposure) | 2 | 2026-03-13 | RULE EXISTS (security.md rule 1, CLAUDE.md) — 2nd occurrence: checkAnswer in feat/post-sprint-3-polish directly queried questions table exposing `correct` flag; fixed in f6ba7a0 with check_quiz_answer RPC; rule is clear, compliance gap at authoring time |
| ON CONFLICT clause with no supporting UNIQUE constraint (dead code) | 1 | 2026-03-13 | Watch — student_responses (a09c6be); ON CONFLICT on (session_id, question_id) silently ignored because UNIQUE constraint was never created; fixed by adding UNIQUE constraint in migration; first occurrence |
| TOCTOU race on count-gated INSERT (read-then-write without lock) | 1 | 2026-03-13 | Watch — draft count check before inserting quiz_draft (feat/post-sprint-3-polish); concurrent requests could both pass the count check; fixed with DB trigger enforcing limit at DB level; first occurrence |
| Query missing student_id scope (returns wrong student's data) | 1 | 2026-03-13 | Watch — getFilteredCount fetched student_responses without WHERE student_id = auth.uid() (feat/post-sprint-3-polish); fixed by scoping query; first occurrence; distinct from RPC identity-guard pattern (that is SECURITY DEFINER param mismatch — this is a plain query missing a filter clause) |
| UI event handler missing re-entry guard (double-fire on fast interaction) | 1 | 2026-03-13 | Watch — handleSelectAnswer had no guard preventing a second async call while first was in-flight (feat/post-sprint-3-polish); fixed with isSubmitting ref check; first occurrence |
| Server Action file exceeding 100-line limit after Biome auto-format | 1 | 2026-03-13 | Watch — draft.ts was 166 lines, split to 114+37 (6d274fa); the 114-line file still exceeds the 100-line Server Action limit; root cause: Biome expanded compact code from 97→114 lines during pre-commit format pass; authoring-time count ≠ post-format count; first occurrence of this specific mechanism (Biome expansion pushing over limit) |
| Biome auto-format expanding compact code past file-size limit | 1 | 2026-03-13 | Watch — draft.ts written at ~97 lines, Biome format expanded to 114 lines on pre-commit (6d274fa); the 100-line Server Action limit check must be done against post-format line count, not authoring-time count; first occurrence |
| Async fetch in useEffect without stale-result cancellation flag | 1 | 2026-03-13 | Watch — useEffect in draft.ts initiated fetch without cancelled flag; if the component unmounted or deps changed before the fetch resolved, setState was called on stale/unmounted context; fixed with cancelled flag pattern in fe4ffff; distinct from "useEffect data fetching in client component" (that is about banned server-action fetching — this is a permitted client fetch missing a cleanup guard); first occurrence |
| UPDATE returning zero rows treated as success (silent no-op) | 1 | 2026-03-13 | Watch — draft update in 6d274fa returned no error but updated 0 rows when draft ID did not match student ownership; caller received success response for a no-op write; fix: check rowCount / affected rows after UPDATE before returning success; distinct from "Supabase mutation result not destructured" (that is about missing error destructuring — this is about a successful query that silently did nothing); first occurrence |
| Error path in existing function untested (count-error branch) | 2 | 2026-03-13 | RULE CANDIDATE — count-error path in draft.ts had no test coverage (first occurrence, 2026-03-13 cycle 1); users query error path in draft.ts also untested (second occurrence, d06c25b cycle); both caught post-commit by test-writer; distinct from "new file without test" — this is an existing tested file with an uncovered error branch; pattern: when a new error-return path is added to an existing function (e.g., adding a second query with its own error check), the test file is not updated to cover the new branch |
| Async cleanup path untestable in jsdom (cancelled flag branch) | 1 | 2026-03-13 | Watch — test-writer noted that the cancelled flag cleanup path (setState skipped after unmount) is not testable in jsdom because act() flushes effects synchronously before assertions can observe the cancelled state; analogous to the pre-hydration jsdom limitation; first occurrence; do not write tests for this branch — document the constraint in code-style.md jsdom section if it recurs |
| Stale closure introduced by hook split (scalar captured in closure vs ref) | 1 | 2026-03-13 | Watch — when use-quiz-state was split in 34a9352 to fix the 80-line violation, currentIndex was captured as a scalar in a closure in handleSave instead of being accessed via useRef; fixed in df5d354; the hook split itself introduced the bug; pattern: any value read inside a callback that is defined outside a React.useCallback/useMemo with that value in its deps array is at risk of being stale; when splitting a hook, audit all callbacks in the extracted portion for captured scalar state; first occurrence |
| SQL string comparison instead of ::uuid cast in duplicate check | 1 | 2026-03-13 | Watch — batch_submit_quiz duplicate-answer check compared option IDs as text rather than casting to ::uuid, which can cause case-sensitivity and format-variation failures; fixed in 34a9352; first occurrence |
| Type cast bypassing runtime validation (`as unknown as T` hiding missing guard) | 2 | 2026-03-13 | RULE ADDED (22c3d5e) — first: batch_submit_quiz malformed config cast (306f44a); second: check-answer.ts + fetch-explanation.ts (a0d9973); rule added to code-style.md Section 5 + .coderabbit.yaml synced; 274821b applied the rule correctly via isCheckAnswerRpcResult type guard |
| New hook file extracted without shipping tests in the same commit | 4 | 2026-03-13 | RULE EXISTS (code-style.md Section 7) — use-answer-handler.ts was created in 306f44a without a test file; 12 tests were written in a0d9973 (follow-up commit); pattern: hook extractions always trigger a test gap that requires a post-commit fill; fourth recurrence confirms the compliance gap is structural |
| Imperative ref clear in catch block leaving re-entry window | 1 | 2026-03-13 | Watch — use-answer-handler.ts (306f44a): lockedRef.current.delete() in catch block cleared the lock before React state (answers) had settled, creating a brief window where a second call could enter; fixed in a0d9973 with useEffect drain keyed on answers; then partially reverted in 5b2864f (synchronous clear restored for immediate retryability, useEffect kept as safety drain); first occurrence of this specific async-lock re-entry window pattern |
| Derived value correct by coincidence (index used as count proxy) | 2 | 2026-03-13 | RULE CANDIDATE — first: SQL score aggregation over full table (not current batch) in batch_submit_quiz (f53eccf), where position-in-array was used as a proxy for "answered"; second: answeredCount derived as currentIndex + 1 in use-session-state.ts (675104e) — correct only because index is incremented at the same moment an answer is submitted, not because it semantically tracks "answers given"; fixed in 4798fdb with dedicated useState counter incremented in handleSubmit; both share root cause: a value that co-varies with the desired metric under normal conditions but diverges on edge cases (non-linear navigation, partial completion, session restore); propose note in code-style.md or agent memory: when a metric (count, score, progress) needs to be tracked, use a dedicated state variable incremented at the domain event, not a proxy derived from a structural position |
| Unbounded numeric regex permitting int overflow (SQL input validation) | 1 | 2026-03-13 | Watch — batch_submit_quiz RPC (274821b): `^\d+$` matched response_time_ms without an upper bound, permitting integer overflow when cast to INT; fixed in 34c9b36 with `^\d{1,10}$` (10 digits caps at 9,999,999,999, safely below INT_MAX); first occurrence; applies to any SQL regex that validates before casting to a bounded numeric type — the regex digit count must be bounded to match the target type's range |
| Case-sensitive UUID/text dedup in SQL (lower() missing) | 1 | 2026-03-13 | Watch — batch_submit_quiz duplicate-answer check (274821b): dedup compared `e->>'question_id'` text values without lowercasing; fixed in 34c9b36 with `lower(e->>'question_id')`; note: UUID format from standard generators is lowercase, so this is a defense-in-depth fix rather than a known live bug; first occurrence; distinct from "SQL string comparison instead of ::uuid cast" (that is about cast vs. text — this is about case normalisation before text comparison) |
| ARIA tab role missing on button-based tab UI | 1 | 2026-03-13 | Watch — QuizTabs (46113bf): buttons used as tabs lack role="tab", aria-selected, and enclosing role="tablist"; pre-existing gap, not introduced by the TabButton extraction; flagged by semantic-reviewer as a suggestion; if a second component is flagged for missing semantic ARIA tab attributes, add a note to code-style.md Section 2 (component rules) |

## Lessons Learned

### 2026-03-11 — Initial session
- **Root cause of pushed broken code:** Type-check and tests were in pre-push (too late), not pre-commit. Pre-push had slow security-auditor that timed out, forcing `--no-verify`. All quality gates collapsed.
- **Fix:** Moved type-check + tests to pre-commit. Pre-push now only does security + audit.
- **Pattern:** When test fixtures don't match updated types, TS catches it but only if type-check runs early enough (pre-commit, not pre-push).
- **Pattern:** External hooks (Lefthook post-commit) that Claude can't see are useless. All agent output must flow back to the main session.

### 2026-03-11 — Partial doc fix pattern
- **Context:** Commit c756141 (learner agent + coderabbit) updated `docs/decisions.md` with Decision 20 (post-commit workflow), but left `docs/plan.md` stale (old pipeline diagram, missing learner/coderabbit agents).
- **Result:** Doc-updater flagged the gap in the next cycle (33eb2bb). Plan.md got fixed in a follow-up commit.
- **Pattern:** Agent findings (doc gaps, code style, tests) must be **fully acted on in the same commit**. Partial fixes = extra commits wasted and risk of incomplete state.
- **Lesson:** When doc-updater flags stale files, audit all related docs together. Don't update decision tree without updating plan + CLAUDE.md. Single commit per logical unit of work.

### 2026-03-12 — Sprint 2 quiz overhaul fix cycle (commits f53eccf, post-commit round)

**Code reviewer:** clean pass. One watch item — `use-quiz-state.ts` is at 100 lines against an 80-line hook limit. First occurrence; no rule change. File is complex state + side effects; if it grows further, extract into sub-hooks.

**Semantic reviewer — 3 findings, all fixed in f53eccf:**

1. **Score scoping in `batch_submit_quiz` RPC** — The score query counted ALL `quiz_session_answers` rows for the session rather than only the rows just inserted. Correct fix: scope to `WHERE question_id = ANY(v_submitted_question_ids)`. This is a first occurrence of the "aggregate from full table, not current operation's rows" anti-pattern. Watch for it whenever a batch RPC computes a derived metric (score, count, average) after inserting rows.

2. **Positional index pairing instead of Map lookup** — `updateFsrsCards` in `batch-submit.ts` paired `answers[i]` with `results[i]` by index, relying on the RPC preserving array order. Correct fix: build a `Map<questionId, isCorrect>` from results and look up by ID. First occurrence. Watch for any future array-zip patterns where the two arrays come from different sources (client input vs. RPC output).

3. **Empty-array guard at SQL level** — `batch_submit_quiz` RPC did not guard against an empty `p_answers` input at the SQL layer. Application layer validated, but SQL should not assume valid input. First occurrence. Watch for new RPCs that iterate over `jsonb_array_elements` without a length guard.

**Doc updater:** `database.md`, `decisions.md`, `plan.md` all updated with batch RPC docs in the same cycle. Clean — no partial-doc-fix pattern recurrence.

**Test writer:** `quiz-submit.ts` (hook-level submit orchestrator) had no test file. First occurrence of a new non-trivial hook shipping without tests. 11 tests written. Watch for other hook files in `_hooks/` that may be similarly uncovered. Total test count: 490.

**Actions taken:** All findings were single occurrences — logged and watched, no rule changes proposed. No false positives detected.

---

### 2026-03-12 — Server client fix + test coverage (commits 2b10602, 45cccd2)

**Code reviewer:** clean — 0 blocking, 0 warnings.

**Semantic reviewer:** 0 critical, 0 issues. 1 suggestion: bare `catch {}` in `packages/db/src/server.ts` could be narrowed to a specific error type (e.g., check `error.message` for the known Next.js read-only cookie string) so unexpected errors are not silently swallowed. First occurrence — logged and watched. 3 good patterns noted (env-var guard, cookie adapter, try/catch boundary explanation in comment).

**Doc updater:** no changes needed — fix was internal to an existing module, no schema or API surface change.

**Test writer:** wrote 7 tests in `packages/db/src/server.test.ts` covering env-var guards, cookie adapter wiring, and the read-only-context try/catch fix. All 7 passing. Initial version had a top-level await problem — the test file called `await import('./server.js')` at module scope, which is not supported under node16 module resolution (used in `packages/db`). Fixed by wrapping in an async helper function `getModule()` called inside each test. This is a first occurrence of this pattern.

**Actions taken:**
- Logged `top-level await in node16 package test file` as a new watch item (first occurrence — no rule change yet).
- Logged `bare catch {} without error-type narrowing` as a new watch item (first occurrence — no rule change yet).
- Both items need a second occurrence across different commits before a rule change is warranted.

**Positive signal:** The semantic reviewer's suggestion about bare catches is aligned with existing TypeScript discipline (no `any`, explicit narrowing). If this recurs, the natural fix is a rule addition to `code-style.md` Section 5 or a note in the test-writer memory about the dynamic import pattern for node16 packages.

---

### 2026-03-11 — CI/Vercel build failures (commit 2ac3286)
- **Root cause:** Turbo caching + monorepo package boundary issues masked errors locally that surfaced in CI.
- **Pattern 1 — Integration tests in CI:** `packages/db/vitest.config.ts` runs all tests by default in CI/Vercel. Integration tests that require live DB services (Supabase) fail in CI. Solution: exclude integration tests from default `pnpm test` via glob `!**/*.integration.test.ts` in vitest config, or move to separate config. Locally, devs still run them with explicit flag.
- **Pattern 2 — Auto-generated files in biome ignore:** Next.js generates `next-env.d.ts` dynamically. This file should be in `.biomeignore` (or `.gitignore` equivalent) to prevent biome from formatting it. Prevents spurious "changed" diffs in CI.
- **Pattern 3 — E2E helpers as devDeps:** E2E test helpers (e.g., `apps/web/e2e/helpers.ts`) may import packages not in the app's direct deps (e.g., `@supabase/supabase-js`). In a monorepo, packages should be declared explicitly as devDeps in the package that imports them — not assumed to exist via transitive deps. Turbo caching hides the gap locally.
- **Pattern 4 — Turbo cache masking type errors:** TS type-check passes locally (Turbo cache hit) but fails in CI (fresh install). Root cause: tsconfig path resolution or package versioning differs. Solution: verify `pnpm check-types` (tsc --noEmit) passes in clean environment before pushing. Consider adding explicit `pnpm install --frozen-lockfile` + `pnpm check-types` to CI as separate step before `pnpm build`.
- **Lesson:** In Turborepo + monorepo, always assume CI has a clean state. Test locally with `pnpm install --frozen-lockfile`, `pnpm check-types`, `pnpm build` before commit. Cache hits are not a sign of success.

---

### 2026-03-12 — Sprint 2 quiz overhaul round 2 (commits 9d9e898, a269284, 090e1e7)

**Code reviewer:** 2 BLOCKING findings, both resolved before the cycle closed.
- `quiz-config-form.tsx` at 200 lines (limit: 150) — fixed by extracting `useQuizConfig` hook in a269284.
- `use-quiz-state.ts` at 102 lines (limit: 80) — fixed in a269284 by compressing and extracting `clampIndex` utility.
- 2 acceptable warnings remain: hooks at 91 and 103 lines. Both are within the documented Server Action orchestrator boundary (30–35 lines) and the `useQuizConfig` hook is new — 103 lines is a first post-refactor count. Watch these in the next cycle.

**Semantic reviewer:** 3 ISSUEs found and fixed across the three commits.

1. **`finally` clears loading state during navigation (9d9e898 → fixed a269284):** Using `finally` to call `setLoading(false)` when the success branch calls `router.push()` + `return` re-enables the submit button while navigation is in-flight. Fixed by moving `setLoading(false)` to the catch-only branch. Pattern: never clear a loading gate in `finally` if the success path navigates away.

2. **Silent discard of failed user-triggered operation (9d9e898 → partial fix → 090e1e7):** `ResumeDraftBanner` showed no error to the user when `deleteDraft()` failed. Fixed in two steps: a269284 added UI error state in the banner handler, 090e1e7 fixed `deleteDraft` itself to check the Supabase `{ error }` response and return `{ success: false }` instead of silently returning `{ success: true }`. Root cause: Supabase mutations return errors in `result.error`, they do not throw — so `await supabase.from(...).delete()` without destructuring silently drops the error. This pattern appeared twice across two commits (UI layer then DB layer), meeting the 2+ threshold.

3. **`useNavigationGuard` still active after successful submit (9d9e898 → fixed a269284):** Guard condition `answers.size > 0` without a post-submit clear left a brief double-submit window. Fixed by adding a `submitted` ref checked before the guard fires. Pattern: navigation guards need an explicit "submitted" signal, not just an implicit state check.

**Doc updater:** `database.md` updated with RPC deprecation note. No partial-doc-fix pattern.

**Test writer:** 22 tests across 6 files + 2 new test files (clamp-index, use-quiz-config). This is the second cycle in a row where new hook/utility files shipped without test files. The `useQuizConfig` hook and `clampIndex` utility (both created in the same sprint) had no tests until the test-writer wrote them post-commit. This meets the 2+ threshold for a rule addition.

**Rule changes proposed (2+ occurrences):**

1. **Hook size overflow pattern (count 2):** `use-quiz-state.ts` exceeded 80 lines across two consecutive commit cycles (first at 100 lines, then 102). The correct fix each time was to extract a utility function (clampIndex) or split state into a sub-hook. No rule change needed — the rule already exists. What's missing is a proactive check: add a note to code-reviewer memory that hooks at 70+ lines are a WARNING-level watch item (pre-violation signal), not just at 80+.

2. **Supabase mutation error silently dropped (count 2):** `deleteDraft` returned `{ success: true }` even when the Supabase delete returned `{ error }`. Same root cause pattern as the batch-submit partial failure issue from the prior cycle (where the DB layer silently succeeded but state was wrong). Rule addition warranted: all Supabase `.insert()`, `.update()`, `.delete()`, `.upsert()` calls must destructure `{ error }` from the return value and handle it explicitly. Proposed addition to `code-style.md` Section 5 (TypeScript Rules).

3. **New hook/utility file shipped without tests (count 2):** `quiz-submit.ts` (prior cycle) and `useQuizConfig` + `clampIndex` (this cycle) all shipped without test files. Rule addition warranted: add to `code-style.md` Section 7 (Testing Rules) that any new file in `_hooks/` or `lib/` must have a co-located `.test.ts` file in the same commit.

**False positives:** none detected.

**Positive signals:**
- Auth-before-parse pattern holds across all 3 commits — no new violations.
- FSRS best-effort try/catch pattern is consistent across all mutation paths.
- Doc updates were complete in the same cycle (no partial-doc-fix recurrence).

---

### 2026-03-12 — E2E test updates for deferred-write quiz flow (commits 9b624ff, 7f7eed8)

**Code reviewer:** clean on both commits — 0 blocking, 0 warnings. (Changes were test files only; relaxed line limits apply.)

**Semantic reviewer:** 1 ISSUE + 2 SUGGESTIONS. All fixed before cycle closed.

1. **ISSUE — Race condition between React setState flush and E2E click (9b624ff → fixed 7f7eed8):** After the last answer was submitted, the test immediately called `page.getByRole('button', { name: 'Finish Test' }).click()`. The progress bar reflects accumulated React state, and if `setState` hadn't flushed yet the button click could fire before the UI was ready, producing a flaky test. Fix: wait for `[data-testid="progress-bar"]` to have `style` matching `/100%/` before clicking Finish Test. This is the **first occurrence** of the pattern "E2E test interacts with React state-driven UI without waiting for the DOM to reflect the state change." Log and watch.

2. **SUGGESTION — Overly broad `getByText(/\d+%/)` selector:** The original `getByText('%')` was a substring match that could hit any element containing `%`. Changed to `getByText(/\d+%/)` to scope to a score-like string. First occurrence.

3. **SUGGESTION — Unscoped dialog selector:** `page.getByRole('dialog')` without a name could match any open dialog on the page. Changed to `page.getByRole('dialog', { name: 'Finish quiz' })`. First occurrence.

**Doc updater:** found missing `/app/quiz/report` route in `docs/plan.md` route tree. Fixed in the same cycle.

**Test writer:** no gaps — 605 tests passing, no new source files introduced.

**Actions taken:**
- Frequency table: "E2E race condition on React state flush" added as new watch item (count 1). First occurrence — no rule change.
- Frequency table: "broad E2E selector without accessible name" added as new watch item (count 1). First occurrence — no rule change.
- Frequency table: "missing route in docs/plan.md route tree" added as new watch item (count 1). First occurrence — no rule change.
- No rule changes proposed — all patterns are single occurrences.

**False positives:** none detected.

**Positive signals:**
- Code reviewer was clean on both commits — E2E test files correctly benefit from relaxed line limits.
- The progress-bar flush gate fix (7f7eed8) is a clean, minimal change — single `await expect` assertion before the click. Good pattern for future E2E work against deferred-write flows.
- Doc-updater caught the missing route entry immediately and the fix was applied in the same cycle, consistent with the no-partial-doc-fix discipline.

---

### 2026-03-12 — CodeRabbit PR #33 fixes + partial-submission guard (commits b312922, fe12342)

**Code reviewer:** clean — 0 blocking, 0 warnings. All production changes in these commits were single-line targeted fixes or SQL-level additions.

**Semantic reviewer:** 1 ISSUE + 2 suggestions. ISSUE fixed in fe12342 before cycle closed.

1. **ISSUE — Partial-submission guard missing in `batch_submit_quiz` RPC (b312922 → fixed fe12342):** The RPC accepted any non-empty answer array, including partial submissions where `jsonb_array_length(p_answers) < total_questions`. Fixed by fetching `qs.total_questions` into `v_total` in the session-lock query and adding `IF jsonb_array_length(p_answers) != v_total THEN RAISE EXCEPTION`. Additionally, a `FOR UPDATE` row lock was added to the session SELECT to prevent concurrent submissions. Two distinct sub-patterns here: (a) partial answer sets not rejected — first occurrence, logged as new watch item. (b) concurrent session mutation without row lock — first occurrence, logged as new watch item.

    Secondary note: the prior cycle's score-scoping fix (f53eccf scoped count to `WHERE question_id = ANY(v_question_ids)`) was itself revised in fe12342. Now that `v_total` comes from `quiz_sessions.total_questions` (authoritative) and the partial-submission guard guarantees all questions are answered, scoping the count to the inserted batch IDs was redundant. The count query was simplified back to full session scope. This is not a new anti-pattern — it's a correct second-order consequence of the partial-submission guard.

2. **SUGGESTION — Type alias `AppRouterInstance` imported from internal Next.js path (b312922):** `quiz-submit.ts` imported `AppRouterInstance` from `next/dist/shared/lib/app-router-context.shared-runtime` — an internal module path not part of Next.js's public API. Fixed by deriving the type as `ReturnType<typeof useRouter>` from `next/navigation`. First occurrence — logged and watched. If it recurs, warrants a note in code-style.md about importing from `next/dist/` internal paths.

3. **SUGGESTION — Count state not reset on subject switch (b312922):** Component-level count display could show stale counts when the user switches between subjects without a full remount. This was noted as protected at server (data is re-fetched server-side on navigation), so the concern applies only to client-side tab switching without navigation. First occurrence — logged and watched.

**Doc updater:** `docs/database.md` updated with RPC changes (FOR UPDATE note, partial-submission guard, revised score-calculation rationale). Applied in same cycle — no partial-doc-fix pattern.

**Test writer:** 5 tests added — `resume-draft-banner.test.tsx` covering the catch/finally restructure (error branch, setDiscarding reset in finally, setVisible only on success, error cleared on retry) and the clamped-label display. All passing. No new hook/utility files shipped without tests in this cycle.

**Actions taken:**
- Frequency table: added "Concurrent session mutation without row-level lock" as new watch item (count 1).
- Frequency table: added "Partial-submission not rejected at RPC level" as new watch item (count 1).
- Frequency table: added "Import from Next.js internal module path" as new watch item (count 1).
- No rule changes proposed — all three are first occurrences.

**False positives:** none detected.

**Positive signals:**
- "New hook without test" pattern did NOT recur in this cycle — no new hook/utility files shipped without tests. First cycle since 9f5a6cc where the rule was followed at write time.
- "Supabase mutation error silently dropped" rule (added 9f5a6cc) held for a second consecutive cycle — no new violations.
- The `finally { setDiscarding(false) }` usage in `resume-draft-banner.tsx` is the correct pattern for this case: the success branch only hides the component (`setVisible(false)`), it does not navigate away. This is distinct from the prior "finally clears loading during navigation" anti-pattern. The distinction matters: `finally` is safe when success does not navigate; unsafe when success calls `router.push()` + `return`.
- Code reviewer clean pass confirms the 70-line hook watch threshold is effective — no hooks drifted over 80 lines in this cycle.

---

### 2026-03-12 — Sprint 2 quiz overhaul round 3 (commits 0176634, 2454c28)

**Code reviewer (0176634):** 1 BLOCKING + 1 WARNING.
- BLOCKING: `use-quiz-navigation.test.ts` missing. `use-quiz-navigation.ts` was a new hook file shipped without a co-located test. This is the **third occurrence** of this pattern. The rule was added to `code-style.md` Section 7 in 9f5a6cc but was not followed at write time. Rule is confirmed necessary; the issue is compliance at authoring time, not rule clarity. Test-writer wrote 16 tests (2454c28 fixed the gap).
- WARNING: `use-quiz-config.ts` at 88/80 lines — hook file over limit. This is the third occurrence of the hook-exceeds-80-lines pattern. The 70-line watch was added to code-reviewer memory in 9f5a6cc but the violation still occurred, suggesting the 70-line early warning is not being acted on proactively.

**Code reviewer (2454c28):** clean — 0 issues. Fix commit closed the BLOCKING finding correctly.

**Semantic reviewer (0176634):** 0 ISSUEs. 2 SUGGESTIONs (first occurrences, no action):
- Zod `.max()` constraint missing on subject/topic string fields in quiz config schema. First occurrence — log and watch. If it recurs on a different schema, warrants a note in code-style.md about string field validation completeness.
- `navigate` closure in `use-quiz-navigation.ts` could capture a stale ref without a comment explaining why it's safe. First occurrence — log and watch.

**Semantic reviewer (2454c28):** 1 SUGGESTION.
- `vi.stubGlobal('window', ...)` in `use-quiz-navigation.test.ts` is not torn down via `vi.unstubAllGlobals()` in `afterEach`, which can leak state to subsequent tests. First occurrence — logged in frequency table as a new watch item. If it recurs, warrants a note in test-writer memory about global stub teardown.

**Doc updater (0176634):** 2 updates needed — `plan.md` (sprint progress) and `database.md` (subject metadata in quiz_drafts). Both applied in 2454c28. Clean in second cycle.

**Doc updater (2454c28):** clean — docs current.

**Test writer (0176634):** Wrote `use-quiz-navigation.test.ts` (16 tests) and extended 4 existing test files. All tests passing before report.

**Test writer (2454c28):** no gaps — system caught up.

**Actions taken:**
- Frequency table updated: "new hook without test" count 2 → 3, "hook exceeds 80 lines" count 2 → 3, "Supabase mutation not destructured" status updated to RULE ADDED.
- New watch item added: `vi.stubGlobal` without teardown (first occurrence).
- No new rule changes proposed — all active patterns already have rules. Rule compliance is the remaining gap, not rule coverage.

**False positives:** none detected.

**Positive signals:**
- Supabase mutation destructuring rule (added 9f5a6cc) held — no new violations in either commit. First positive signal after rule addition.
- 2454c28 was fully clean on code-reviewer and doc-updater. Fix cycle closed correctly with no secondary issues.
- test-writer's 16-test suite for `use-quiz-navigation.ts` covered all meaningful branches (boundary clamping, visited tracking, answer status, direction guards). High-signal test output.

---

### 2026-03-12 — Sprint 3 analytics cycle (commit db5d8ea)

**Code reviewer round 1:** 1 BLOCKING.
- `statistics-tab.tsx` used `useEffect` to call a Server Action for data fetching — a direct violation of the "no useEffect for data fetching" rule (code-style.md Section 6). Fixed with button-triggered fetch + `useTransition`. This is the **second occurrence** of this pattern (rule already exists; compliance gap confirmed).

**Code reviewer round 2:** clean — 0 issues.

**Semantic reviewer round 1:** 3 ISSUEs.
1. **Missing Zod validation on a Server Action** — input used without `.parse()`. Rule exists (security.md rule 4). First occurrence of non-compliance with this specific rule. Fixed in same cycle.
2. **Supabase mutation errors silently dropped at 5 call sites** — same root cause pattern as prior occurrences (Supabase returns errors in `result.error`, never throws). This is the **third recurrence** of this pattern. The rule exists in code-style.md Section 5. Compliance is the remaining gap — rule clarity is not the issue. Fixed in same cycle.
3. **LANGUAGE sql RPCs should be plpgsql with RAISE EXCEPTION** — Sprint 3 analytics RPCs used `LANGUAGE sql` (which cannot raise exceptions) for SECURITY DEFINER functions that need to call `auth.uid()` and raise on null/identity mismatch. First occurrence — logged and watched. A plpgsql body is required any time an RPC uses `RAISE EXCEPTION` or `IF/THEN` control flow.

**Semantic reviewer round 2:** 2 ISSUEs.
1. **Missing identity guard in RPCs** — RPCs checked `auth.uid() IS NULL` but did not verify `auth.uid() = p_student_id`. A student could call the RPC with another student's ID and it would succeed the null check. First occurrence of this specific sub-pattern. Logged as new watch item. security.md rule 7 covers the null check but does not explicitly require the identity comparison. If this recurs, clarify rule 7 to require both guards.
2. **`subjects ?? []` applied after error guard** — after an explicit `if (error) return { subjects: null }` guard, a downstream consumer applied `subjects ?? []` which turned a known error condition into an empty array. This creates a silent data loss path — the caller proceeds with no subjects rather than surfacing the error. First occurrence — logged and watched. The anti-pattern: never apply `?? []` to a value that was null because of an error (only apply it to values that are null because "no data" is a valid empty state).

**Doc updater:** `docs/database.md` updated with Sprint 3 RPCs + schema additions. `docs/plan.md` updated with sprint progress. Decision 24 added to `docs/decisions.md`. Clean — no partial-doc-fix pattern.

**Test writer:** 39 new tests written across Sprint 3 analytics components and server actions. All passing before report.

**Actions taken:**
- Frequency table: "Supabase mutation result not destructured" count updated to 3. Rule already exists — no change to rule.
- Frequency table: "useEffect data fetching" count updated to 2 (second recurrence). Rule already exists — no change to rule.
- Frequency table: 4 new watch items added (all first occurrences): LANGUAGE sql vs plpgsql, `?? []` after error guard, Server Action without Zod validation, RPC missing identity guard.
- No new rule changes proposed — the two recurring patterns (Supabase error swallowing, useEffect data fetching) already have rules. Recurring violations indicate a compliance gap, not a rule gap.

**False positives:** none detected.

**Positive signals:**
- Code reviewer round 2 was clean — the useEffect/Zod fixes were correct and complete.
- 39 tests written is the largest single-cycle test output to date, covering analytics branch paths comprehensively.
- Doc-updater applied all 3 doc updates (database.md, plan.md, decisions.md) in the same cycle — no partial-doc-fix pattern recurrence.

---

### 2026-03-12 — Sprint 3 analytics full cycle review (commits 845923b → 86c8da4 → 1684618 → 7b824c2 → 385017a)

**Context:** Post-commit review across 5 commits on feat/sprint-3-analytics. Two rounds of agent findings. All issues fixed before the cycle closed.

**Code reviewer — Round 1:** 1 BLOCKING.
- `statistics-tab.tsx` used `useEffect` to call a Server Action — "no useEffect for data fetching" violation (code-style.md Section 6). Fixed with `useTransition` + explicit button trigger. This is the **second occurrence** of this pattern (first was in an earlier Sprint 2 commit). Rule already exists; compliance gap confirmed. Count in frequency table: 2.

**Code reviewer — Round 2:** clean.

**Semantic reviewer — Round 1:** 3 ISSUEs.
1. **Missing Zod validation in `fetch-stats.ts` Server Action** — input used without `.parse()`. Rule exists (security.md rule 4). Fixed in 86c8da4. Count in frequency table: 1. Watch.
2. **Supabase mutation errors silently dropped — 5 call sites** — `question-stats.ts` and `reports.ts`. Same root cause as prior occurrences (Supabase returns errors in `result.error`, never throws). Rule exists (code-style.md Section 5). Fixed in 86c8da4. Frequency table count: 3. Rule compliance is the gap, not rule clarity.
3. **`LANGUAGE sql` RPCs instead of `plpgsql`** — Sprint 3 analytics RPCs used `LANGUAGE sql` (cannot raise exceptions) for SECURITY DEFINER functions that need `auth.uid()` checks and `RAISE EXCEPTION`. Fixed via migration 014 in 86c8da4. Count: 1. Watch. A SECURITY DEFINER RPC that uses `IF/THEN` or `RAISE EXCEPTION` requires `LANGUAGE plpgsql`.

**Semantic reviewer — Round 2:** 2 ISSUEs.
1. **Missing identity guard in RPCs** — RPCs verified `auth.uid() IS NOT NULL` but did not compare `auth.uid() = p_student_id`. A student could pass another student's ID and pass the null check. Fixed via migration 015 in 7b824c2. Count: 1. Watch. `security.md` rule 7 covers null check only; it does not explicitly require the identity comparison. This is a gap in rule text — not a new rule, just an incomplete one. Clarify on second occurrence.
2. **`subjects ?? []` applied after explicit error guard** — `subjects ?? []` was applied downstream after an `if (error) return { subjects: null }` guard, turning a known error state into an empty array and hiding the failure from the caller. Fixed in 86c8da4. Count: 1. Watch. Anti-pattern: never use `?? []` on a value that is null because of an error (reserve `?? []` for values that are null because "no data yet" is a valid empty state).

**Doc updater:** `database.md` updated with Sprint 3 RPCs and migration notes. `plan.md` updated with sprint progress. `decisions.md` updated with Decision 24. All applied in 1684618. No partial-doc-fix pattern.

**Test writer:** 39 new tests written across Sprint 3 analytics components and Server Actions (385017a). All passing. No new hook/utility files shipped without tests in this cycle.

**Actions taken:**
- Frequency table updated: clarified "LANGUAGE sql vs plpgsql" entry with commit references (count still 1, watch).
- Frequency table updated: clarified "RPC missing identity guard" entry with note that security.md rule 7 text gap exists (count 1, watch — clarify rule on second occurrence).
- Frequency table updated: "Server Action without Zod" entry clarified with commit reference (count 1, watch).
- Frequency table updated: "?? [] after error guard" entry clarified with commit reference (count 1, watch).
- No rule changes proposed — all patterns in this cycle are single occurrences. The two recurring patterns (Supabase error swallowing, useEffect data fetching) already have rules; the remaining gap is compliance at authoring time.

**Rule gaps identified (not yet actionable — awaiting second occurrence):**
- `security.md` rule 7 says "raise if null" but is silent on the identity comparison (`auth.uid() = p_student_id`). If any SECURITY DEFINER RPC takes a student ID parameter and this guard is missing again, clarify rule 7 to require: (a) null check, (b) identity comparison when a student ID parameter is accepted.
- `security.md` has no mention of `LANGUAGE plpgsql` vs `LANGUAGE sql` for SECURITY DEFINER RPCs. If a second RPC ships with `LANGUAGE sql` and an `IF/THEN` block, add a note: "SECURITY DEFINER RPCs that use control flow or RAISE EXCEPTION must be written in `plpgsql`, not `sql`."

**False positives:** none detected.

**Positive signals:**
- `startTransition` misuse (`.then()` chain) was caught and fixed to `async/await` in the same cycle — correct pattern enforced.
- Both migration fixes (014 and 015) were applied without introducing new issues — fix commits were clean on code reviewer.
- Doc-updater completed all 3 doc targets in a single commit, no partial-doc-fix recurrence.
- 39 tests is the highest single-cycle output to date; analytics branches are well-covered going forward.

---

### 2026-03-13 — statistics-tab render guard + analytics boundParam tests (commits 53efbdd, b555b50)

**Code reviewer:** clean — 0 blocking, 0 warnings. Watch item noted: `statistics-tab.tsx` at 158 lines. The file was split in a prior cycle but the extraction of `FsrsSection` (53efbdd) brought in new lines. 158 > 150 limit. This is a watch item — no violation reported by code-reviewer (likely test file relaxation or component sub-split occurred), but the production component should be monitored.

**Semantic reviewer (53efbdd):** 1 ISSUE + 2 SUGGESTIONS.

1. **ISSUE — Unconditional `setIsLoading(false)` in render-path reset block:** In `statistics-tab.tsx`, the reset block that runs when `questionId` changes called `setIsLoading(false)` unconditionally. When `isLoading` was already `false`, this triggered a redundant state update, causing a spurious re-render on every `questionId` change. Fixed in b555b50 with a `if (isLoading) setIsLoading(false)` guard. Root cause: the reset block ran in the render body (not in a `useEffect`), so any unconditional `setState` there fires even when the value has not changed. **First occurrence of this specific pattern.** Logged as new watch item.

2. **SUGGESTION — useTransition + manual loading state hybrid fragility:** `statistics-tab.tsx` uses both `isPending` from `useTransition` (for the Server Action call) and a manual `isLoading` boolean state. These two signals can both be `false` simultaneously during a question-switch mid-fetch, briefly showing the "Load Statistics" button while a fetch is still in-flight. The generation counter prevents stale data from appearing, but the UI briefly reverts to the idle state. No fix applied — suggestion-level. **First occurrence.** Logged and watched.

3. **SUGGESTION — Silent `boundParam` fallback for non-finite inputs:** The `boundParam` helper in `analytics.ts` clamps non-finite values (NaN, ±Infinity) to the minimum without a `console.warn`. A caller passing `NaN` gets a valid-looking result with no server-side signal that something unexpected occurred. No fix applied — suggestion-level. **First occurrence.** Logged and watched.

**Semantic reviewer (b555b50):** 4 GOOD patterns noted. No issues or suggestions.

**Doc updater:** no changes needed — fixes were internal to existing components, no schema or API surface change.

**Test writer:** 7 new tests added across 2 files (b555b50).
- `analytics.test.ts`: 5 tests for `boundParam` non-finite inputs (NaN, +Infinity, -Infinity for both `getDailyActivity` and `getSubjectScores`). These directly exercised the silent-fallback suggestion.
- `statistics-tab.test.tsx`: 2 new tests covering (a) FSRS section hidden when `fsrsState` is null, (b) load button reappears immediately when `questionId` changes during an in-flight fetch (verifies the `if (isLoading)` guard is correct and the generation counter discards stale results). Well-targeted.

**Actions taken:**
- Frequency table: 3 new watch items added (all first occurrences): "Unconditional setState in render body", "useTransition + manual loading state hybrid fragility", "Silent boundParam fallback without logging".
- No rule changes proposed — all 3 patterns are first occurrences. Rule changes require 2+ occurrences across different commits.

**False positives:** none detected.

**Positive signals:**
- b555b50 was the fix commit for the ISSUE and it was clean on both semantic reviewer (4 GOOD patterns) and code-reviewer. Fix cycle closed in a single follow-up commit.
- The test for the mid-fetch `questionId` change (statistics-tab test 2) is a high-signal regression test — it locks in the `if (isLoading)` guard behavior and the generation counter discard. Any future regression will be caught immediately.
- The `boundParam` non-finite tests (5 total) are the kind of edge-case coverage that previously would have been missed until production. Test-writer identified and covered them proactively from the suggestion, even though no fix was applied to production code.

---

### 2026-03-13 — CodeRabbit follow-up + formatActivityData tests (commits f0f8d0e, 99c67d2)

**Code reviewer:** clean — 0 blocking, 0 warnings. All changes in f0f8d0e were targeted refactors (function splits, test renames); 99c67d2 was a test-only commit. Both correctly within line limits.

**Semantic reviewer:** 0 critical, 0 issues. 2 suggestions.

1. **SUGGESTION — useTransition + manual isLoading hybrid (f0f8d0e):** The semantic-reviewer flagged the same UI-state race in `statistics-tab.tsx` that was first flagged in 53efbdd. Both `isPending` (from `useTransition`) and `isLoading` (manual state) can briefly be `false` simultaneously during a question-switch mid-fetch, causing the "Load Statistics" button to flicker into view. Suggestion-level — no fix applied. **This is the second occurrence across different commits.** Count in frequency table: 2. Rule candidate status reached. A note in code-style.md (or agent memory) should capture the guidance: prefer a single authoritative loading signal; if using `useTransition`, derive all loading UI from `isPending` alone rather than maintaining a parallel manual flag.

2. **SUGGESTION — `waitFor` on `.not.toBeInTheDocument` delays failure diagnosis (f0f8d0e):** Using `waitFor(() => expect(el).not.toBeInTheDocument())` will poll until the assertion passes — but if the element is never removed, the test hangs until `waitFor`'s timeout (default 1000ms) expires rather than failing immediately. The semantic-reviewer noted the assertion form `expect(el).not.toBeInTheDocument()` outside `waitFor` gives faster failure feedback when the element is expected to be absent from the start. First occurrence — logged and watched.

**Doc updater:** no updates needed. Both commits changed only test/component internals with no schema, API, or routing surface changes.

**Test writer (99c67d2):** 3 new tests added to `activity-chart.test.tsx` (or equivalent) for `formatActivityData`:
- UTC date label formatting (prevents prior regression where local-timezone offset caused label drift)
- Data passthrough (no transformation of non-date fields)
- Multi-day data (ensures array ordering is preserved)

The test-writer generated code containing a TS2532 error — array index access without optional chaining (e.g., `result[0].label` instead of `result[0]?.label`). The error was caught and fixed (with `?.`) before the tests were committed. This is the **second occurrence** of test-writer-generated TS2532 errors across different commits. Count in frequency table: 2. Rule candidate status reached for test-writer memory.

**Actions taken:**
- Frequency table: "useTransition + manual loading state hybrid fragility" count updated 1 → 2. Status: RULE CANDIDATE. No rule change applied yet — suggestion-level finding; propose addition to code-style.md (Section 6 or new sub-section) if it surfaces again or if this component is refactored.
- Frequency table: "test-writer produces TS2532 (unchecked array index)" added as new entry at count 2. Status: RULE CANDIDATE. A note should be added to the test-writer's patterns memory instructing it to use optional chaining (`arr?.[i]`) or a length-gated assertion when accessing array indices in generated test code.
- Frequency table: "waitFor on .not.toBeInTheDocument delays failure diagnosis" added as new watch item (count 1). First occurrence — no rule change.

**Recommended changes (awaiting orchestrator approval before applying):**

1. **test-writer patterns memory** — add a note under the "Common TS compile errors" or equivalent section: when accessing array elements in test assertions, always use optional chaining (`result[0]?.label`) or assert the array length first (`expect(result).toHaveLength(3); result[0].label`). This prevents TS2532 on every generated test that indexes into a result array. The TS2532 pattern has now appeared twice in the test-writer's output — it is a systematic gap in the generation pattern, not a one-off.

2. **code-style.md (Section 6 — Next.js patterns) or new sub-section** — when `useTransition` is used to wrap a Server Action call, derive all loading UI from `isPending` alone. Do not introduce a parallel `isLoading` state unless `useTransition` is insufficient (e.g., multi-step async outside a transition). If both exist, ensure there is no window where both can be `false` while a fetch is in-flight. (Note: this is a SUGGESTION-level pattern only — do not propose this change until a third occurrence or until the existing hybrid is actually causing a user-visible bug.)

**False positives:** none detected.

**Positive signals:**
- Code reviewer clean on both commits — function splits (f0f8d0e) stayed within line limits.
- TS2532 error was caught by the pre-commit hook (type-check) before reaching git. The gate is working correctly. The goal of the test-writer memory update is to prevent the error from being generated in the first place, not to add a new gate.
- The 3 `formatActivityData` tests target the specific UTC regression that was previously a CodeRabbit finding. Proactive regression coverage for a known edge case.

---

### 2026-03-12 — Auth error destructuring cycle (commits 2190dd5, 67b24a6, 3a0d1e6, 78cb130)

**Context:** Four commits to apply and test a single cross-cutting fix — auth error destructuring from `getUser()` — across 7 sibling query files under `apps/web/lib/queries/`. The fix and its tests were correct, but the work was spread across 4 commits instead of 1 because the initial commit only covered 2 of the 8 files.

**Code reviewer:** clean on all 4 commits. The changes were targeted additions (destructure authError, add console.error, add early return, add test branches) with no style violations.

**Doc updater:** clean on all 4 commits. No schema, RPC, or route surface changed.

**Test writer:** found all 7 query files lacked an `authError` branch test. Tests were added across the 4 commits in this cycle alongside each source fix. All passing. No new source files were introduced without tests.

**Semantic reviewer findings:**

1. **ISSUE — Partial application of cross-cutting fix (2190dd5):** The auth error destructuring fix was applied to `analytics.ts` and `review.ts` but the remaining 6 sibling files (`dashboard.ts`, `progress.ts`, `question-stats.ts`, `reports.ts`, `quiz-report.ts`, `load-session-questions.ts`) were missed. Required 2 additional fix commits to close. This is the first occurrence of the meta-pattern: when a fix is a cross-cutting concern across a file family (a shared interface, a shared call site pattern), all siblings must be identified and fixed in the same commit. Cost: 3 extra commits and a second round of post-commit review. First occurrence — logged and watched.

2. **ISSUE — Auth error swallowed without logging in quiz-report.ts (78cb130):** `quiz-report.ts` destructured `authError` but returned early without calling `console.error`. Silent auth failures are harder to diagnose than explicit ones — a missing log leaves no trace in the server output when auth fails. Fixed in 78cb130. First occurrence of this specific sub-pattern (auth error silently discarded, not just not-destructured). Logged separately from the "mutation error silently dropped" pattern because the root cause differs: this is an explicit check that was made incomplete.

3. **ISSUE — Raw Supabase error message leaked to student UI (78cb130):** `load-session-questions.ts` returned `authError.message` directly to the caller (which ultimately surfaces to the student UI). Internal Supabase error strings are not safe to expose to end users — they may leak implementation details. Fixed in 78cb130 with a generic `'Authentication required'` message. First occurrence — logged and watched.

**Actions taken:**
- Frequency table: added 4 new watch items (all first occurrences): "Partial fix applied to sibling file group", "Auth error from getUser() not destructured", "Auth error from getUser() swallowed without logging", "Raw Supabase error message leaked to student UI".
- No rule changes proposed — all 4 patterns are first occurrences.

**Why no rule changes:**
- The partial-sibling-fix pattern (1 occurrence) needs a second occurrence before warranting a rule addition. If it recurs — same root cause, different file family — the correct fix is a rule in `code-style.md` or a note in agent-workflow: "when a fix addresses a shared call-site pattern, grep for all sibling files with the same pattern before committing."
- The auth error destructuring pattern (1 occurrence) is a sibling of the mutation-error-not-destructured rule already in `code-style.md` Section 5. If it recurs in a different query file or a different auth call site, the correct fix is to extend the existing rule to cover `getUser()` auth paths explicitly.
- The raw-error-to-UI pattern (1 occurrence) is a standard defense-in-depth concern. If it recurs, it warrants a note in `security.md` or `code-style.md`: "never return internal Supabase or DB error strings directly to client callers — return a generic message."

**False positives:** none detected.

**Positive signals:**
- Code reviewer was clean on all 4 commits — the fixes were mechanically correct (no style drift introduced while applying the cross-cutting change).
- Test coverage for auth error branches across 7 query files is now complete. The test-writer identified all 7 gaps in one pass, confirming its file-family awareness is working correctly.
- The 3 ISSUES (partial fix, silent log, raw error) were all caught and fixed within the same session — no deferred debt.

---

### 2026-03-13 — CodeRabbit triage cycle 6: ActivityBars extract + test reset (commit 8863926)

**Context:** This is the 6th consecutive CodeRabbit triage cycle on the same PR (feat/sprint-3-analytics). The commit addressed 3 findings from CodeRabbit review 5: extract `ActivityBars` presenter from `ChartBody` to bring the inner function under the 30-line cap, add `beforeEach` reset for a captured mock variable to prevent cross-test state coupling, and rename a test to match the sibling naming pattern.

**Code reviewer:** 0 blocking, 0 warnings. Noted `ActivityBars` at 38 lines — reviewer correctly classified this as acceptable (pure JSX array map with no logic). This is consistent with the existing documented exception for presenter components.

**Semantic reviewer:** 0 critical, 0 issues. 3 GOOD patterns noted: (1) `beforeEach` reset correctly wired to the hoisted capture variable — mock isolation improved; (2) `ActivityBars` extraction preserves the mock wiring for `BarChart` — no phantom test blindspot introduced by the split; (3) test rename to `renders X state` pattern is consistent with sibling tests.

**Doc updater:** no changes needed — refactor was internal to an analytics chart component, no schema, RPC, or route surface changed.

**Test writer:** no new tests needed. This was a pure presenter refactor and test-quality fix — existing tests already covered the logic. The test-writer's judgment was correct.

**Patterns checked this cycle:**

1. **useTransition + manual isLoading hybrid (count 2, RULE CANDIDATE):** Not flagged — the 8863926 commit touched only `activity-chart.tsx` (JSX presenter) and `activity-chart.test.tsx` / `statistics-tab.test.tsx`. No state logic was modified. The pattern has not spread to a new file and has not been flagged a third time. Rule candidate status remains — no rule change applied yet. Will trigger on the next commit that modifies state logic in `statistics-tab.tsx` or a sibling component using the same pattern.

2. **test-writer TS2532 unchecked index (count 2, RULE CANDIDATE):** Not triggered — the test edits were a `beforeEach` block addition and a `describe` rename, neither of which involved new array index access. Gate held.

3. **Function split to stay under 30-line cap:** `ChartBody` was split into `ChartBody` + `ActivityBars` specifically to satisfy the 30-line function rule. This is the rule working as intended. No violation — positive signal.

4. **Cross-test state coupling via shared capture variable (beforeEach fix):** The `capturedBarChartData` variable was shared across tests without reset, allowing a passing test to contaminate the next. Fixed by adding a `beforeEach(() => { capturedBarChartData = null })` (or equivalent reset). First occurrence of this specific pattern (hoisted mock capture not reset between tests). Logged as a new watch item.

**Actions taken:**
- Frequency table: added "Shared hoisted mock capture without beforeEach reset" as new watch item (count 1). First occurrence — no rule change. If it recurs, warrants a note in test-writer patterns memory.
- Updated "useTransition + manual isLoading hybrid" status note — not flagged this cycle, rule candidate status unchanged.
- Updated "test-writer TS2532" status note — not triggered this cycle, gate held.
- No rule changes proposed — no pattern crossed the 2+ threshold for the first time in this cycle.

**Positive signals:**
- **Sixth consecutive CodeRabbit cycle with no new BLOCKING or ISSUE findings.** The defect rate on this PR is trending toward zero as the triage cycles progress.
- **All 4 agents reported clean** — code-reviewer, semantic-reviewer, doc-updater, and test-writer all returned clean in a single pass. This has not happened before in a mid-session cycle on this branch; prior cycles always had at least one warning or suggestion requiring a follow-up commit.
- **The 30-line function rule caught a real structural issue** (`ChartBody` was doing layout + data mapping). The extraction of `ActivityBars` is a genuine improvement, not a mechanical compliance exercise.
- **The beforeEach reset fix** is a sign the test-writer's mock patterns are mature enough that test-quality issues are now being caught by CodeRabbit rather than going undetected in CI. Cross-test coupling via shared capture variables is subtle and easy to miss.

**False positives:** none detected.

---

### 2026-03-13 — feat/post-sprint-3-polish cycle (commits 6722e97, f6ba7a0, a09c6be, bba9800)

**Context:** Post-sprint-3 polish branch. Four agents reviewed 4 commits. Two CRITICALs from semantic-reviewer, both fixed before cycle closed.

**Code reviewer (6722e97):** 2 findings, both fixed in the same commit.
- `statistics-tab.tsx` exceeded 150-line component limit — fixed by extracting `useQuestionStats` hook. This is a **recurring pattern** (component file size overflows have appeared in quiz-config-form.tsx, use-quiz-state.ts, and now statistics-tab.tsx — 3 occurrences total across different file types). The root cause is the same each time: a component accumulates state logic that belongs in a hook.
- `useEffect` for data fetching in statistics-tab.tsx — **third occurrence** of this pattern. Rule exists. Compliance gap at authoring time, not a rule gap.

**Semantic reviewer — 2 CRITICALs + 3 ISSUEs, all fixed:**

1. **CRITICAL — `checkAnswer` directly SELECTed from `questions` table (f6ba7a0):** This is the **second occurrence** of correct-answer exposure via direct table query (first was the original lack of `get_quiz_questions()` RPC use). The fix replaced the direct query with a `check_quiz_answer` RPC. Rule exists in security.md rule 1 and CLAUDE.md. Compliance gap: the function was new code, authored without checking whether a question lookup needs to go through an RPC. This pattern suggests that any new function touching the `questions` table should be treated as a security gate, not just a data access pattern.

2. **CRITICAL — `student_responses` had no UNIQUE constraint; ON CONFLICT was dead code (a09c6be):** `ON CONFLICT ON (session_id, question_id)` was specified in an INSERT statement but the corresponding UNIQUE constraint was never created in the migration. The conflict clause silently had no effect, meaning duplicate rows could be inserted. Fixed by adding UNIQUE constraint via migration. First occurrence of this specific failure mode: a UNIQUE constraint referenced in application code but absent from the schema. Logged as new watch item.

3. **ISSUE — Draft count TOCTOU race:** Count was read, then checked, then INSERT issued — but no lock prevented two concurrent requests from both reading count < limit and both inserting. Fixed with a DB trigger that enforces the limit at write time. First occurrence. DB-level enforcement is the correct fix for count-gated writes — application-layer checks are always racy.

4. **ISSUE — `getFilteredCount` fetched unscoped `student_responses`:** The query returned counts across all students because it was missing a `WHERE student_id = auth.uid()` filter. First occurrence of this specific sub-pattern (query returning another student's data via missing scope clause). Distinct from the RPC identity-guard pattern (which is about SECURITY DEFINER functions accepting a student ID param). Logged separately.

5. **ISSUE — `handleSelectAnswer` had no re-entry guard:** The async handler could fire twice on rapid user interaction (double-tap), initiating two concurrent state transitions. Fixed with an `isSubmitting` ref checked at entry. First occurrence.

**Doc updater:** plan.md, decisions.md, database.md all updated in same cycle (bba9800 / 8be4dfd). No partial-doc-fix pattern. Clean.

**Test writer (bba9800):** 4 new test files, 56 tests total written. One test file initially had wrong fixture types (SubjectOption shape mismatch between what was constructed in the fixture and the actual exported TypeScript type). This is the **second occurrence** of a test fixture shape mismatch (first: missing `short` prop on 2026-03-11). Both caught by pre-commit type-check before reaching git. Frequency table updated: count 1 → 2, status RULE CANDIDATE.

**Actions taken:**
- Frequency table: "useEffect data fetching" count 2 → 3. Status: RULE EXISTS, compliance gap. No change.
- Frequency table: "Direct SELECT from questions bypassing RPC" count updated to 2. Status: RULE EXISTS, compliance gap — security.md rule 1, CLAUDE.md. No change to rules.
- Frequency table: "Test fixture shape mismatch" count updated from 1 (was "Missing short prop") to 2. Status: RULE CANDIDATE.
- Frequency table: 5 new watch items added (all first occurrences): ON CONFLICT without UNIQUE constraint, TOCTOU draft count race, query missing student_id scope, UI handler missing re-entry guard.

**Recommended changes (awaiting orchestrator approval before applying):**

1. **test-writer patterns memory** — add a note: always construct test fixtures by importing and satisfying the exported TypeScript type directly (e.g., `const fixture: SubjectOption = { ... }`), not by constructing a plain object and hoping the shape matches. The type annotation forces a compile-time check. This is distinct from the TS2532 array-index rule already pending — this is about fixture object construction, not array access. Two occurrences of fixture shape mismatch across different sessions warrant this addition.

**Rule gaps identified (not yet actionable — awaiting second occurrence):**
- Any new function that queries the `questions` table should require a code review checkpoint that it uses `get_quiz_questions()` or a designated RPC rather than a direct SELECT. The correct gate for this is the security-auditor agent (already checks for `SELECT *` violations) plus a note in `docs/security.md` or `security.md` that even non-`SELECT *` queries against `questions` exposing `correct`/`correct_explanation` fields are violations. If this recurs a third time, extend security.md rule 1 explicitly.
- The TOCTOU pattern (read count → check → insert) is a known race when implemented in application code. If it recurs on a different resource, add a rule note: "count-gated inserts must enforce the limit via a DB trigger or a row-level lock, not an application-layer count check."

**False positives:** none detected.

**Positive signals:**
- Both CRITICALs were caught by the semantic-reviewer post-commit (not discovered in production). The security gate is working at the right layer.
- The UNIQUE constraint finding is notable: the bug was fully invisible to lint, type-check, and unit tests. Only semantic review of the migration against the INSERT statement revealed the gap. This validates keeping the semantic reviewer focused on data correctness, not just code style.
- The test-writer's 56-test output covered all five fixed areas. Having test coverage land in the same session as the fixes is the correct pattern.
- Doc-updater updated all three documents in the same cycle — no partial-doc-fix recurrence.

---

### 2026-03-13 — Post-sprint-3-polish fix cycle (commits 7c2d7c5, 890a63b, 6d274fa, fe4ffff)

**Context:** Four commits polishing the feat/post-sprint-3-polish branch. Fixes included splitting `draft.ts` (166 lines → 114+37), stale-fetch race in a useEffect, draft update silent no-op, and wrapping all post-fetch setState calls in a cancellation guard.

**Code reviewer (6d274fa):** 1 BLOCKING watch item.
- `draft.ts` was 166 lines (Server Action limit: 100). Split into a 114-line primary file and a 37-line helper. The 114-line file still exceeds the 100-line limit. The root cause was a two-stage effect: the file was authored near the limit, then Biome auto-format on pre-commit expanded compact code from ~97 to 114 lines (multiline object/function formatting). **First occurrence of Biome expansion pushing a file over limit at commit time.** The authoring-time count is not a reliable pre-commit estimate — Biome's formatter can add 15–20% line count to compact code. Logged as new watch item.

**Semantic reviewer:** 3 findings.

1. **ISSUE — Stale-fetch race in useEffect (fe4ffff):** A `useEffect` that triggered an async fetch did not set a `cancelled` flag. If the component unmounted or the effect re-ran (deps changed) before the fetch resolved, the subsequent `setState` call would execute against an unmounted or stale component context. Fixed in fe4ffff with a `let cancelled = false` flag checked inside the fetch's `.then()` / `catch()` before any setState calls, and a cleanup function that sets `cancelled = true`. This is a distinct pattern from "useEffect data fetching in client component" (that rule bans server-action fetching in useEffect — this is a permitted client fetch with a missing cleanup guard). **First occurrence.** Logged as new watch item.

2. **ISSUE — Draft UPDATE returning zero rows treated as success (6d274fa):** The `updateDraft` Server Action called `.update()`, checked `{ error }`, found no error, and returned `{ success: true }` — but the update matched 0 rows because the draft ID did not belong to the current student. The Supabase client returns `{ error: null, count: 0 }` for a successful-but-no-op UPDATE. Callers received a success response for a write that did nothing. Fixed by checking the row count (`count === 0`) and returning `{ success: false, reason: 'not_found' }`. **First occurrence of this specific sub-pattern** — distinct from "Supabase mutation result not destructured" (that is about missing `{ error }` destructuring — this is about a successful query that silently updated nothing). Logged as new watch item.

3. **ACCEPTED (study mode by design) — `fetchExplanation` session gate:** semantic-reviewer suggested that `fetchExplanation` should not allow calls outside an active session. After review, this path is intentional: the explanation endpoint is used in study mode (reviewing past answers without an active session). Accepted as a design exception. **No action.**

**Test writer:** 2 findings.

1. **Cancelled flag path not testable in jsdom:** The `useEffect` cleanup path — where `setState` is skipped because `cancelled === true` — cannot be tested in jsdom. `act()` in `@testing-library/react` flushes all effects synchronously, so by the time assertions run, the cleanup function has already fired and the effect is no longer observable in its pre-cleanup state. This is an extension of the existing jsdom pre-hydration limitation. **First occurrence for this specific sub-pattern.** Logged as new watch item. Do not write tests for the cancelled flag path — document the constraint in code-style.md Section 7 (jsdom limitations) if this recurs.

2. **Count-error branch untested in existing file:** `draft.ts` had test coverage for the happy path but not for the case where the count query itself returned an error. The error path was reachable code. Test-writer wrote the missing branch test. **First occurrence of this specific sub-pattern** — distinct from "new file without test" (this is an existing tested file with an uncovered error branch). Logged as new watch item.

**Doc updater:** no changes needed — all changes were internal to existing modules, no schema, RPC, or route surface changed.

**Actions taken:**
- Frequency table: 6 new watch items added (all first occurrences): "Server Action file exceeding 100-line limit after Biome auto-format", "Biome auto-format expanding compact code past file-size limit", "Async fetch in useEffect without stale-result cancellation flag", "UPDATE returning zero rows treated as success (silent no-op)", "Error path in existing function untested (count-error branch)", "Async cleanup path untestable in jsdom (cancelled flag branch)".
- No rule changes proposed — all patterns are first occurrences. Rule changes require 2+ occurrences across different commits.

**False positives:**
- `fetchExplanation` session gate flagged by semantic-reviewer — accepted as by-design study mode path. Logged to avoid re-flagging.

**Positive signals:**
- All four commits were scoped correctly — no cross-feature drift, no partial fixes left open.
- The cancellation flag pattern (let cancelled = false + cleanup return) is a standard React/JS idiom for async effect cleanup. Good template for future useEffect-with-fetch patterns in the codebase.
- Splitting `draft.ts` was the correct call even though the primary file (114 lines) still sits over the 100-line limit — the alternative (one 166-line file) was worse. The Biome expansion watch item will prompt a more conservative split threshold next time.

---

### 2026-03-13 — use-quiz-state hook split + batch_submit_quiz SQL hardening (commits 741ae30 → 34a9352 → df5d354)

**Context:** Three-commit fix cycle on feat/post-sprint-3-polish. Commits 741ae30 (validation hardening), 34a9352 (hook split + SQL type cast fix), df5d354 (stale closure fix after split). Three rounds of post-commit review — all agents reported clean on round 3.

**Code reviewer (741ae30):** 1 BLOCKING.
- `use-quiz-state.ts` at 117 lines (hook limit: 80). This is the **fourth occurrence** of the hook-exceeds-80-lines pattern. Fixed in 34a9352 by splitting the hook. Frequency table count updated: 3 → 4. The 70-line watch threshold added in an earlier cycle was not acted on proactively — the file grew 37 lines past the 80-line limit before being caught post-commit. Rule and watch threshold both exist; compliance gap at authoring time persists.

**Code reviewer (34a9352):** clean — hook split brought use-quiz-state.ts under limit.

**Code reviewer (df5d354):** clean — stale closure fix was a targeted single-function change.

**Semantic reviewer (741ae30):** 1 ISSUE + 2 suggestions.

1. **ISSUE — Duplicate-answer check used text comparison instead of ::uuid cast:** In `batch_submit_quiz`, the duplicate-answer detection compared option/question IDs as plain text strings rather than casting to `::uuid`. UUID comparisons as text can fail on case variation or format differences (e.g., uppercase vs lowercase hex). Fixed in 34a9352 by adding `::uuid` casts to the comparison. **First occurrence.** Logged as new watch item.

2. **SUGGESTION — Malformed session config guard:** A guard condition in the session config check was improperly structured (likely a missing parenthesis or operator precedence issue). Fixed in 34a9352. First occurrence — suggestion level, no rule action.

3. **SUGGESTION — Lock ordering comment:** Semantic reviewer recommended adding a comment explaining the order in which row locks are acquired to prevent potential deadlocks if lock order is ever changed. No fix applied (suggestion only). First occurrence — logged for awareness.

**Semantic reviewer (34a9352):** 1 ISSUE.

1. **ISSUE — Stale `currentIndex` in `handleSave` after hook split:** When `use-quiz-state.ts` was split, `handleSave` captured `currentIndex` as a scalar in a closure rather than reading it via a ref. Because React state updates are async, the `currentIndex` value captured at the time `handleSave` was defined could be stale by the time the callback executed. Fixed in df5d354 by accessing `currentIndex` via a `useRef` or via a functional updater pattern. Root cause: the act of splitting the hook introduced a stale closure that did not exist in the monolithic version (where the value and its consumer were in the same closure scope). **First occurrence of the meta-pattern: hook split introducing a stale closure on a formerly-adjacent value.** Logged as new watch item.

**Semantic reviewer (df5d354):** clean — 0 issues, 0 suggestions.

**Doc updater:** database.md updated (batch_submit_quiz duplicate check change noted), plan.md updated (sprint progress), MEMORY.md updated. One minor database.md fix applied in a follow-up commit. No partial-doc-fix pattern.

**Test writer (741ae30):** Added double-click race test for handleSelectAnswer guard (first occurrence of this test pattern). Passing.

**Test writer (34a9352 + df5d354):** Added 6 tests covering handleDiscard and showFinishDialog behavior. All passing.

**Actions taken:**
- Frequency table: "Hook file exceeding 80-line limit" count updated 3 → 4. Status unchanged (RULE EXISTS, compliance gap).
- Frequency table: 2 new watch items added (both first occurrences): "Stale closure introduced by hook split (scalar vs ref)" and "SQL string comparison instead of ::uuid cast in duplicate check".
- No rule changes proposed — both new patterns are first occurrences. The recurring hook-oversizing pattern (count 4) already has a rule and a 70-line watch threshold; the compliance gap is at authoring time, not in rule coverage.

**Rule gaps identified (not yet actionable — awaiting second occurrence):**
- When a hook is split, the developer must audit all callbacks in the extracted portion for captured scalar state values — any `state` variable read inside a `useCallback`/handler that is not in the dependency array (or is in the dependency array but is a primitive) is a stale closure candidate. If this pattern recurs on a different hook split, add a note to code-style.md Section 2 (hooks) or agent-workflow about the split-induced stale closure risk.
- UUID comparisons in SQL should use `::uuid` casts, not plain text comparison. If this recurs in a different migration or RPC, add a note to `docs/security.md` or `docs/database.md`: "always cast UUID parameters and stored values to `::uuid` in comparison expressions."

**False positives:** none detected.

**Positive signals:**
- Round 3 (df5d354) was fully clean — all 4 agents returned clean in a single pass. The fix cycle closed correctly with no secondary issues on the fix commit.
- The stale closure in handleSave was caught by the semantic reviewer on the fix commit (34a9352), not in production. The agent caught a regression introduced by its own prior recommendation (hook split). This demonstrates the value of re-running semantic review on fix commits that modify production code.
- The double-click race test (741ae30) and the handleDiscard/showFinishDialog tests (df5d354) add concrete behavioral coverage for interaction-state edge cases that are easy to miss in manual testing.

---

### 2026-03-13 — Session ownership hardening + Array.isArray guards (commits 306f44a, a0d9973, 5b2864f)

**Context:** Three-commit fix cycle on feat/post-sprint-3-polish. Commit 306f44a addressed CodeRabbit findings (session ownership checks, answer error recovery, SQL field validation, hook split to use-answer-handler). Commit a0d9973 addressed two post-commit semantic-reviewer ISSUEs (Array.isArray guards, reactive lock clearing). Commit 5b2864f refined the lock-clearing approach (restore synchronous clear + keep useEffect as safety drain) and added Array.isArray test coverage.

**Code reviewer:** clean on all 3 commits — 0 blocking, 0 warnings. All file-size limits respected after the use-answer-handler extraction.

**Semantic reviewer (306f44a):** 2 ISSUEs.

1. **ISSUE — Missing Array.isArray guard on type-cast config data (→ fixed a0d9973):** In `check-answer.ts` and `fetch-explanation.ts`, the session config's `question_ids` field was cast `as unknown as string[]` and passed directly to `.includes()`. No runtime check verified the cast was valid. If the DB returned a non-array (corrupted config, null, string field), `.includes()` would throw at runtime. Fixed by wrapping the `.includes()` call in an `Array.isArray(questionIds)` guard. Root cause: a TypeScript cast (`as unknown as T`) creates no runtime guarantee — when the source is external data (DB/RPC), the cast assumption must also be validated at runtime. This is the **second occurrence** of a cast bypassing a needed runtime validation (first: batch_submit_quiz malformed config cast in a prior commit). Count in frequency table: 2. Status: RULE CANDIDATE.

2. **ISSUE — Imperative ref clear in catch block creating re-entry window (→ fixed a0d9973, refined 5b2864f):** `use-answer-handler.ts` cleared `lockedRef.current.delete(questionId)` in the catch block to allow retry after an error. However, the React `answers` state update (which also drives the lock) was enqueued asynchronously — there was a brief window between the synchronous ref clear and the state settling where a second call could enter before the first was fully resolved. Fixed in a0d9973 by replacing the imperative catch-block clear with a `useEffect` keyed on `answers` state. In 5b2864f, the synchronous clear was restored for immediate user retryability, with the `useEffect` kept as a safety drain. The final solution uses both: synchronous clear for speed, reactive drain as a correctness backstop. **First occurrence** of this specific async-lock re-entry window pattern. Logged as new watch item.

**Semantic reviewer (a0d9973 and 5b2864f):** clean — 0 issues, 0 suggestions on both fix commits.

**Doc updater:** `docs/database.md` and `docs/plan.md` updated in a0d9973 with migration 026 notes. Clean — no partial-doc-fix pattern.

**Test writer (306f44a):** `use-answer-handler.ts` was a new hook file created in the same commit without a co-located test file. This is the **fourth recurrence** of the "new hook file shipped without tests" pattern (code-style.md Section 7 rule was added on the second occurrence). 12 tests were written in the follow-up commit a0d9973. The compliance gap at authoring time persists — the rule is clear and in place, but hook extractions routinely ship without tests and are caught post-commit by the test-writer.

**Test writer (a0d9973):** 14 tests written total — 12 for `use-answer-handler.ts` (lock guard, error recovery, answer tracking) and 2 for `lookup.ts` empty-string UUID path. All passing.

**Test writer (5b2864f):** 6 tests added — Array.isArray guard paths (null question_ids, string question_ids, null config) in `check-answer` and `fetch-explanation`. All passing. These directly targeted the gap noted in the semantic reviewer's ISSUE on 306f44a.

**Actions taken:**
- Frequency table: "New hook/utility file shipped without a test file" count updated 3 → 4. Status unchanged (RULE EXISTS, compliance gap at authoring time).
- Frequency table: 3 new entries added: "Type cast bypassing runtime validation" (count 2, RULE CANDIDATE), "New hook file extracted without shipping tests in the same commit" (count updated in frequency table row), "Imperative ref clear in catch block leaving re-entry window" (count 1, Watch).

**Pattern analysis — type cast without runtime guard (count 2, RULE CANDIDATE):**

Both occurrences share the same structure:
- External data (DB/RPC result or config jsonb field) is cast using `as unknown as T[]`
- A method that requires the runtime type (`.includes()`, `jsonb_array_elements()`, iteration) is called immediately on the cast result
- No `Array.isArray()` / `typeof` / `instanceof` check validates the assumption before use

The TypeScript cast is a compile-time assertion only. When the underlying data is external (Supabase query result, jsonb field, RPC output), the cast does not guarantee the runtime shape. A rule clarification in `code-style.md` Section 5 (TypeScript Rules) is warranted.

**Recommended change (awaiting orchestrator approval):**

Add to `code-style.md` Section 5, after the "No Type Casting Unvalidated External Data" rule:

```
// ❌ WRONG — cast from external data with no runtime guard
const questionIds = config.question_ids as unknown as string[]
if (questionIds.includes(questionId)) { ... }   // throws if config is null/string/object

// ✅ CORRECT — cast paired with runtime guard
const questionIds = config.question_ids as unknown as string[]
if (Array.isArray(questionIds) && questionIds.includes(questionId)) { ... }
```

**Rule gaps identified (not yet actionable — awaiting second occurrence):**
- The imperative-ref-clear re-entry window (first occurrence) has no corresponding rule. If it recurs on a different handler that uses a ref-based lock, add a note to code-style.md about the two-mechanism pattern: synchronous ref clear for speed + reactive effect drain for correctness backstop.

**False positives:** none detected.

**Positive signals:**
- Semantic reviewer was clean on both fix commits (a0d9973 and 5b2864f) — the fixes were correct and introduced no secondary issues.
- The Array.isArray guard tests (5b2864f — 6 tests) were written to specifically target the guard paths identified by the semantic reviewer. The test cycle closed tightly: ISSUE found in 306f44a, guards added in a0d9973, guard paths tested in 5b2864f.
- The dual-mechanism lock-clearing solution (sync clear + reactive drain) is a good pattern for async locks where both speed (user retryability) and correctness (state consistency) matter.
- Code reviewer clean on all 3 commits confirms the use-answer-handler split and SQL hardening respected all file-size and style limits.

---

### 2026-03-13 — CodeRabbit PR #74 fixes + answeredCount counter (commits 675104e, 4798fdb)

**Context:** Two-commit cycle on feat/post-sprint-3-polish. 675104e addressed 8 CodeRabbit PR #74 findings (session-runner, session-summary, draft.ts, reports.ts, lookup.ts, load-draft.ts, seed-eval.ts). 4798fdb fixed a semantic-reviewer ISSUE from the first commit and added 14 new tests.

**Code reviewer (675104e):** clean — 0 blocking, 0 warnings.

**Code reviewer (4798fdb):** clean — 0 blocking, 0 warnings. (Changes were hook state addition + 2 new test files only.)

**Semantic reviewer (675104e):** 1 ISSUE + 1 SUGGESTION.

1. **ISSUE — `answeredCount` derived from `currentIndex + 1` (fixed 4798fdb):** In `use-session-state.ts`, the hook returned `answeredCount: currentIndex + 1`. This was introduced in 675104e as the CodeRabbit fix to stop computing the count in `session-runner.tsx`. However, using the navigation index as a proxy for "answers given" is semantically wrong: `currentIndex` represents which question is currently displayed, not how many answers have been submitted. Under normal linear flow these co-vary, but they diverge on non-linear navigation (e.g., jumping back), session restore with a mid-session index, or any future feature that changes index without answering. Fixed in 4798fdb with a dedicated `answeredCount` `useState` initialised to `0` and incremented via functional updater inside `handleSubmit`. Root cause: same family as the prior "SQL score aggregation over full table" issue — a value that co-varies with the target metric under happy-path conditions but is not semantically equivalent. **This is the second occurrence of the "derived value correct by coincidence" meta-pattern.** Count in frequency table: 2. Status: RULE CANDIDATE.

2. **SUGGESTION — `answers` cast in `load-draft.ts` unguarded:** The `rowToDraftData` function added a `isSessionConfig` runtime guard for the `session_config` field (correctly fixing a prior CodeRabbit finding), but left a second cast in the same function — `row.answers as Record<string, { selectedOptionId: string; responseTimeMs: number }>` — without a corresponding guard. Suggestion-level — not fixed in this cycle. **First occurrence of this specific sub-pattern: partial runtime guard coverage within a single function (one field guarded, sibling field unguarded).** Logged and watched.

**Semantic reviewer (4798fdb):** clean — 0 issues, 0 suggestions.

**Doc updater (675104e + 4798fdb):** no changes needed — both commits changed only component logic, hook state, and test files. No schema, RPC, or routing surface changed.

**Test writer (675104e):** `isSessionConfig` guard shipped in 675104e without a test file for `load-draft.ts`. DB error logging in `lookup.ts` also added without new tests. Both gaps filled in 4798fdb.

**Test writer (4798fdb):** 14 new tests across 2 new files.
- `load-draft.test.ts` (10 tests): `isSessionConfig` guard paths (null, non-object, missing sessionId, sessionId as non-string, valid minimal, valid with optional fields), malformed config fallback (returns empty sessionId, logs error), happy path (correct field mapping).
- `lookup.test.ts` (4 tests): DB error logging paths for the new `console.error` call sites added in 675104e.

All 14 tests passing before report.

**Pattern analysis — "derived value correct by coincidence" (count 2, RULE CANDIDATE):**

Both occurrences share the same structure: a metric that needs to be tracked is computed by reading a structural or positional value that co-varies under normal flow but is not semantically equivalent to the metric. Both are correct on the happy path and pass all tests. Both diverge on edge cases (non-linear navigation, partial operations, session restore).

Occurrences:
1. `batch_submit_quiz` SQL: score derived from full-table count rather than the current batch (f53eccf)
2. `answeredCount: currentIndex + 1` (675104e) — co-varies normally, breaks on non-linear navigation or session restore

**Recommended change (awaiting orchestrator approval):**

Add a note to the learner's patterns memory capturing the principle for future authoring guidance: when a metric needs to be tracked (count, score, progress), introduce a dedicated state variable incremented at the domain event. Do not derive the metric from a structural position (index, array length, loop counter) that co-varies under normal conditions but is not semantically equivalent. The derivation is "correct by coincidence" and will fail when an edge case changes the structural variable independently.

This note should also be flagged for the test-writer patterns memory: when reviewing a new hook or function, check whether an output value is derived from a positional or structural proxy rather than a dedicated accumulator. If so, flag it as a potential "correct by coincidence" derivation.

No rule change proposed for `code-style.md` at this time — two occurrences of a semantic anti-pattern is sufficient to log and recommend, but this does not map to a mechanically checkable rule. Agent memory is the right home.

**Actions taken:**
- Frequency table: "Derived value correct by coincidence (index used as count proxy)" added at count 2, status RULE CANDIDATE.
- Frequency table: "Partial runtime guard coverage within function (sibling cast unguarded)" added as new watch item at count 1.
- No rule changes applied to `code-style.md` or `security.md` this cycle.

**False positives:** none detected.

**Positive signals:**
- 675104e was clean on code-reviewer — all 8 CodeRabbit fixes respected file-size and style limits.
- The fix in 4798fdb is minimal and correct: 3 lines changed, no secondary effects, semantic reviewer confirmed clean.
- The `isSessionConfig` guard is a direct application of the "type cast + runtime guard" rule added in 22c3d5e. The remaining `answers` cast is a partial-compliance gap, not a rule gap.
- 14 new tests in 4798fdb tightly target the paths introduced in 675104e. Code added in one commit, tests backfilled in the next with no gaps escaping to git.

---

### 2026-03-13 — CodeRabbit PR #74 address-8-findings cycle (commits 33c1fa8, d06c25b)

**Context:** Two-commit cycle on feat/post-sprint-3-polish. 33c1fa8 addressed 4 CodeRabbit PR #74 findings (latest review round). d06c25b is the fix commit that resolved the semantic-reviewer ISSUE and the test-writer gap from the 33c1fa8 post-commit review.

**Code reviewer (33c1fa8):** clean — 0 blocking, 0 warnings.

**Semantic reviewer (33c1fa8):** 1 ISSUE.

1. **ISSUE — Silent `answeredCount` fallback in `reports.ts` (fixed d06c25b):** For completed sessions where no `quiz_session_answers` rows exist, `reports.ts` returned `answeredCount: 0` silently with no logging. A completed session with zero answer rows is anomalous — the fallback hides a data integrity gap from server logs, making it invisible during incident diagnosis. Fixed in d06c25b with `console.warn('[getReportData] answeredCount fallback triggered: completed session has no answer rows', { sessionId })`. Root cause: same family as the `boundParam` silent fallback (53efbdd) — a numeric fallback that produces a valid-looking result with no server-side observability signal. **This is the second occurrence of the "silent numeric fallback without logging" pattern.** Count in frequency table: 2. Status: RULE CANDIDATE.

**Doc updater (33c1fa8):** clean — no updates needed. Both commits changed only query logic and test files; no schema, RPC, or routing surface changed.

**Test writer (33c1fa8):** 1 gap — `draft.ts` users query error path had no test. When `getUser()` returns an error for the users query inside `draft.ts`, there was no test branch covering that path. Test added in d06c25b (20 lines, 28/28 pass). Root cause: a new error-return path was added to an existing function without updating the test file to cover the new branch. **This is the second occurrence of "error path in existing function untested."** Count in frequency table: 2. Status: RULE CANDIDATE.

**Code reviewer (d06c25b):** clean — 0 blocking, 0 warnings. (2 files changed: reports.ts +6 lines, draft.test.ts +20 lines. Both within limits.)

**Semantic reviewer (d06c25b):** clean — 0 issues, 0 suggestions.

**Doc updater (d06c25b):** clean — no updates needed.

**Test writer (d06c25b):** no gaps.

**Meta-pattern observed: CodeRabbit vs per-commit diff scope:**
The context for this cycle noted that CodeRabbit reviews the full PR diff while our per-commit agents review only the commit diff. CodeRabbit has caught cross-file consistency issues (test assertions not matching production code from earlier commits, doc matrix inconsistencies spanning multiple files) that our per-commit agents missed because the relevant context spanned commits. This is a structural gap in coverage, not a failure of individual agents. Logged as a system-level insight — no action to rules warranted, but worth noting for agent design: if a future improvement to the per-commit review pipeline is considered, cross-commit diff coverage would close this gap.

**Pattern analysis — "silent numeric fallback without logging" (count 2, RULE CANDIDATE):**

Both occurrences:
1. `boundParam` in `analytics.ts` (53efbdd): NaN/±Infinity input silently clamped to minimum, no console.warn. Suggestion-level, not fixed.
2. `answeredCount` in `reports.ts` (33c1fa8): completed session with no answer rows returned 0 silently, no console.warn. ISSUE-level, fixed in d06c25b.

Both share the structure: a numeric computation whose source data is empty, malformed, or anomalous falls back to a minimum/zero value, and the caller receives a structurally valid result with no server-side signal. The fix pattern is consistent: add a `console.warn` with context (function name, relevant IDs) before returning the fallback.

This is a RULE CANDIDATE. However, it is suggestion-level for the `boundParam` case (parameter clamping functions commonly clamp silently) and ISSUE-level for query functions that return business metrics (where an anomalous result should always be logged). The distinction matters:
- **Utility math helpers** (clamp, bound): console.warn is good practice, not required.
- **Query/data functions that return business metrics** (count, score, answeredCount): a fallback to 0 where non-zero is expected is always anomalous and must log.

No rule change to `code-style.md` proposed yet — the distinction between utility clamping and metric fallback is semantic, not mechanical. Log in agent memory. If a third occurrence in a data/query function surfaces, add a note to `code-style.md` Section 5 or the semantic-reviewer's checklist: "data functions returning numeric metrics must not silently fall back to 0 — add a console.warn with the relevant ID when the fallback fires."

**Pattern analysis — "error path in existing function untested" (count 2, RULE CANDIDATE):**

Both occurrences in `draft.ts`:
1. Count-error path (Cycle 1, 2026-03-13): `getCount()` error branch had no test.
2. Users-query error path (d06c25b): `getUser()` error return inside the same file had no test.

Both share the structure: a new error-return path is added to an existing file that already has a test file, but the test file is not updated in the same commit to cover the new branch. The test-writer catches the gap post-commit.

The root cause differs from "new hook file shipped without tests" (where an entire new file has no test). Here, the test file exists but is incomplete after new error paths are added. The correct fix is: whenever a new `if (error) return ...` path is added to a file that has a co-located test, add the corresponding test branch in the same commit.

This is the correct place for a test-writer patterns memory note (not a code-style.md rule — the existing "new file must have tests" rule does not cover existing files gaining new branches). Proposed addition to test-writer patterns memory: when reviewing a diff, check every new `if (error)` branch and every new early-return path in files that have an existing test file — those branches need test coverage in the same commit.

**Actions taken:**
- Frequency table: "Silent numeric fallback without observability logging" updated to count 2, status RULE CANDIDATE.
- Frequency table: "Error path in existing function untested" updated to count 2, status RULE CANDIDATE.
- Frequency table: new entry added for "CodeRabbit vs per-commit diff scope" as a system-level observation (not a code pattern — no frequency tracking needed, logged in lessons only).
- No rule changes applied to `code-style.md` or `security.md` this cycle — both new RULE CANDIDATE patterns are at the 2-occurrence threshold but the actionable guidance belongs in agent memory (test-writer patterns) rather than mechanically checkable code rules.

**Recommended changes (awaiting orchestrator approval before applying):**

1. **`.claude/agent-memory/test-writer/patterns.md`** — add a note: when reviewing a commit diff, check every new `if (error) return` or early-return path added to a file that already has a co-located test file. Each new error-return branch that has no corresponding test case in the same commit is a coverage gap. Write the test branch in the same commit as the production change, not as a post-commit backfill.

2. **`.claude/agent-memory/test-writer/patterns.md`** (secondary) — add a note: when a new query is added to an existing function (e.g., a second `supabase.auth.getUser()` call or a second `.from()` query), check whether the test file covers the error path for the new query. Adding a second query to a function that already has tests for the first query's error path does not automatically cover the second query's error path.

**False positives:** none detected.

**Positive signals:**
- Both agents (code-reviewer and semantic-reviewer) were clean on the fix commit (d06c25b) — the fix was minimal and correct.
- The `console.warn` fix pattern is consistent with prior fixes (auth error logging in query files, 78cb130). The project now has a clear convention: anomalous data states in server functions are logged with context before falling back.
- The test coverage for the users-query error path (draft.test.ts, 20 lines) is direct and well-targeted — it exercises exactly the branch that was missing.
- Cycle closed in 2 commits with all agents clean on the second commit.

---

### 2026-03-13 — Pre-cast validation + type guard tests (commits 274821b, 34c9b36)

**Context:** Two commits on feat/post-sprint-3-polish. 274821b added `isCheckAnswerRpcResult` type guard and pre-cast text validation in `batch_submit_quiz`. 34c9b36 fixed two semantic-reviewer findings from the prior round (bounded regex, case-insensitive dedup) and added 6 type guard tests via test-writer.

**Code reviewer:** clean — 0 blocking, 0 warnings on both commits.

**Semantic reviewer (274821b):** 1 ISSUE + 2 SUGGESTIONS. ISSUE fixed in 34c9b36. Suggestions addressed in 34c9b36.

1. **ISSUE — Unbounded `^\d+$` regex on response_time_ms permits int overflow:** The pre-cast text validation added in 274821b used `^\d+$` to gate the cast from text to INT in the `batch_submit_quiz` RPC. `^\d+$` imposes no upper digit count, so a payload with a 20-digit numeric string passes the regex check and then overflows PostgreSQL INT on cast. Fixed in 34c9b36 with `^\d{1,10}$` (10 digits = 9,999,999,999, safely within INT range). Root cause: the regex was written to validate "is numeric" but not "is in the target type's range." **First occurrence.** Logged as new watch item. The principle: any SQL regex that validates a value before casting to a bounded numeric type must also bound the digit count to match the target type's maximum.

2. **SUGGESTION — Duplicate-answer dedup compared text without `lower()`:** The text-based dedup check (introduced in 274821b to avoid a cast error on malformed UUIDs) compared raw text, which is case-sensitive. A client sending mixed-case UUID hex digits could bypass the dedup. Fixed in 34c9b36 with `lower(e->>'question_id')`. Defense-in-depth: standard UUID generators produce lowercase, but the guard should not assume that. **First occurrence.** Logged as new watch item. Distinct from the previously tracked "SQL string comparison instead of ::uuid cast" pattern (that is about using text vs. typed comparison — this is about normalising case before text comparison).

3. **SUGGESTION — Type guard tests missing for `isCheckAnswerRpcResult`:** The type guard was added in 274821b without a corresponding test. Fixed by test-writer in 34c9b36 (6 tests covering: non-null primitive, missing `is_correct`, `is_correct` as string, `correct_option_id` as null, `explanation_text` as number, `explanation_image_url` as number). All 6 tests passing. This is another recurrence of the "new function shipped without tests" compliance gap — the type guard was a new exported-equivalent function and should have shipped with tests in the same commit.

**Doc updater:** no changes needed — both commits modified existing modules with no schema, RPC signature, or route surface change. The database.md batch_submit_quiz documentation already reflected the pre-cast validation additions from the prior migration (027).

**Test writer (34c9b36):** 6 tests written for `isCheckAnswerRpcResult` type guard. All passing. These covered every branch of the guard function — both the happy path (all fields correct types) and 5 rejection cases (one per field or structural check). High-signal coverage.

**Pattern analysis — type cast bypassing runtime validation (closed):**

The "type cast bypassing runtime validation" pattern (count 2, RULE CANDIDATE as of the 306f44a/a0d9973 cycle) has now been resolved at the rule level: `code-style.md` Section 5 was updated with the runtime guard requirement, and `.coderabbit.yaml` was synced (commit 22c3d5e). Commit 274821b demonstrates the rule being applied correctly: `isCheckAnswerRpcResult` replaces the bare `!data` check with a full structural type guard. Status in frequency table updated from RULE CANDIDATE to RULE ADDED.

**Pattern analysis — unbounded regex + pre-cast validation (new, count 1):**

The unbounded regex issue is a sub-pattern of the broader "validate before cast" family. The prior "pre-cast validation" work (274821b) was correct in principle but missed the digit-count bound. The three sub-patterns now tracked separately:
- "SQL string comparison instead of ::uuid cast in duplicate check" (count 1, watch) — cast vs. text comparison
- "Unbounded numeric regex permitting int overflow" (count 1, watch) — regex validates type but not range
- "Case-sensitive UUID/text dedup (lower() missing)" (count 1, watch) — text comparison without normalisation

None of these have reached count 2. All logged and watched.

**Actions taken:**
- Frequency table: "Type cast bypassing runtime validation" status updated from RULE CANDIDATE to RULE ADDED.
- Frequency table: 2 new watch items added (both first occurrences): "Unbounded numeric regex permitting int overflow" and "Case-sensitive UUID/text dedup in SQL (lower() missing)".
- No new rule changes proposed — the 2 new patterns are first occurrences. The rule already added (code-style.md Section 5 runtime guard) covered the root issue.

**False positives:** none detected.

**Positive signals:**
- The semantic-reviewer correctly identified the regex overflow gap — a subtle correctness issue that lint and type-check cannot catch. The agent caught it post-commit, one cycle after the regex was written. The gate is working at the right layer.
- The test-writer produced 6 well-targeted tests covering every rejection branch of `isCheckAnswerRpcResult`. These are high-signal: they lock in the exact field-type expectations of the guard, so any future change to the RPC schema that relaxes a type constraint will break a test immediately.
- Code reviewer was clean on both commits — the additions stayed within all file-size limits.
- The "type cast + runtime guard" rule cycle is now complete: pattern identified (306f44a) → counted (a0d9973) → rule added (941d58c) → rule applied (274821b) → overflow fix (34c9b36) → tests written (34c9b36). This is the intended lifecycle.

---

### 2026-03-13 — QuizTabs TabButton extraction + badge isolation tests (commits 46113bf, 9c2a737)

**Context:** Two-commit cycle on feat/post-sprint-3-polish. 46113bf extracted a private `TabButton` helper from `QuizTabs` to bring the component function under the 30-line limit. 9c2a737 added 2 targeted tests covering the badge isolation and round-trip tab switch behaviors exposed by the extraction. All 4 agents reported clean on both commits.

**Code reviewer (46113bf):** clean — 0 blocking, 0 warnings. The `TabButton` helper is a pure JSX presenter (props in, markup out), well within the 30-line function limit. `QuizTabs` itself dropped from 43 lines to ~15 lines. `TabButton` is file-private (not exported), which is correct for a component used only within the parent file.

**Code reviewer (9c2a737):** clean — 0 blocking, 0 warnings. Test-only commit; relaxed line limits apply.

**Semantic reviewer (46113bf):** 0 critical, 0 issues. 1 SUGGESTION.

1. **SUGGESTION — Pre-existing ARIA gap on tab buttons:** `TabButton` renders `<button>` elements without `role="tab"`, `aria-selected`, or an enclosing `role="tablist"`. The component functions as a tab UI but uses plain buttons, which means screen readers cannot announce the tab context. The suggestion was flagged as pre-existing (the original buttons also lacked ARIA tab attributes) — the extraction did not introduce the gap. No fix applied. **First occurrence** of this specific ARIA tab pattern gap being explicitly flagged. Logged and watched.

**Semantic reviewer (9c2a737):** clean — 0 issues, 0 suggestions.

**Doc updater (both commits):** clean — no changes needed. Both commits changed only component internals and co-located tests; no schema, RPC, or routing surface changed.

**Test writer (46113bf):** The test-writer noted 2 behavioral gaps introduced by the `TabButton` extraction that the existing 6 tests did not cover:
1. Badge isolation — with the badge logic now parameterised via the `badge` prop, it was possible (and worth verifying) that the "New Quiz" tab could never receive a badge even when `draftCount > 0`. The original implementation hardcoded the badge inside the "Saved Quizzes" block; the extracted version passes `badge` only to the saved tab — but this was implicit, not asserted.
2. Round-trip tab switch — the extraction converted a single conditional render into a pure `tab === 'new' ? newQuizContent : savedDraftContent` ternary. Worth asserting that switching Saved → New correctly restores new content.

Both tests were written in 9c2a737. All existing 6 tests continued to pass unchanged.

**Test writer (9c2a737):** no gaps — all new tests passing, test-writer confirmed clean.

**Pattern checks this cycle:**

1. **Function extraction to meet 30-line limit (general):** The refactor is the pattern working as intended. `QuizTabs` had two nearly identical button blocks — the "Extract at 3 repetitions" rule from code-style.md Section 2 did not technically apply (only 2 instances), but the 30-line function rule did (43 lines > 30). The extraction resolved both issues simultaneously. **Positive signal — rule caught a structural smell before it accumulated further.**

2. **New component-level helper without tests:** `TabButton` was not directly tested in isolation. It is file-private and has no exported surface — the correct testing approach is through the parent `QuizTabs` tests, which is what 9c2a737 did. This is NOT a recurrence of the "new hook/utility file shipped without tests" pattern — that pattern applies to exported utilities and hooks with standalone contracts. File-private presenters tested indirectly through the parent are the expected pattern. **No action.**

3. **ARIA accessibility pattern gap (count 1, WATCH):** The semantic-reviewer flagged missing `role="tab"` / `aria-selected` on buttons used as tabs. This is a pre-existing gap (not introduced by the extraction), and the suggestion is a first occurrence. Logged. If a second component is flagged for missing semantic ARIA tab attributes (role="tablist", role="tab", aria-selected), a note should be added to code-style.md Section 2 (component rules) or a project accessibility checklist.

4. **Test coverage added post-extraction (positive signal):** The test-writer identified 2 behavioral properties that became implicit after the refactor (badge isolation, tab switch round-trip) and covered them explicitly. This is the correct response to a refactor that changes how a behavior is implemented — even when all existing tests pass, the refactor may have made previously explicit behavior implicit, which warrants new explicit assertions.

**Actions taken:**
- Frequency table: "ARIA tab role missing on button-based tab UI" added at count 1, status WATCH.
- No rule changes proposed — the ARIA gap is a first occurrence and pre-existing, not introduced by the refactor. All other patterns are either working as intended or already tracked.

**False positives:** none detected.

**Positive signals:**
- All 4 agents reported clean on both commits. First clean cycle on this branch since the review-gate hook was added (f7ef0f8). Confirms the gate is not generating false friction.
- The 30-line function rule caught a structural duplication that would otherwise have grown — two near-identical button blocks in a 43-line function is the exact smell the rule is designed to surface.
- `TabButton`'s `badge` prop API is clean: `badge?: number`, rendered only when `badge != null && badge > 0`. The optional-prop convention avoids the need for callers to pass explicit `0` or `undefined` to suppress the badge — the "New Quiz" tab simply omits the prop.
- 9c2a737 demonstrates the correct post-refactor test pattern: run existing tests first (all pass), then add tests for any behavior the refactor made implicit. Refactors should always be evaluated for "what was explicit that is now implicit?"

---

### 2026-03-13 — Shift-left plan validation protocol (commit 9257ccb)

**Context:** Single docs-only commit on feat/post-sprint-3-polish. Added a new workflow section to CLAUDE.md documenting the shift-left plan validation protocol (user approval before orchestrator commits to approach). No code changes, no test changes.

**Code reviewer (9257ccb):** clean — 0 blocking, 0 warnings. (Docs-only commit outside code-review scope.)

**Semantic reviewer (9257ccb):** 2 SUGGESTIONS (both fixed post-commit by doc-updater).

1. **SUGGESTION — Stale workflow section in CLAUDE.md:** The existing "Workflow" section (lines 115–125) was not updated to reference the new plan validation protocol. The new section (lines 88–101) documented the protocol, but the high-level workflow ordering did not include a pointer back to it. Fixed in 320986f (commit following 9257ccb) with an updated "Workflow" section clarifying that "Plan Mode" is the first step and links to the new section.

2. **SUGGESTION — Missing cross-reference in push protocol:** The new "Push protocol" section (added in 9257ccb as the last section) documented user approval requirement, but the `agent-workflow.md` file in `.claude/rules/` already documented pre-push expectations. The two should cross-reference each other to prevent drift. Fixed in 0c7e7e7 (docs: cross-reference pre-push PR sweep in CLAUDE.md push protocol) with bidirectional links added between CLAUDE.md and `.claude/rules/agent-workflow.md`.

Root cause: docs-only commits that add new sections without updating cross-references elsewhere in the same file or in related rule files can introduce internal inconsistency. **This is the first occurrence of a "docs-only cross-reference drift" pattern.** Both instances involved CLAUDE.md and a related rule file — the patterns share a structure (newly added section not linked from existing section that covers related territory) and were caught by semantic-reviewer's consistency checks.

**Doc updater (9257ccb):** Noted 2 suggestions from semantic-reviewer but did not auto-fix them (the agent is scoped to checking schema/RPC/routing surface changes, not internal CLAUDE.md cross-reference consistency).

Then (320986f): Doc updater fixed the stale workflow section reference with a 3-line addition to the "Workflow" section of CLAUDE.md, ensuring the new plan validation protocol is mentioned alongside the existing workflow steps.

Then (0c7e7e7): Semantic reviewer's second suggestion prompted a manual doc fix (not by doc-updater) adding cross-references between CLAUDE.md push protocol and `.claude/rules/agent-workflow.md`.

**Test writer (9257ccb):** no gaps — docs-only commit, no test changes needed.

**Pattern analysis — docs-only cross-reference drift (count 1, WATCH):**

The pattern: a new section is added to `CLAUDE.md` (or related doc) that covers a workflow or process change. The new section is self-contained and correct. However, existing sections that overlap or relate to the new content are not updated to cross-reference it, creating the appearance of two separate, potentially conflicting workflows in the same doc. The inconsistency is caught by semantic-reviewer during post-commit review, not before commit.

Both occurrences in this cycle:
1. New "plan validation protocol" section added without updating the existing "Workflow" section to mention it (120 lines apart, both about workflow orchestration).
2. New "push protocol" section added without cross-referencing the existing `.claude/rules/agent-workflow.md` rule file that also documents push expectations.

Root cause: `CLAUDE.md` is a narrative doc that grew to cover multiple layers (high-level philosophy → workflow → agent rules → deployment). New sections added to different layers can create redundant or orphaned documentation without automatic linking. The doc updater's current scope is code-surface changes (schema, RPC, routes), not doc structure consistency.

No rule change proposed yet — this is a first occurrence. If a second "docs-only section added without cross-references" instance appears, the pattern is confirmed and a note should be added to `.claude/agent-memory/doc-updater/patterns.md`: when a new section is added to `CLAUDE.md`, scan for existing sections with overlapping keywords (workflow, protocol, agent, rules) and add cross-references if they exist within ±5 lines or cover the same domain.

**Actions taken:**
- Frequency table: "Docs-only cross-reference drift (new section not linked from existing section)" added at count 1, status WATCH.
- No rule or memory updates applied — pattern not yet at recurrence threshold.
- Logged findings for semantic-reviewer's two suggestions in this session.

**False positives:** none detected.

**Positive signals:**
- Both semantic-reviewer suggestions were immediately actionable and low-friction to fix (3 lines + cross-links).
- The doc-updater correctly noted the suggestions but stayed within its scope (code-surface changes only).
- The fixes were applied in two follow-on commits (320986f and 0c7e7e7), both clean on all agents.
- CLAUDE.md cross-reference fixes demonstrate the orchestrator reading and acting on agent suggestions — the workflow is functioning at the intended speed.
- Docs-only commits are now a regular pattern (3 in the past 5 commits), suggesting the project is in a documentation-stabilization phase post-code-feature-completion.

---