# Semantic Reviewer — Patterns & Learnings

> Running log of recurring issues, positive patterns, and areas needing extra scrutiny.

## Recurring Issues

### auth-before-parse ordering
**First seen:** commit 23a9f10 (2026-03-12)
**Files:** `apps/web/app/app/quiz/actions.ts` — `startQuizSession`; `apps/web/app/app/quiz/actions/batch-submit.ts` — `batchSubmitQuiz` (commit 54e9351)
**Pattern:** Originally parsed Zod input before checking auth, meaning an unauthenticated caller
could leak validation error details (field names, schema shape) before being rejected.
**Fix applied (23a9f10):** auth check moved before `StartQuizInput.parse(raw)`.
**Recurrence (54e9351):** `batchSubmitQuiz` in `batch-submit.ts` correctly continues the pattern — auth check at line 32 before `BatchSubmitInput.parse(raw)` at line 34. Pattern is holding.
**Watch for:** any new Server Action where `.parse(raw)` appears before `getUser()` / `requireAuth()`.

### submitQuizAnswer / completeQuiz — ZodError propagates uncaught (FULLY RESOLVED in commit 9d9e898)
**First seen:** commit 23a9f10 (2026-03-12)
**File:** `apps/web/app/app/quiz/actions.ts` — `submitQuizAnswer`, `completeQuiz` (now deleted)
**Pattern:** Neither function wrapped its body in try/catch. A ZodError on malformed input throws
instead of returning `{ success: false, error: ... }`.
**Status as of commit 9d9e898:** `complete.ts` now wraps Zod parse in try/catch and returns
`{ success: false, error: 'Invalid input' }`. Test updated to match. The tracked ISSUE is resolved.
`submit.ts` remains without try/catch but is not on the deferred-write primary path.
**Watch for:** `submit.ts` if any new caller is added that doesn't wrap it in its own try/catch.

### batchSubmitQuiz — partial submission is unrecoverable for the student
**First seen:** commit 54e9351 (2026-03-12)
**File:** `apps/web/app/app/quiz/actions/batch-submit.ts` — `submitAllAnswers`
**Status: RESOLVED in commit 6120e3f** — replaced N sequential RPC calls with a single atomic
`batch_submit_quiz` RPC. If anything fails inside the DB transaction, the entire batch rolls back.
The partial-write failure mode is eliminated.
**Watch for:** batch operations against immutable tables where partial writes cannot be undone.

### batch_submit_quiz — score counts all session answers, not just the submitted batch
**First seen:** commit 6120e3f (2026-03-12)
**File:** `supabase/migrations/20260312000011_batch_submit_rpc.sql` lines 95-101
**Pattern:** The score query counts ALL `quiz_session_answers` rows for the session, not just
the rows inserted by this RPC invocation. If any answers were written to the session via the
old `submit_quiz_answer` RPC before `batch_submit_quiz` runs, those answers count in the score,
and the `ON CONFLICT DO NOTHING` at the answer-insert step silently keeps the old answer.
The score for that question reflects the old per-answer submission, not the batch submission.
In the current UI flow this cannot happen, but the SQL function has no guard enforcing it.
**Fix:** Scope the score query to `WHERE question_id = ANY(v_submitted_question_ids)`, or add
a guard that the session has no existing answers before processing.
**Watch for:** score calculations that aggregate from the full table rather than from the current
operation's rows — this pattern will produce wrong results if called in an unexpected context.

### updateFsrsCards — positional index alignment between answers[] and results[]
**First seen:** commit 6120e3f (2026-03-12)
**File:** `apps/web/app/app/quiz/actions/batch-submit.ts` lines 74-90
**Pattern:** `updateFsrsCards` pairs `answers[i]` with `results[i]` by array index. This is
correct as long as the RPC returns results in the same order as `p_answers`. Currently true
because `jsonb_array_elements` preserves array order. If the RPC ever processes answers in a
different order (e.g., sorted by question_id for lock ordering), FSRS would apply wrong
isCorrect values to wrong questions — silently.
**Fix:** Use `Map<questionId, isCorrect>` from results instead of positional index.
**Watch for:** any future RPC change that reorders the results array.

### loadSessionQuestions — 'use server' Server Action missing auth check
**First seen:** commit 97ab4ac (2026-03-12)
**File:** `apps/web/lib/queries/load-session-questions.ts`
**Pattern:** Function is marked `'use server'` and calls `get_quiz_questions()` RPC
(which is SECURITY DEFINER and has its own auth.uid() check). The application-layer auth check
is absent from `loadSessionQuestions` itself. Proxy + AppLayout + RPC-level auth provide
three layers of protection, but the Server Action has no explicit auth guard of its own.
**Status:** ISSUE (defense-in-depth gap). Flag on any new `'use server'` function that touches
question data without its own auth check.

### module-level cache (cachedSession) shared between quiz and review loader modules
**First seen:** commit 97ab4ac (2026-03-12)
**Files:** `quiz-session-loader.tsx` and `review-session-loader.tsx`
**Pattern:** Each module has its own `let cachedSession: SessionData | null = null` at module scope.
These are separate variables in separate modules — they do NOT cross-contaminate.
However, in production the Next.js module cache means `cachedSession` persists across
requests in the same server worker. Since these loaders are client components (`'use client'`),
the cache exists only in the browser bundle, not on the server. Safe as-is in the client context.
**Watch for:** if either loader is ever made server-side, the module-level cache becomes a
cross-request data leak between different users.

## Positive Patterns

### FSRS best-effort scheduling with try/catch
**File:** `apps/web/app/app/quiz/actions/submit.ts`, `apps/web/app/app/quiz/actions/batch-submit.ts`, `apps/web/app/app/review/actions.ts`
All three paths wrap `updateFsrsCard` in try/catch so that a scheduling failure never blocks
answer submission. Consistent across the entire codebase.

