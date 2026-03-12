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

## CodeRabbit Findings to Learn From
- Cookie forwarding consistency across redirect branches (PR #23)
- Query param forwarding to auth endpoints (PR #23)
- auth-before-parse ordering in Server Actions (PR #26, round 4)
- Partial-write failure disclosure in batch Server Actions (commit 54e9351)
- `finally` clearing loading state during navigation (commit 9d9e898)
