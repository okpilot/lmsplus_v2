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
| Supabase mutation result not destructured (error silently dropped) | 2 | 2026-03-12 | RULE ADDED to code-style.md Section 5 (9f5a6cc) — watching for recurrence |
| Unstable useEffect dependency (inline function prop) | 1 | 2026-03-12 | Watch — onTabChange in question-tabs.tsx; suggestion only, first occurrence |
| `vi.stubGlobal` without `vi.unstubAllGlobals` teardown in test | 1 | 2026-03-12 | Watch — use-quiz-navigation.test.ts; suggestion only, first occurrence |
| E2E test clicks UI without waiting for React state flush (race condition) | 1 | 2026-03-12 | Watch — quiz-flow.spec.ts + progress.spec.ts; fixed with progress-bar DOM gate |
| Broad E2E selector without accessible name / overly loose text match | 1 | 2026-03-12 | Watch — quiz-flow.spec.ts; fixed by scoping getByText and getByRole with name |
| Missing route entry in docs/plan.md route tree after new page added | 1 | 2026-03-12 | Watch — /app/quiz/report missing; fixed by doc-updater in same cycle |

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