### Auth-before-Zod pattern now consistently applied in startQuizSession and review/actions.ts
`startReviewSession` already had auth before parse. `startQuizSession` now matches it.
`batchSubmitQuiz` (commit 54e9351) also follows the pattern correctly.

### Deferred-write client state model (commit 54e9351)
`quiz-session.tsx` stores answers in a `Map<string, StoredAnswer>` and only sends to the server
on final submission. This is correct for the deferred-write design. The Map key is question ID,
so re-answering the same question overwrites rather than appends — correct behavior for
a practice quiz where a student can change their mind before submitting.

### answerStartTime reset on navigation (commit 54e9351)
`quiz-session.tsx` line 59: `answerStartTime.current = Date.now()` is correctly reset on
every `navigate()` call, so `responseTimeMs` measures time on the current question, not
cumulative session time. The deferred architecture preserves per-question timing.

## High-Scrutiny Files
- `apps/web/proxy.ts` — auth flow, cookie handling, redirects
- `apps/web/app/auth/callback/route.ts` — PKCE code exchange, session creation
- `apps/web/app/app/quiz/actions/batch-submit.ts` — deferred-write batch, sequential RPC loop, partial failure behavior
- `apps/web/app/app/quiz/actions/submit.ts` — individual submit, no try/catch wrapper (ZodError propagates)
- `apps/web/app/app/quiz/actions/complete.ts` — completeQuiz, no try/catch wrapper (ZodError propagates)
- `apps/web/lib/queries/load-session-questions.ts` — Server Action serving questions; verify auth check is present
- `apps/web/app/app/_components/app-shell.tsx` — fullscreen detection via pathname string matching; could false-positive on future routes
- `packages/db/src/admin.ts` — service role key usage

### getQuizReport — missing explicit auth check on a lib/queries Server Component query
**First seen:** commits dce30b1 / e8d70fc (2026-03-12)
**File:** `apps/web/lib/queries/quiz-report.ts`
**Pattern:** `getQuizReport()` uses `createServerSupabaseClient()` (session-scoped client, not admin)
and relies entirely on RLS to enforce session ownership. Unlike other `lib/queries/*.ts` files
(`dashboard.ts`, `progress.ts`, `review.ts`) which explicitly call `supabase.auth.getUser()` and
return early if the user is unauthenticated, `getQuizReport` has no explicit auth check.
The proxy protects the route, and RLS on `quiz_sessions` (`student_id = auth.uid()`) means
an unauthenticated call returns null (session row not visible), which the page converts into a
redirect — so the defense-in-depth gap is real but not exploitable in the current deployment.
**Watch for:** inconsistency in the `lib/queries/` pattern: all sibling functions call `getUser()`,
this one does not. Flag new functions in this family that omit the explicit check.

### quiz-report.ts — direct SELECT on questions table with options JSONB including correct field
**First seen:** commits dce30b1 / e8d70fc (2026-03-12)
**File:** `apps/web/lib/queries/quiz-report.ts`
**Pattern:** After a session is completed, `getQuizReport()` directly SELECTs from `questions`
including the `options` field which contains `correct: boolean` per option. This is intentional
post-session behavior — the report must show which answer was correct. The correct field is
stripped before leaving the server: `buildReportQuestions()` maps `options.map(o => ({ id, text }))`
removing `correct` before the data reaches `QuizReportData`. The `ReportCard` component receives
only `correctOptionId` (a string ID, not the full options array with correct flags).
**Key distinction from violation:** `get_quiz_questions()` RPC is mandatory only for active sessions.
Post-session reports reading from the DB server-side and stripping `correct` before the return
type is acceptable per the security model.
**Watch for:** verify the strip always happens in `buildReportQuestions` — if `options` is ever
added to the `QuizReportQuestion` type with `correct` included, that would be a violation.

### ExplanationTab in quiz-session.tsx — hardcoded placeholder props (stub implementation)
**First seen:** commit e8d70fc (2026-03-12)
**Status: RESOLVED in commit 2475dc6** — the Explanation tab is now hidden entirely during an
active quiz session via `hiddenTabs={['explanation']}` on `QuestionTabs`. The stub render path
is eliminated. Explanations remain available on the post-session report card.

### hiddenTabs prop in QuestionTabs — no activeTab guard (RESOLVED in commit 9d9e898)
**First seen:** commit 2475dc6 (2026-03-12)
**File:** `apps/web/app/app/quiz/_components/question-tabs.tsx`
**Pattern:** `QuestionTabs` previously had no activeTab reset guard. Now uses a `useEffect`
that resets `activeTab` to the first visible tab when the active tab is hidden. The ISSUE is
resolved for the existing pattern.
**New watch item (commit 9d9e898):** `onTabChange` is in the useEffect dependency array. If the
parent ever passes an unstable inline arrow function as `onTabChange`, the effect can fire
on every render cycle (SUGGESTION — see patterns below). Currently safe because call sites use
setState directly. Watch for any new call site passing an inline handler.
**Watch for:** unstable `onTabChange` references at call sites.

### useNavigationGuard — guard still active after successful submission redirect
**First seen:** commit e8d70fc (2026-03-12)
**File:** `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts`
**Pattern:** The original code had `useNavigationGuard(answers.size > 0 && !result)` which
cleared the guard after a successful submit. The new code uses `useNavigationGuard(answers.size > 0)`
with no post-submit clear. After `router.push(...)` is called, React state hasn't been torn down
yet, so `answers.size > 0` is still true for the brief window before navigation completes.
In practice the browser nav happens fast enough that this is cosmetically harmless — the guard
fires at most on an edge-case race — but it is technically a regression from the old behavior.
**Status: RESOLVED in commit a269284** — `use-quiz-state.ts` now uses
`useNavigationGuard(answers.size > 0 && !submitted.current)`. The `submitted` ref is set to
`true` before `router.push`, so the guard clears before navigation completes. Correct fix.

