# Learner Agent — Pattern Memory

## Issue Frequency

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Missing `short` prop in test fixtures | 1 | 2026-03-11 | Fixed — types added `short` field, tests didn't update |
| `possibly undefined` in test assertions | 1 | 2026-03-11 | Fixed — biome now allows `!` in test files |
| Missing vitest imports (beforeEach) | 1 | 2026-03-11 | Fixed — 3 test files missing import |
| External agent output invisible | 1 | 2026-03-11 | Fixed — Decision 20: agents now run as in-session subagents |
| Duplicate Next.js installs (Playwright) | 1 | 2026-03-11 | Fixed — excluded e2e/ from tsconfig, cast in proxy.ts |
| Pre-push hooks too slow for large diffs | 1 | 2026-03-11 | Fixed — diff cap + timeout + grep fallback |
| Hook file exceeding 80-line limit | 3 | 2026-03-12 | RULE EXISTS — 70-line watch added to code-reviewer memory (9f5a6cc); recurring |
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
| useEffect data fetching in client component (not hydration guard) | 2 | 2026-03-12 | RULE EXISTS (code-style.md Section 6) — statistics-tab.tsx used useEffect to call Server Action; fixed with button + useTransition in db5d8ea |
| LANGUAGE sql instead of plpgsql for SECURITY DEFINER RPC | 1 | 2026-03-12 | Watch — Sprint 3 analytics RPCs (845923b); fixed migration 014 (86c8da4); single root introduction; plpgsql required for RAISE EXCEPTION; if second introduction occurs, add to security.md |
| ?? [] fallback applied after an explicit error guard (silent data loss path) | 1 | 2026-03-12 | Watch — subjects ?? [] in statistics-tab.tsx after null/error guard (845923b); fixed in 86c8da4; data is already known bad at that point, fallback hides the gap |
| Server Action shipped without Zod input validation | 1 | 2026-03-12 | Watch — fetch-stats.ts Server Action (845923b); fixed in 86c8da4; rule exists (security.md rule 4); compliance gap, not rule gap |
| RPC missing identity guard (auth.uid() = p_student_id check) | 1 | 2026-03-12 | Watch — Sprint 3 analytics RPCs (845923b); fixed migration 015 (7b824c2); security.md rule 7 covers null check only — does NOT require identity comparison; gap in rule text; clarify rule 7 on second occurrence |
| Partial fix applied to sibling file group (cross-cutting concern) | 1 | 2026-03-12 | Watch — auth error destructuring applied to 2 of 8 query files (2190dd5); remaining 6 fixed in follow-up commits (3a0d1e6, 78cb130); cost: 3 extra commits; when a fix is a cross-cutting pattern across a file family, all siblings must be fixed in the same commit |
| Auth error from getUser() not destructured in query file | 1 | 2026-03-12 | Watch — 7 of 8 query files under apps/web/lib/queries/ missing authError destructuring (2190dd5 → 3a0d1e6 → 78cb130); distinct from mutation error pattern (that is about .insert/.update/.delete); first occurrence as a named pattern |
| Auth error from getUser() swallowed without logging | 1 | 2026-03-12 | Watch — quiz-report.ts (78cb130); auth failure path returned early with no console.error; first occurrence; silent auth failure is harder to diagnose than silent mutation failure |
| Raw Supabase error message leaked to student UI | 1 | 2026-03-12 | Watch — load-session-questions.ts (78cb130); error.message from Supabase returned directly to student-facing caller; first occurrence; internal error strings must not be exposed to UI — return a generic message or error code |
| Unconditional setState in render body (spurious re-renders) | 1 | 2026-03-13 | Watch — statistics-tab.tsx (53efbdd); `setIsLoading(false)` called unconditionally in a render-path reset block, causing a state update on every render when isLoading was already false; fixed with `if (isLoading) setIsLoading(false)` guard in b555b50; first occurrence |
| useTransition + manual loading state hybrid fragility | 2 | 2026-03-13 | RULE CANDIDATE — statistics-tab.tsx (53efbdd, f0f8d0e); semantic-reviewer flagged this suggestion twice across two consecutive commits: isPending from useTransition and manual isLoading state tracked in parallel can both be false simultaneously during a question-switch mid-fetch, briefly showing the idle "Load Statistics" button while a fetch is still in-flight; generation counter mitigates stale data but does not close the UI-state race; suggestion-level only (not fixed); second occurrence reached — propose rule clarification in code-style.md when next commit arrives in this component's area |
| Silent boundParam fallback without logging | 1 | 2026-03-13 | Watch — analytics.ts (53efbdd); non-finite input (NaN, ±Infinity) to `boundParam` silently clamped to minimum without a console.warn or error log; suggestion-level; first occurrence; if it recurs on a different utility, add a logging rule for parameter clamping fallbacks |
| test-writer produces TS2532 (unchecked array index) errors | 2 | 2026-03-13 | RULE CANDIDATE — test-writer pattern memory should be updated with a note to always use optional chaining (`arr?.[i]`) when accessing array elements in generated test code; first seen in an earlier cycle (test fixture access), second occurrence confirmed in 99c67d2 where a `formatActivityData` test accessed an array index without `?.` and triggered TS2532; the error was caught and fixed before commit, so no broken test reached git; fix is optional chaining or a non-null assertion with a preceding length check |

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