## Positive Patterns

### FSRS best-effort scheduling with try/catch
**File:** `apps/web/app/app/quiz/actions/submit.ts`, `apps/web/app/app/quiz/actions/batch-submit.ts`, `apps/web/app/app/review/actions.ts`
All three paths wrap `updateFsrsCard` in try/catch so that a scheduling failure never blocks
answer submission. Consistent across the entire codebase.

### Auth-before-Zod pattern now consistently applied in startQuizSession and review/actions.ts
`startReviewSession` already had auth before parse. `startQuizSession` now matches it.
`batchSubmitQuiz` (commit 54e9351) also follows the pattern correctly.

### Deferred-write client state model (commit 54e9351)
`quiz-session.tsx` stores answers in a `Map<string, StoredAnswer>` and only sends to the server
on final submission. This is correct for the deferred-write design. The Map key is question ID,
so re-answering the same question overwrites rather than appends — correct behavior for
a practice quiz where a student can change their mind before submitting.

### answerStartTime reset on navigation (commit 54e9351)
`quiz-session.tsx` line 59: `answerStartTime.current = Date.now()` is correctly reset on
every `navigate()` call, so `responseTimeMs` measures time on the current question, not
cumulative session time. The deferred architecture preserves per-question timing.

### quiz-report.ts — correct answer stripping server-side before type boundary
`buildReportQuestions()` maps options to `{ id, text }` only, removing `correct: boolean`
before the data is returned as `QuizReportData`. The `QuizReportQuestion` type does not include
`correct` on options. The correct answer is exposed only as `correctOptionId: string`, which
is the ID of the correct option, not a boolean flag on every option. This is the right pattern
for post-session reports.

### ReportCard is 'use client' but receives only safe data
`ReportCard` is a client component that receives `QuizReportData` (already stripped of `correct`
flags on options). The data boundary between server and client is clean.

## High-Scrutiny Files
- `apps/web/proxy.ts` — auth flow, cookie handling, redirects
- `apps/web/app/auth/callback/route.ts` — PKCE code exchange, session creation
- `apps/web/app/app/quiz/actions/batch-submit.ts` — single atomic batch RPC; watch FSRS positional index alignment
- `apps/web/app/app/quiz/actions/submit.ts` — individual submit, no try/catch wrapper (ZodError propagates)
- `apps/web/app/app/quiz/actions/complete.ts` — completeQuiz, no try/catch wrapper (ZodError propagates)
- `apps/web/lib/queries/load-session-questions.ts` — Server Action serving questions; verify auth check is present
- `apps/web/lib/queries/quiz-report.ts` — direct questions SELECT post-session; verify correct stripping stays in buildReportQuestions
- `apps/web/app/app/_components/app-shell.tsx` — fullscreen detection via pathname string matching; could false-positive on future routes
- `packages/db/src/admin.ts` — service role key usage
- `supabase/migrations/20260312000011_batch_submit_rpc.sql` — score query counts all session answers; watch if submission paths diverge

### server.ts — broad catch swallows all setAll errors, not just read-only
**First seen:** commit 2b10602 (2026-03-12)
**File:** `packages/db/src/server.ts` — `setAll` cookie handler
**Pattern:** The bare `catch {}` block is deliberately swallowing the read-only cookie
error thrown by Next.js when `setAll` is called from a Server Component context. The
fix is correct and matches the official Supabase SSR pattern. The suggestion is to
narrow the catch to only swallow the read-only error, so any other exception thrown
inside `setAll` (malformed cookie value, etc.) would propagate instead of being silently
discarded. Non-blocking — acceptable as-is given it matches the Supabase sample.
**Status:** SUGGESTION. Not filed as ISSUE because the current Supabase SSR sample
uses the same broad catch and the failure modes are low-risk in this context.

### finally-block re-enables loading state during navigation (commit 9d9e898)
**First seen:** commit 9d9e898 (2026-03-12)
**File:** `apps/web/app/app/quiz/_components/quiz-config-form.tsx`
**Pattern:** Using `finally` to call `setLoading(false)` after a try/catch that includes a
`router.push` + `return` on success causes the loading state to be cleared during navigation.
The component is still mounted while navigation is in-flight, so the button re-enables briefly,
opening a double-submit window.
**Fix pattern:** Only call `setLoading(false)` in error/catch branches. Let the loading state
remain true until the component unmounts naturally on navigation.
**Watch for:** any handler that calls `setLoading(false)` in `finally` when there is a
`router.push` success branch inside the same try block.

### silent error on best-effort async operations (commit 9d9e898)
**First seen:** commit 9d9e898 (2026-03-12) — `resume-draft-banner.tsx` discard handler
**Pattern:** Fire-and-forget or "best-effort" async calls that fail silently leave the user
with no feedback. In `ResumeDraftBanner`, a failed `deleteDraft()` causes the banner to
stay visible with no error message and no indication of failure to the user.
**Fix pattern:** Even for best-effort operations, expose a visible error state when the
operation touches something the user explicitly triggered (button click). Reserve true
silent-failure (fire-and-forget, `.catch(() => {})`) only for background operations the
user didn't directly initiate (e.g., auto-save, telemetry).
**Watch for:** any handler where `result.success === false` has no corresponding UI error state.

### deleteDraft — Supabase delete error silently swallowed (first seen commit a269284)
**First seen:** commit a269284 (2026-03-12)
**File:** `apps/web/app/app/quiz/actions/draft.ts` — `deleteDraft`
**Pattern:** `await supabase.from('quiz_drafts').delete().eq(...)` is awaited but the result
is not destructured. If Supabase returns `{ error: ... }` (e.g., RLS rejection, network error),
the error is silently dropped and the function returns `{ success: true }`.
The `ResumeDraftBanner` discard handler (added in this commit) now correctly shows an error when
`result.success === false`, but because `deleteDraft` can return `{ success: true }` even on DB
failure, the user sees no error and the draft is still present on next load.
**Fix pattern:** Destructure `{ error }` from the delete call and return `{ success: false }`
if `error` is non-null.
**Watch for:** any Supabase mutation (insert/update/delete/upsert) where the return value is
`await`ed but not destructured — the error is always in the returned object, not thrown.

### finally-block re-enables loading state during navigation (RESOLVED in commit a269284)
**First seen:** commit 9d9e898 (2026-03-12)
**Status: RESOLVED in commit a269284** — `useQuizConfig` hook no longer uses `finally`.
`setLoading(false)` is only called in the error branch and catch block. Loading stays
true during navigation, preventing the double-submit window.

### sessionStorage subject metadata — unvalidated cast on read (RESOLVED in commit 2454c28)
**First seen:** commit 0176634 (2026-03-12)
**Status: RESOLVED in commit 2454c28** — `SaveDraftInput` now has `z.string().max(100)` on
`subjectName` and `z.string().max(10)` on `subjectCode`. Any oversized value from sessionStorage
is rejected at the Server Action boundary with a clear Zod error before reaching the DB.
**File:** `apps/web/app/app/quiz/session/_components/quiz-session-loader.tsx`
**Pattern:** `JSON.parse(raw) as SessionData` casts the full sessionStorage blob to `SessionData`
including the new `subjectName` and `subjectCode` fields. No Zod or runtime validation is applied
to the parsed object, so a malformed or attacker-modified sessionStorage entry (possible in same-origin
extension attack) can pass strings of any length or shape as `subjectName`/`subjectCode`. These values
are forwarded to `QuizSession` props and then into `saveDraft` (a Server Action with Zod validation).
**Watch for:** `JSON.parse(...) as T` on sessionStorage without runtime validation. If any field from
sessionStorage is ever used in a sensitive context (SQL interpolation, redirect URL) without a
server-side Zod guard, escalate to ISSUE.

### SavedDraftCard renders in a Server Component page with a client-only early return (first seen commit 0176634)
**First seen:** commit 0176634 (2026-03-12)
**File:** `apps/web/app/app/quiz/_components/saved-draft-card.tsx`
**Pattern:** `SavedDraftCard` is `'use client'` and contains an early `if (!draft) return ...`
before the `DraftCard` inner component. This is fine — the `draft` prop is passed from the
Server Component `QuizPage` and React serializes it across the RSC boundary correctly.
`null` is a valid serializable prop. The pattern is correct.
**Positive signal:** drafts tab uses data-testid on interactive elements (resume-draft, delete-draft)
throughout, making tests reliable.

### useQuizNavigation extract — navigate closure captures stale currentIndex at init (first seen commit 0176634)
**First seen:** commit 0176634 (2026-03-12)
**File:** `apps/web/app/app/quiz/session/_hooks/use-quiz-navigation.ts` line 24
**Pattern:** `navigate: (d: number) => navigateTo(currentIndex + d)` is returned from the hook.
`currentIndex` here is captured from the most recent render's closure — this is correct React
behavior, as the hook re-executes on every render. However, if `navigate` is ever memoized
(e.g., wrapped in `useCallback` by a consumer or passed as a stable ref), the closure would
stale and `currentIndex + d` would compute from the initial value. Currently no memoization
is applied and the hook is used directly, so the closure is fresh on every render. Safe as-is.
**Watch for:** any consumer that memoizes or stores `nav.navigate` in a `useRef` or `useCallback`.

### test vs. production field name mismatch — safe in commit 2454c28, watch for future
**First seen:** commit 2454c28 (2026-03-12)
**File:** `apps/web/app/app/quiz/_hooks/use-quiz-config.test.ts` (new test, line 213)
**Pattern:** The test asserts `stored.subjectCode === 'ALW'`. The production hook writes
`subjectCode: selectedSubject?.short` (line 85 of `use-quiz-config.ts`). The test fixture
defines `short: 'ALW'` on SUBJECTS. This is consistent and correct — no mismatch.
However, the `SubjectOption` type has both `code` and `short` fields. If a future refactor
renames `short` → `code` in the hook, this test would catch it. The distinction between `code`
and `short` is a latent naming confusion in the domain type.
**Severity:** GOOD — currently correct and well-tested. Watch for `code` vs `short` drift.

### E2E race: last-answer state vs. immediate "Finish Test" click (first seen commit 9b624ff)
**First seen:** commit 9b624ff (2026-03-12)
**Files:** `apps/web/e2e/progress.spec.ts` lines 33-47
**Pattern:** The `for` loop calls `page.getByRole('button', { name: 'Submit Answer' }).click()`
on the final question, then immediately calls `page.getByRole('button', { name: 'Finish Test' }).click()`
without waiting for React state to propagate. "Submit Answer" fires `handleSelectAnswer` which
calls `setAnswers(prev => new Map(prev).set(...))`. React batches setState and flushes
asynchronously. If "Finish Test" is clicked before the flush, `answers.size` is one short and
`handleSubmit` submits an incomplete batch — the last question is scored as unanswered.
**Fix pattern:** Assert progress bar reaches 100% before clicking "Finish Test":
`await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute('style', /100%/)`
**Severity:** ISSUE — real test reliability gap and mirrors a real-world fast-click race.
**Watch for:** any E2E test that clicks "Finish Test" or "Submit Quiz" immediately after
a state-modifying button click with no intermediate assertion.

### E2E race: last-answer state vs. immediate "Finish Test" click — RESOLVED in commit 7f7eed8
**First seen:** commit 9b624ff (2026-03-12)
**Status: RESOLVED in commit 7f7eed8** — Both `quiz-flow.spec.ts` and `progress.spec.ts` now
wait for `[data-testid="progress-bar"]` to reach `style` matching `/100%/` before clicking
"Finish Test". Because the progress bar width is derived from `answers.size / totalQuestions * 100`,
Playwright's DOM assertion serializes correctly against the React setState flush. The last
question's answer is guaranteed to be in the Map before `handleSubmit` reads it.
**Additional fixes in same commit:**
- Dialog selector changed from fragile `getByText('Finish Quiz')` (matched h2 text) to
  `getByRole('dialog', { name: 'Finish quiz' })` (targets the `<dialog aria-label="Finish quiz">` element).
- Score regex changed from literal `'%'` (false-positive substring match) to `/\d+%/`
  (precise match for the `{rounded}%` render output).
**Watch for:** E2E tests that click "Finish Test" or "Submit Quiz" immediately after a
state-modifying button click without an intermediate assertion that the state update landed.

### SECURITY DEFINER RPC WHERE-clause identity guard vs. RAISE EXCEPTION guard (commit 86c8da4)
**First seen:** commit 86c8da4 (2026-03-12)
**Files:** `supabase/migrations/20260312000014_analytics_rpcs_plpgsql.sql` — `get_daily_activity`, `get_subject_scores`
**Pattern:** Both RPCs correctly raise for `auth.uid() IS NULL`. However, the cross-tenant
identity check (`auth.uid() = p_student_id`) is enforced only as a WHERE predicate in the
data query, not as a second explicit RAISE guard. An authenticated user passing another
student's UUID gets zero rows (silent rejection) rather than a raised exception. This does
not leak data, but it violates the defense-in-depth model: the intent of plpgsql conversion
was to add RAISE EXCEPTION guards for all unauthorized access, not just anonymous access.
**Correct pattern:**
```sql
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
IF auth.uid() != p_student_id THEN RAISE EXCEPTION 'forbidden'; END IF;
```
**Watch for:** any SECURITY DEFINER function where `auth.uid() = p_student_id` appears
only in a WHERE clause without a corresponding RAISE guard for the mismatch case.

### null-data swallow after Supabase error guard (commit 86c8da4)
**First seen:** commit 86c8da4 (2026-03-12)
**File:** `apps/web/lib/queries/reports.ts` — `getAllSessions` subjects fetch
**Pattern:** `if (subjectsError) throw ...` guards the explicit error case, but the
`subjectMap` is built with `(subjects ?? [])`. If Supabase returns `{ data: null, error: null }`
(valid in edge RLS cases), `subjects` is null, the map is empty, and all session rows lose
their subject names with no error thrown. The fix in this commit correctly destructures
`subjectsError` and guards it, but `subjects ?? []` is still a silent data-loss path.
**Correct pattern:** After the error guard, add `if (!subjects) throw new Error(...)`,
then use `subjects` directly (not `subjects ?? []`).
**Watch for:** any query result that uses `?? []` or `?? {}` as a fallback after a separate
`if (error) throw` guard — the fallback can swallow null data that should also be an error.
Also watch for future test scenarios testing partial submission — the 100% flush gate would
deadlock; use a count-based style assertion (`/66%/`) or explicit partial-count wait instead.

### batch_submit_quiz — score denominator/numerator mismatch on partial batch (commit b312922)
**First seen:** commit b312922 (2026-03-12)
**File:** `supabase/migrations/20260312000011_batch_submit_rpc.sql` lines 103-109
**Pattern:** `v_total` is now read from `quiz_sessions.total_questions` (session scope), but
`v_correct_count` is counted from all rows in `quiz_session_answers` for the session. If the
batch submitted is smaller than `total_questions` (no server-side guard enforces equality), the
denominator is the full session count while the numerator reflects only submitted answers.
Skipped questions inflate the denominator without contributing to the numerator, under-scoring.
**Fix:** Guard `jsonb_array_length(p_answers) != v_total` and raise exception if mismatch.
This enforces the deferred-write contract that the batch is always complete.
**Watch for:** any future path where `batch_submit_quiz` is called with a partial answer list.
**Status:** ISSUE — filed in review of commit b312922.

### type declaration between import statements (commit b312922)
**First seen:** commit b312922 (2026-03-12)
**File:** `apps/web/app/app/quiz/session/_hooks/quiz-submit.ts` lines 1-4
**Pattern:** A `type` alias is declared between two `import` blocks. Cosmetically unusual;
Biome may not flag it. Correct placement is after all imports.
**Watch for:** type declarations interspersed in import sections after future import refactors.

### count state not clamped on maxQuestions decrease (commit b312922)
**First seen:** commit b312922 (2026-03-12)
**File:** `apps/web/app/app/quiz/_hooks/use-quiz-config.ts` / `quiz-config-form.tsx`
**Pattern:** Label and range input clamp via `Math.min(count, maxQuestions || 1)` at render time,
but `count` state is not reset when `maxQuestions` drops. If the user switches to a smaller subject,
the displayed value clamps correctly, but the state holds the old value. If `maxQuestions` rises
again before clicking Start, the count jumps back to the stale value unexpectedly.
Protected at server boundary by `Math.min(count, maxQuestions || 1)` in `handleStart`.
**Watch for:** any new subject-change path that needs to reset dependent state.

### finally-block clearing loading state — correct for non-navigation actions (commit b312922)
**Status: PATTERN CONFIRMED** — `resume-draft-banner.tsx` `handleDiscard` correctly uses `finally`
to clear `setDiscarding(false)` because discard does not trigger navigation. This is the safe case.
Contrast with the documented anti-pattern where `setLoading(false)` in `finally` re-enables a
button during an in-flight `router.push`. The key distinction: navigation handlers must not clear
loading in `finally`; non-navigation handlers should use `finally` for correct cleanup.

### fetchQuestionStats — Server Action missing Zod validation on questionId (commit 845923b)
**First seen:** commit 845923b (2026-03-12)
**File:** `apps/web/app/app/quiz/actions/fetch-stats.ts`
**Pattern:** `fetchQuestionStats(questionId: string)` is a `'use server'` Server Action that
accepts a raw string without Zod validation. All sibling actions (`start.ts`, `submit.ts`,
`batch-submit.ts`) validate with Zod before any DB access. A non-UUID string would cause Postgres
to return empty results silently instead of failing fast with a validation error.
**Fix:** Add `z.object({ questionId: z.string().uuid() }).parse({ questionId })` at the top of the action.
**Watch for:** thin one-liner Server Action wrappers that pass-through to lib/queries without Zod validation.

### SECURITY DEFINER RPCs using LANGUAGE sql return empty rows on null auth.uid() (commit 845923b)
**First seen:** commit 845923b (2026-03-12)
**File:** `supabase/migrations/20260312000013_analytics_rpcs.sql`
**Pattern:** `get_daily_activity` and `get_subject_scores` use `LANGUAGE sql STABLE SECURITY DEFINER`
with `WHERE auth.uid() = p_student_id` as the auth guard. The established project pattern
(002_rpc_functions.sql) uses `LANGUAGE plpgsql` with `IF v_student_id IS NULL THEN RAISE EXCEPTION`.
The `LANGUAGE sql` approach silently returns zero rows when called unauthenticated rather than raising.
Not an access-control gap (data is still not returned for wrong students), but diverges from the
defensive pattern and produces no error log entry.
**Watch for:** new SECURITY DEFINER RPCs that use LANGUAGE sql with WHERE-based auth instead of plpgsql RAISE.

### Supabase query errors silently dropped without { error } destructuring (commit 845923b)
**First seen:** commit 845923b (2026-03-12)
**Files:** `apps/web/lib/queries/question-stats.ts`, `apps/web/lib/queries/reports.ts`
**Pattern:** Multiple `.from(...)` queries await without destructuring `{ error }`. Supabase never
throws — errors are in `result.error`. DB failures silently return as "0 count" or "empty array".
This is now a second occurrence (first: `deleteDraft` in commit a269284).
**Pattern count:** 2 occurrences — rule already documented in code-style.md. Enforce in review.
**Watch for:** `const { count } = await supabase.from(...)` or `const { data } = await supabase.from(...)`
without a paired `error` check in any new lib/queries file.

### startTransition wrapping a .then() chain — loading state set inside microtask (commit 845923b)
**First seen:** commit 845923b (2026-03-12)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.tsx` lines 21-31
**Pattern:** `startTransition(() => { fetchQuestionStats(...).then(...setStats...).catch(...) })`.
`startTransition` marks the work as non-urgent for React scheduling but the `.then/.catch` callbacks
run as microtasks, outside the transition batch. `setLoading(false)` inside `.then` is not
part of the transition and may cause an extra render cycle. The correct pattern for Server Action
calls that update loading state is `useTransition()` hook: `const [isPending, startTransition] = useTransition()`.
`isPending` reflects the transition status correctly. Minor — not a user-visible bug in practice.
**Watch for:** `startTransition(() => { asyncFn().then(...setState...) })` — the promise callbacks
execute outside the transition boundary.

### getQuestionStats — two sequential COUNT queries on same table scope (commit 845923b..385017a)
**First seen:** commit range 845923b..385017a (2026-03-12)
**File:** `apps/web/lib/queries/question-stats.ts` — `getResponseCounts`
**Pattern:** `getResponseCounts` issues two `await supabase.from('student_responses').count()`
calls sequentially — one for `total`, one for `correct`. Between the two counts a new response
row could be appended. `incorrectCount = total - correct` would then undercount or even go
negative in theory. The three higher-level helpers in the same file (`getResponseCounts`,
`getFsrsCard`, `getLastResponse`) are called via `Promise.all`, but the two internal counts
inside `getResponseCounts` are sequential and not isolated by a transaction.
**Fix:** Collapse into a single query (via RPC or `.select('is_correct')` with client aggregation)
to guarantee a consistent snapshot.
**Watch for:** Any function that counts the same row set twice in two sequential queries without
a transaction, where the target table is mutable or append-only.

### `as string & keyof never` cast on direct .from() queries (commit 845923b..385017a)
**First seen:** commit range 845923b..385017a (2026-03-12)
**File:** `apps/web/lib/queries/question-stats.ts` — `getResponseCounts`
**Pattern:** `as string & keyof never` suppresses TypeScript's column-name check on `.eq()` and
`.order()` calls. This is the correct workaround only for RPC calls via `supabase-rpc.ts` where
the generated type resolves to `never`. For direct `.from()` queries, use `.returns<RowType[]>()`
instead — it overrides the return type without silencing the column-name narrowing.
The two other helpers in the same file (`getFsrsCard`, `getLastResponse`) correctly use
`.returns<>()`. `getResponseCounts` is the outlier.
**Watch for:** `as string & keyof never` on `.eq()`, `.order()`, `.not()` inside direct `.from()`
queries in any new `lib/queries/*.ts` file.

### StatisticsTab — loaded stats not reset on questionId change (commit 845923b..385017a)
**First seen:** commit range 845923b..385017a (2026-03-12)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.tsx`
**Pattern:** `stats` state is set once on "Load Statistics" click and never cleared when the
`questionId` prop changes. Users navigating to a different question see the previous question's
stats until they reload.
**Fix:** `useEffect(() => { setStats(null); setError(null) }, [questionId])`
**Watch for:** any client component that holds fetched data in local state keyed by a prop that
can change without triggering a remount (i.e., the component is not re-keyed on prop change).

### getUser authError not checked in sibling query files (commit 2190dd5 → RESOLVED commit 3a0d1e6)
**First seen:** commit 2190dd5 (2026-03-12)
**Files fixed:** `apps/web/lib/queries/analytics.ts` — `getDailyActivity`, `getSubjectScores`
**Pattern:** `supabase.auth.getUser()` returns `{ data: { user }, error }`. Network failures or
expired refresh tokens set `error` non-null while `user` is null. Before this fix, the code
checked only `if (!user)` — both a missing-user case and an auth network error collapsed to
the same generic "Not authenticated" message, and the distinction was lost. The fix correctly
destructures `error: authError` and throws a specific message when `authError` is non-null,
then checks `!user` separately for the clean unauthenticated case.
**Behavioral note:** The order is important — `authError` checked first, `!user` second. An auth
error implies user is null but the reverse is not true (user can be null without an error on a
clean unauthenticated request). Correct ordering confirmed in all functions.
**RESOLVED in commit 3a0d1e6:** All six remaining sibling files now destructure and check
`authError`. The fix is applied uniformly across the entire `lib/queries/` family.
**FULLY RESOLVED in commit 78cb130:** `quiz-report.ts` and `load-session-questions.ts` now also
log auth failures before their early returns. Every `lib/queries/*.ts` file now has both
`authError` destructuring + a log entry on failure.
**Watch for:** any new `lib/queries/*.ts` file that calls `supabase.auth.getUser()` — require
`error: authError` destructure, a server-side log on authError, and a guard before the `!user` check.

### quiz-report.ts authError silent swallow (RESOLVED commit 78cb130)
**First seen:** commit 3a0d1e6 (2026-03-12)
**Status: RESOLVED in commit 78cb130** — `console.error('[getQuizReport] Auth error:', authError.message)`
added before `return null`. Auth failures now produce a server log entry. The null-return contract
is preserved. Fix matches the pattern used by sibling null-return functions.

### load-session-questions.ts authError message exposed in client UI (RESOLVED commit 78cb130)
**First seen:** commit 3a0d1e6 (2026-03-12)
**Status: RESOLVED in commit 78cb130** — authError branch now logs the specific message server-side
and returns the generic `'Not authenticated'` string. Matches the `!user` branch below it.
Raw Supabase error strings no longer reach the student UI.

### authError test coverage gap — new branches not tested (RESOLVED commit 78cb130)
**First seen:** commit 3a0d1e6 (2026-03-12)
**Status: RESOLVED in commit 78cb130** — All seven query files with authError branches now have
a paired test case. `quiz-report.test.ts`, `load-session-questions.test.ts`,
`dashboard.test.ts`, `progress.test.ts`, `review.test.ts` (x2), `question-stats.test.ts`,
and `reports.test.ts` all test the authError path. The `quiz-report` test uses
`mockResolvedValueOnce` and asserts `result === null` — a genuine regression guard.
**Residual watch:** the existing "returns null when user is not authenticated" test in
`quiz-report.test.ts` uses a persistent `mockResolvedValue` mock (not `Once`). A future test
inserted before the next mock reset could silently inherit null-user state. Non-blocking.
**Watch for:** any commit adding `if (authError)` branches without a paired test case.

### setIsLoading(false) called unconditionally in render body — spurious re-render on question switch (commit 53efbdd)
**First seen:** commit 53efbdd (2026-03-13)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.tsx` lines 20-26
**Pattern:** The question-switch guard calls `setIsLoading(false)` during the render body
unconditionally, even when `isLoading` is already `false`. React schedules a state update on
every question switch regardless, triggering an extra re-render cycle. When a fetch is in progress
and the user navigates rapidly, this produces a render storm (one extra render per question switch).
The generation counter correctly prevents stale state from landing in the UI, so there is no
user-visible artifact — but the wasted renders are real.
**Fix:** Guard the call: `if (isLoading) setIsLoading(false)`.
**Root cause:** Replacing `isPending` (a read during render, no state write) with `setIsLoading(false)`
(a state write during render) changed a zero-cost derived read into a scheduled update. The
generation-counter approach is correct but this particular line needs the guard.
**Watch for:** any `setState(false)` call inside a "derive during render" guard block (the
`prevProp.current !== currentProp` pattern). Always guard with the current value check.

### useTransition + manual useState loading — hybrid creates theoretical scheduler mismatch (commit 53efbdd)
**First seen:** commit 53efbdd (2026-03-13)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.tsx` line 14
**Pattern:** `startTransition` is retained for wrapping the async fetch, but `isPending` is
discarded in favor of manual `isLoading` state. In React 19's concurrent scheduler, a
transition can be interrupted and restarted. If that happens, `setIsLoading(true)` (called
before `startTransition`) and the transition callback (called inside) may be associated with
different batches. The `isLoading` state could become `true` with no running transition to
clear it. In practice the generation-counter would cover a subsequent question switch, but
within the same question the user could see a stuck skeleton.
**Recommended pattern:** Either use `isPending` exclusively (derive loading from the
transition — solve the original stale-pending bug via `key={questionId}` remount), or drop
`startTransition` entirely and use a plain `async` function with manual state only.
**Watch for:** any component that mixes `startTransition` with a separate `useState` for the
same loading concept — the two can desync under concurrent rendering.

### boundParam NaN guard fallback is silent — no server log on invalid input (commit 53efbdd)
**First seen:** commit 53efbdd (2026-03-13)
**File:** `apps/web/lib/queries/analytics.ts` — `boundParam`
**Pattern:** Non-finite input is correctly clamped to `min`, but the non-finite branch has no
`console.warn`. A caller passing `NaN` (e.g., `parseInt('')`) silently gets a 1-item result
with no server log. The security behavior is correct; the observability is not.
**Fix:** Add `console.warn('[boundParam] Non-finite value, clamping to min:', { value, min, max })`
in the non-finite branch.
**Watch for:** silent clamping/fallback functions for numeric RPC parameters — always log when
the fallback fires so the cause is visible in server logs.

### setIsLoading(false) guard — RESOLVED in commit b555b50
**First seen:** commit 53efbdd (2026-03-13)
**Status: RESOLVED in commit b555b50** — `if (isLoading) setIsLoading(false)` replaces the
unconditional call. The guard eliminates the spurious re-render on every question switch when
`isLoading` is already `false`. The render-body pattern is now correct.
**Verified:** New test "shows load button immediately when questionId changes during an in-flight fetch"
directly exercises the guard path — it asserts the load button reappears before the stale fetch
resolves. Coverage is complete.

### isLoading guard in render body — test coverage confirms fix (commit b555b50)
**New test added:** `statistics-tab.test.tsx` — "shows load button immediately when questionId
changes during an in-flight fetch" blocks the q-1 fetch with a deferred promise, then rerenders
with `questionId="q-2"`. Asserts the load button appears before `resolveQ1()` is called, and
that stale q-1 data never lands. This is a strong regression test for the render-body guard.

### useTransition + manual isLoading hybrid — still unresolved after hook extraction (commit f0f8d0e)
**First seen:** commit 53efbdd (2026-03-13)
**Status:** SUGGESTION — 2nd occurrence. The extraction of `useQuestionStats` in commit f0f8d0e
did not resolve the `startTransition` + `isLoading` hybrid. The design debt is now isolated
in the hook body, which makes it easier to fix, but it is not fixed.
**Occurrence count:** 2 (53efbdd, f0f8d0e). No user-visible bug has been reported.
**Pattern:** `startTransition` wraps the async fetch but `isPending` is unused; `isLoading`
state is managed manually. In React 19 concurrent mode, the two can desync if a transition
is interrupted. Fix: either use `isPending` as the sole loading signal, or drop `startTransition`
entirely and use a plain async function with manual state only.
**Watch for:** any refactor of `useQuestionStats` — the hybrid is the remaining design debt.

### waitFor wrapping .not.toBeInTheDocument — correct but masks fast-failure (commit f0f8d0e)
**First seen:** commit f0f8d0e (2026-03-13)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.test.tsx` line 193
**Pattern:** `await waitFor(() => expect(x).not.toBeInTheDocument())` is the right fix for
a race against a microtask flush, but it delays test failure by the full `waitFor` timeout
(1000ms default) when the element IS present. Prefer asserting the positive expected state
first (`expect(loadButton).toBeInTheDocument()`), then asserting absence synchronously after.
This gives a fast failure signal when the generation guard breaks.
**Severity:** SUGGESTION — test is correct and catches regressions. Improvement is for
failure-diagnosis speed only.

### hook extraction without JSDoc on non-obvious render-body pattern (commit f0f8d0e)
**First seen:** commit f0f8d0e (2026-03-13)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.tsx` — `useQuestionStats`
**Pattern:** When extracting logic into a hook, render-body `setState` calls (the
`prevProp.current !== currentProp` pattern) should be documented. Future reviewers
encountering `setState` during a hook's render body may flag it as a violation before
understanding the React-sanctioned derived-state-from-props pattern. A single JSDoc
comment prevents this false-positive review cycle.
**Watch for:** hooks containing render-body `setState` that lack an explanatory comment.

### ActivityChart three-layer split — positive pattern (commit f0f8d0e)
**File:** `apps/web/app/app/dashboard/_components/activity-chart.tsx`
**Pattern:** Pure data formatter (`formatActivityData`) → pure renderer (`ChartBody`) →
orchestrator with side effects (`ActivityChart` — hydration guard + empty state).
Hydration guard remains at the outermost layer; recharts DOM reads are protected.
All three functions are under 30 lines. This is the reference pattern for splitting
client components that mix hydration concerns with data rendering.

## CodeRabbit Findings to Learn From
- Cookie forwarding consistency across redirect branches (PR #23)
- Query param forwarding to auth endpoints (PR #23)
- auth-before-parse ordering in Server Actions (PR #26, round 4)
- Partial-write failure disclosure in batch Server Actions (commit 54e9351)
- `finally` clearing loading state during navigation (commit 9d9e898)
- E2E race between client state update and immediate next action (commit 9b624ff)
- Progress-bar DOM attribute as flush gate for React setState (commit 7f7eed8)
- Score denominator/numerator mismatch when sourcing total from session vs. counting from batch (commit b312922)
- Thin Server Action pass-throughs skipping Zod validation (commit 845923b)
- LANGUAGE sql SECURITY DEFINER silent-empty vs. RAISE EXCEPTION pattern (commit 845923b)
- Partial auth-error handling across query family — fix applied to subset only (commit 2190dd5)
- Unconditional setState call in render-body guard triggers spurious re-renders (commit 53efbdd)
- useTransition + manual useState hybrid — theoretical scheduler mismatch in concurrent mode (commit 53efbdd)
- Hook extraction moves design debt but does not resolve it — review hooks for inherited issues (commit f0f8d0e)
