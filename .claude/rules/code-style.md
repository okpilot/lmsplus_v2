# Code Style Rules — LMS Plus v2

> These rules apply to all code in this repository.
> The code-reviewer agent checks every commit against them.
> Violations are flagged as warnings (non-blocking) or errors (blocking on merge).

---

## 1. File Size Limits

| File type | Max lines | Action if exceeded |
|-----------|-----------|-------------------|
| React component | 150 lines | Split into sub-components |
| Page file (`page.tsx`) | 80 lines | Page should be composition only — no logic |
| Server Action file | 100 lines | Split by feature area |
| Utility / helper | 200 lines | Split by concern |
| Hook (`use*.ts`) | 80 lines | Split or extract logic to util |
| SQL migration file | 300 lines | Split into multiple migrations |

**The golden rule:** if you need to scroll to understand a file, it's too long.

A page file should look like this:
```tsx
// app/dashboard/page.tsx — CORRECT: pure composition, no logic
import { getStudentProgress } from '@/lib/progress'
import { DashboardHeader } from './_components/dashboard-header'
import { SubjectGrid } from './_components/subject-grid'
import { DueReviewsBanner } from './_components/due-reviews-banner'

export default async function DashboardPage() {
  const progress = await getStudentProgress()
  return (
    <main>
      <DashboardHeader />
      <DueReviewsBanner count={progress.dueCount} />
      <SubjectGrid subjects={progress.subjects} />
    </main>
  )
}
```

---

## 2. Component Rules

### Single Responsibility
One component does one thing. If you can describe what a component does and need the word "and", split it.

```
✅ QuestionCard          — displays a single question
✅ AnswerOptions         — handles option selection + submit
✅ FeedbackPanel         — shows result after submission
❌ QuestionWithAnswersAndFeedback  — does all three
```

### No Business Logic in Components
Components handle display and user interaction. All logic lives elsewhere.

```tsx
// ❌ WRONG — logic inside component
export function SubjectCard({ subjectId }: Props) {
  const [mastery, setMastery] = useState(0)
  useEffect(() => {
    supabase.from('student_progress')
      .select('mastery_percentage')
      .eq('subject', subjectId)
      .then(({ data }) => setMastery(data?.[0]?.mastery_percentage ?? 0))
  }, [subjectId])
  return <div>{mastery}%</div>
}

// ✅ CORRECT — data fetched in Server Component or hook, component just renders
export function SubjectCard({ mastery }: Props) {
  return <div>{mastery}%</div>
}
```

### Extract at 3 Repetitions
If a JSX pattern appears 3+ times, extract it into a component.

### `'use client'` Boundary — Push Down, Not Up
Default to Server Components. Add `'use client'` only at the lowest component that needs interactivity.

```
✅ Page (server) → Section (server) → InteractiveButton (client)
❌ Page (client) → everything is client-side rendered
```

---

## 3. Function Rules

### Max 30 Lines Per Function
If a function is longer than 30 lines, extract steps into named helper functions. Named helpers are self-documenting.

```ts
// ❌ WRONG — 60-line function doing everything
export async function submitAnswer(input: unknown) {
  // validation (10 lines)
  // auth check (8 lines)
  // fetch question (6 lines)
  // check correctness (10 lines)
  // update FSRS (15 lines)
  // write audit log (8 lines)
  // return result (3 lines)
}

// ✅ CORRECT — orchestrator + focused helpers
export async function submitAnswer(input: unknown) {
  const { questionId, sessionId, selectedOptionId } = SubmitAnswerSchema.parse(input)
  const student = await requireAuth()
  const isCorrect = await checkAnswer(questionId, selectedOptionId)
  await updateFsrsState(student.id, questionId, isCorrect)
  await logAuditEvent({ type: 'quiz.answer_submitted', actorId: student.id, ... })
  return { isCorrect, explanation: await getExplanation(questionId) }
}
```

**At the boundary:** Server Action orchestrators (30–35 lines) are acceptable when each line is a single responsibility (validation, auth, RPC call, side effect). If adding a new step requires scrolling, extract it.

### Max 3 Parameters
If a function needs more than 3 parameters, use an options object.

```ts
// ❌ WRONG
function scheduleReview(userId, questionId, wasCorrect, responseTime, sessionId) {}

// ✅ CORRECT
function scheduleReview(opts: {
  userId: string
  questionId: string
  wasCorrect: boolean
  responseTime: number
  sessionId: string
}) {}
```

**Exception: Infrastructure/utility functions** — Some utility functions are idiomatic exceptions (e.g., `updateFsrsCard(supabase, userId, questionId, isCorrect)` is 4 params but each maps to a distinct semantic role in the domain). Document the exception with a JSDoc comment if > 3 params.

### Early Returns Over Nesting
Fail fast. Avoid deeply nested if/else chains.

```ts
// ❌ WRONG — 3 levels deep
function processResult(session: Session | null) {
  if (session) {
    if (session.status === 'active') {
      if (session.answeredCount < session.totalQuestions) {
        return getNextQuestion(session)
      }
    }
  }
  return null
}

// ✅ CORRECT — flat, readable
function processResult(session: Session | null) {
  if (!session) return null
  if (session.status !== 'active') return null
  if (session.answeredCount >= session.totalQuestions) return null
  return getNextQuestion(session)
}
```

### Max Nesting: 3 Levels
Functions, loops, conditionals — count the levels of indent. At 4+, extract.

---

## 4. File and Folder Organisation

### Feature-Based, Not Type-Based

```
// ❌ WRONG — type-based (everything scattered)
components/
  QuestionCard.tsx
  SubjectGrid.tsx
  FeedbackPanel.tsx
hooks/
  useQuestion.ts
  useProgress.ts
types/
  question.ts
  progress.ts

// ✅ CORRECT — feature-based (related things co-located)
app/
  quiz/
    _components/
      question-card.tsx
      answer-options.tsx
      feedback-panel.tsx
    _hooks/
      use-quiz-session.ts
    actions.ts          ← Server Actions for this feature
    page.tsx
  dashboard/
    _components/
      subject-grid.tsx
    page.tsx
```

### Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| React component file | `kebab-case.tsx` | `question-card.tsx` |
| Component export | `PascalCase` | `export function QuestionCard` |
| Hook file | `use-*.ts` | `use-quiz-session.ts` |
| Server Action file | `actions.ts` | per feature folder |
| Utility file | `kebab-case.ts` | `format-score.ts` |
| Type file | `types.ts` | per feature folder |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_QUIZ_QUESTIONS` |
| DB migration | `YYYYMMDDHHMMSS_description.sql` | `20260311000001_initial_schema.sql` |

### No Barrel Files (index.ts re-exports)
Barrel files break tree-shaking, slow TypeScript, and create circular dependency risks.

```ts
// ❌ WRONG — packages/ui/src/index.ts re-exporting everything
export * from './question-card'
export * from './answer-options'
export * from './feedback-panel'

// ✅ CORRECT — import directly
import { QuestionCard } from '@repo/ui/question-card'
```

---

## 5. TypeScript Rules

### No Deprecated React Event Types

`React.FormEvent` is deprecated in React 19. Use `React.SubmitEvent<HTMLFormElement>` for form submit handlers.

```tsx
// ❌ WRONG — deprecated in React 19
function handleSubmit(e: React.FormEvent) { ... }
function handleSubmit(e: React.FormEvent<HTMLFormElement>) { ... }

// ✅ CORRECT
function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) { ... }
```

### No `any`
Use `unknown` with narrowing, or define the correct type.

```ts
// ❌ WRONG
function processData(data: any) { return data.value }

// ✅ CORRECT
function processData(data: unknown) {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return (data as { value: string }).value
  }
}
```

### No Non-Null Assertions Without Comment
```ts
// ❌ WRONG
const userId = session.user!.id

// ✅ CORRECT — justified with why it's safe
// Middleware guarantees session exists on /app/* routes
const userId = session.user!.id
```

### No Type Casting Unvalidated External Data
```ts
// ❌ WRONG
const body = await req.json() as SubmitAnswerInput

// ✅ CORRECT
const body = SubmitAnswerSchema.parse(await req.json())
```

When casting DB/RPC results via `as unknown as T`, pair the cast with a runtime guard before using the data. `as unknown as` silences TypeScript but creates no runtime guarantee.

```ts
// ❌ WRONG — cast assumes shape, .includes() throws on non-array
const config = (session as unknown as { ids: string[] }).ids
if (!config?.includes(questionId)) { ... }

// ✅ CORRECT — runtime guard matches the assumption
const config = (session as unknown as { ids: unknown }).ids
if (!Array.isArray(config) || !config.includes(questionId)) { ... }
```

**The cast-guard rule is not relaxed in test files.** An unguarded `data as unknown as T` on an RPC or `.select()` result in a `.test.ts` / `.integration.test.ts` throws an opaque `TypeError` ("Cannot read properties of null") on a null/shape regression instead of a clean assertion failure — masking the real cause. Guard the result before treating it as the typed shape: `expect(data).not.toBeNull()` then cast, or `Array.isArray(...)` / `typeof` before use. (Promoted count=4 — #818 red-team helper, #845, PR #927 [squash `fb2921c6`], PR #930 [squash `f4c76c83`]. The pre-existing offender sweep across the `packages/db` integration suite is tracked in #938.)

### Soft-Delete Filter Requires the Column to Exist

Only apply `.is('deleted_at', null)` (or `AND deleted_at IS NULL`) to a table that actually HAS a `deleted_at` column. Filtering a non-existent column is a schema-contract bug: PostgREST returns `42703 column ... does not exist` at runtime, but mocked Vitest chains ignore `.is()`, `tsc` accepts any string column name, and Biome can't see the schema — so it passes every pre-commit gate and breaks only in production. The seven no-soft-delete tables that lack the `deleted_at` column are `easa_subjects`, `easa_topics`, `easa_subtopics`, `quiz_session_answers`, `student_responses`, `audit_events`, `quiz_drafts` (hard-delete-by-design or immutable). This is the set the mechanical guard enforces; `docs/database.md` §3 documents the fuller no-soft-delete matrix (which also includes hard-delete-exception tables that retain a `deleted_at` column). A chain-aware mechanical guard enforces this at pre-commit + CI: `.claude/hooks/check-soft-delete-guard.mjs`. Origin: `.is('deleted_at', null)` on `easa_subjects` reached production and escaped every gate except semantic-reviewer (#925). The schema-aware successor (#933) generalizes this to any column on any table.

### Prefer `type` Over `interface`
Use `interface` only for objects that will be extended/implemented. Use `type` for everything else.

### Destructure Supabase Mutation Results
All Supabase mutation calls (`.insert()`, `.update()`, `.delete()`, `.upsert()`) must destructure `{ error }` from the return value. The Supabase client never throws on query errors — errors live in `result.error`. Awaiting without destructuring silently drops DB errors.

```ts
// ❌ WRONG — error silently dropped
await supabase.from('quiz_drafts').delete().eq('student_id', userId)
return { success: true }

// ✅ CORRECT — error checked
const { error } = await supabase.from('quiz_drafts').delete().eq('student_id', userId)
if (error) {
  console.error('[deleteDraft] Delete error:', error.message)
  return { success: false }
}
return { success: true }
```

**Zero-row no-op check:** For any DELETE or UPDATE that's expected to mutate rows — ownership-scoped via RLS, admin-context via service-key, or a test-cleanup helper — chain `.select('id')` and verify the returned array length. Supabase returns 200 OK with zero affected rows when the filter matches nothing or RLS blocks the write. Without this check, cross-user, wrong-ID, or filter-regressed calls silently succeed.

```ts
// ❌ WRONG — RLS blocks cross-user delete, but returns no error
const { error } = await supabase.from('comments').delete().eq('id', commentId)
if (error) return { success: false }
return { success: true }  // silent no-op if RLS blocked it

// ✅ CORRECT — verify a row was actually deleted
const { data, error } = await supabase.from('comments').delete().eq('id', commentId).select('id')
if (error) return { success: false }
if (!data?.length) return { success: false, error: 'Not found or not owned' }
return { success: true }

// ✅ CORRECT — service-role cleanup where zero rows IS valid; observability still required
const { data: discarded, error } = await admin
  .from('quiz_sessions')
  .update({ deleted_at: new Date().toISOString() })
  .eq('student_id', studentId)
  .is('ended_at', null)
  .select('id')
if (error) throw new Error(`cleanup: ${error.message}`)
if ((discarded?.length ?? 0) > 0) {
  console.log(`[cleanup] discarded ${discarded?.length} session(s)`)
}
```

### Destructure SELECT Query Results Too

`.select()` reads are subject to the same rule as mutations: destructure `{ error }` and check it before consuming `data`. Supabase does not throw on query errors — errors live in `result.error`. A read that destructures only `{ data }` silently treats an RLS-blocked or transport-failed query as an empty result (PostgREST returns `200 OK` with `null`/`[]`).

Match the surrounding error posture:
- **Server Component query helpers** (e.g. `lib/queries/*`) — `throw new Error(\`Failed to fetch X: ${error.message}\`)`, mirroring the sibling reads in the same file. The throw surfaces via `app/error.tsx` + Sentry.
- **Server Actions** — `console.error` server-side and return a generic domain message (never return `error.message` — see *Sanitize Error Messages*).

```ts
// ❌ WRONG — RLS-blocked read looks like an empty list
const { data: topics } = await supabase.from('easa_topics').select('id').eq('subject_id', id)
return (topics ?? []).map(...)

// ✅ CORRECT — query helper throws
const { data: topics, error } = await supabase.from('easa_topics').select('id').eq('subject_id', id)
if (error) throw new Error(`Failed to fetch topics: ${error.message}`)
return (topics ?? []).map(...)
```

**`.single()` / `.maybeSingle()` exception:** when a "no rows" result is an expected branch (e.g. computing the next `sort_order` on the first insert), `PGRST116` is not a failure — exempt it explicitly and handle real errors only:

```ts
const { data: maxRow, error } = await supabase
  .from('easa_subjects').select('sort_order').order('sort_order', { ascending: false }).limit(1).single<{ sort_order: number }>()
// PGRST116 (no rows) is the expected first-insert case — only a real error is a failure.
if (error && error.code !== 'PGRST116') {
  console.error('[upsertSubject] sort_order lookup error:', error.message)
  return { success: false, error: 'Failed to create subject' }
}
const sortOrder = (maxRow?.sort_order ?? -1) + 1
```

**Exception:** read-only test/setup helpers may wrap multiple chained reads in a single try/catch when the entire setup is atomic.

### `ON CONFLICT` Requires a UNIQUE Inference Target — Validate at Execution, Not Apply

An `INSERT ... ON CONFLICT (col, ...) [WHERE pred] DO ...` needs a **UNIQUE** index or constraint matching exactly that column set (and partial predicate). A plain `CREATE INDEX` (non-unique) does **not** qualify — Postgres raises `42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification`.

Critically, when the `INSERT ... ON CONFLICT` lives inside a **plpgsql function body**, the inference target is **not validated at `CREATE OR REPLACE FUNCTION` time — only at execution**. So `supabase db reset` applies the migration 100% clean, and `pg_get_functiondef(...) ILIKE '%on conflict%'` confirms the clause is present, yet the function throws `42P10` the first time it actually runs. Clean apply + structural grep is therefore **insufficient** for any migration that changes a plpgsql body containing `ON CONFLICT`, `EXECUTE format(...)`, regex literals (POSIX `[][...]` bracket-class shorthand is invalid in Postgres ARE — applies clean, throws `2201B` on first call; caught in mig 101, 2026-06-10), or other deferred-validation SQL — you must **execute the function** (a functional SQL test or the relevant red-team / integration spec) before trusting it.

Two more execution-only failure modes in the same deferred-validation class — each passed `db reset` + `tsc` + Biome + both Opus impl-critics + semantic-reviewer, and was caught ONLY by an integration test that executed the function (VFR RT Phase 2, #697; the #925 integration tier):

- **(c) Unqualified column name shadowed by a same-named `RETURNS TABLE` OUT parameter → `42702 column reference "<col>" is ambiguous`** (at execution, not at `CREATE`). A `WHERE id = ...` inside a function whose `RETURNS TABLE (id ...)` declares `id` is ambiguous between the OUT variable and the table column. **Always alias the source table in helper reads:** `FROM users u WHERE u.id = auth.uid()` — never `WHERE id = auth.uid()`. (mig 118 `get_quiz_questions`; the sibling `get_vfr_rt_exam_questions` already aliased, which is why it never hit this.)
- **(d) NULL propagating through a helper call into a NOT NULL column → `23502`.** `v := helper_fn(nullable_input)` where `helper_fn` may return NULL (e.g. `normalize_answer(NULL)`) and `v` — or a boolean derived from it like `(v <> '' AND …)`, which is NULL when `v` is NULL — lands in a NOT NULL column (`is_correct`). **Coalesce at the call site:** `coalesce(helper_fn(input), '<default>')`. Check sibling callers in the same migration family — if they already coalesce, the new one must too. (mig 120 batch_submit helper; the sibling grader mig 119 already coalesced.)

Before using `ON CONFLICT (cols) [WHERE pred]`, confirm a matching **UNIQUE** index exists (`indisunique = true`, same columns + predicate). If the existing index is non-unique and making it unique would require destructively de-duplicating a sensitive table, prefer a guarded `IF EXISTS (...) THEN RETURN; END IF;` pre-check inside the function instead (see `record_consent`, mig 085). **Precedent:** mig 085 originally shipped `ON CONFLICT (...) WHERE accepted = true` against the non-unique `idx_user_consents_lookup`; it applied clean but threw `42P10` on first call (caught by semantic-reviewer, #386).

### PostgREST Embedded Resources: Use `!` (FK-hint), Not `:` (alias)
The `:` operator in `.select()` aliases the result key but does NOT expand a foreign key. PostgREST may resolve the embedded resource by table name when there's a single FK, but on resolution failure (FK ambiguous, schema drift) it returns null silently — and downstream code that expected an object then operates on null. Use `!fk_column_name` to explicitly hint the FK; resolution failures error loudly.

```ts
// ❌ WRONG — `:` is an alias, returns null on resolution failure
.select('id, consumed_session_id, quiz_sessions:consumed_session_id (ended_at)')

// ✅ CORRECT — `!` is the FK hint, errors loudly on resolution failure
.select('id, consumed_session_id, quiz_sessions!consumed_session_id (ended_at)')
```

Same shape applies to nested resources, joined columns, and renamed embeds. Reserve `:` for genuine column-rename in the result, never as a substitute for `!` on FK expansion.

### Coerce BIGINT / NUMERIC Columns with `Number()`
PostgREST serializes `BIGINT` (`int8`), `NUMERIC`, and `DECIMAL` columns as JSON **strings**, not numbers — to preserve precision. Reading them into a `number`-typed field without coercion produces silent bugs: `===`/`<`/`>` comparisons fail (`"1" === 1` is `false`), arithmetic yields `NaN`, and `.toFixed()` throws. Coerce with `Number()` at the read site, before any comparison, arithmetic, or method call. Preserve `null` explicitly (`Number(null)` is `0`, not `null`).

```ts
// ❌ WRONG — total_count is BIGINT, arrives as "42"; the singular check never fires
const totalCount = rows[0]?.total_count ?? 0
if (totalCount === 1) renderSingular()        // "1" === 1 is false

// ✅ CORRECT — coerce at the read site
const totalCount = Number(rows[0]?.total_count ?? 0)

// ✅ CORRECT — NUMERIC with null preserved
scorePercentage: r.score_percentage === null ? null : Number(r.score_percentage)
```

Type the wire shape honestly (`count: number | string`) so a future reader can't strip the coercion thinking TypeScript already guarantees a number. **Precedent:** `quiz.ts` (total_time_ms), `profile.ts` (avg_score), `dashboard-stats.ts` (subject_count), `reports.ts` (total_count, answered_count, score_percentage).

### Sanitize Error Messages in Server Actions
Every `if (error)` block in a Server Action must either match a known error code (e.g. `23505`, `PGRST116`) and return a domain-specific message, or log server-side with `console.error` and return a generic string. Never return `error.message` directly — Postgres error strings can expose connection details, schema names, and internal state.

```ts
// ❌ WRONG — raw DB error leaked to client
if (error) return { success: false, error: error.message }

// ✅ CORRECT — log server-side, return generic string
if (error) {
  console.error('[actionName] DB error:', error.message)
  return { success: false, error: 'Failed to save question' }
}
```

### Log Every Error Path, Including Rollbacks
Every error path — including compensating (rollback) paths — must emit `console.error` before returning. Secondary error paths are not exempt from observability. If a rollback fails silently, the system enters an inconsistent state with no server-side signal.

```ts
// ❌ WRONG — rollback failure is invisible
if (insertErr) {
  await adminClient.auth.admin.deleteUser(authData.user.id)
  return { success: false, error: 'Failed to create student' }
}

// ✅ CORRECT — rollback failure is logged
if (insertErr) {
  console.error('[createStudent] Profile insert failed:', insertErr.message)
  const { error: rollbackErr } = await adminClient.auth.admin.deleteUser(authData.user.id)
  if (rollbackErr) {
    console.error('[createStudent] Rollback failed — orphaned auth user:', authData.user.id, rollbackErr.message)
  }
  return { success: false, error: 'Failed to create student' }
}
```

### No Hardcoded Supabase URLs
Never hardcode Supabase project-ref URLs (e.g. `https://xxxxx.supabase.co`) in source files. Derive from `process.env.NEXT_PUBLIC_SUPABASE_URL` in client components and from server-only env vars in Server Actions. Hardcoded URLs break local development where Supabase runs at `http://localhost:54321`.

### Export Types Next to Their Functions
```ts
// actions.ts
export type SubmitAnswerResult = { isCorrect: boolean; explanation: string }

export async function submitAnswer(...): Promise<SubmitAnswerResult> { ... }
```

---

## 6. Next.js App Router Patterns

### Server Actions for All Mutations
No API routes for mutations — use Server Actions.

```ts
// ✅ CORRECT
'use server'
export async function submitAnswer(input: unknown) { ... }
```

### API Routes Only for External Consumers
Route Handlers (`route.ts`) are for webhooks, third-party callbacks, and REST endpoints consumed outside the app.

### Data Fetching in Server Components
```tsx
// ✅ CORRECT — no useEffect, no loading state, no client-side fetch
export default async function DashboardPage() {
  const progress = await getStudentProgress()  // direct DB call, server-side
  return <SubjectGrid subjects={progress.subjects} />
}
```

### No `useEffect` for Data Fetching
`useEffect` for data fetching is a Next.js anti-pattern. Use Server Components or React Query if client-side freshness is needed.

### Approved `useEffect` Pattern: Hydration Guard
`useEffect` is valid and required for guarding client-only interactions against SSR hydration mismatches. This is not a data-fetching anti-pattern — the code-reviewer should not flag it.

```tsx
// ✅ CORRECT — prevents hydration mismatch on client-only state
const [hydrated, setHydrated] = useState(false)
useEffect(() => { setHydrated(true) }, [])
if (!hydrated) return <Skeleton />
```

Use this pattern when a component's initial render differs between server and client (e.g., reading `localStorage`, `window`, or client-only browser APIs).

### Re-throw Redirect Errors in Server Component Catch Blocks
Next.js uses throw-based control flow for `redirect()` and `notFound()`. Any `catch` block wrapping a call that may invoke these must check `isRedirectError(error)` and re-throw if true. A bare `catch {}` that does not check turns a redirect into a 500 or stale render.

```tsx
// ❌ WRONG — swallows redirect, shows fallback instead of redirecting
try {
  const data = await getProtectedData()
  return <DataView data={data} />
} catch {
  return <ErrorFallback />
}

// ✅ CORRECT — redirect propagates, only real errors show fallback
import { isRedirectError } from 'next/dist/client/components/redirect-error'

try {
  const data = await getProtectedData()
  return <DataView data={data} />
} catch (error) {
  if (isRedirectError(error)) throw error
  return <ErrorFallback />
}
```

### Mirror Callback-Critical State in a Ref (stale-closure guard)

A React state variable read directly inside a callback captures the **render-time snapshot**. If the callback can fire before the next render commits (event handlers stored in a hook, `onAnswerRecorded`-style props, timers, async continuations), that snapshot is stale. State whose value must be **current at callback execution time** — not just at definition time — must be mirrored in a `useRef` and read via `ref.current` inside the callback.

The danger is a **split between where state is produced and where it is later read**: one callback updates the state via `setState`, and a *different* callback — defined in the same hook, capturing the same render's closure — reads it before the next render commits. The reader gets the stale snapshot.

Both callbacks below live in the **same hook**, capturing the same render's closure — that shared scope is what makes the stale read possible.

```tsx
// ❌ WRONG — wrappedNavigateTo closes over the render-time `feedback`; if the user
// answers then immediately navigates, the checkpoint persists the pre-answer Map.
function useExamNavigation() {
  const wrappedNavigateTo = (i: number) => {
    checkpoint(currentAnswer, idx, feedback)   // stale: last render's `feedback`
    navigateTo(i)
  }
  return { wrappedNavigateTo }
}

// ✅ CORRECT — the produce-site eagerly mirrors into a ref; the read-site reads
// ref.current, so it sees the latest value even before React re-renders.
function useExamNavigation() {
  const feedbackRef = useRef<FeedbackMap>(new Map())
  const onAnswerRecorded = (a: Answer, fb: FeedbackMap) => {
    feedbackRef.current = fb                    // produce-site updates the ref
  }
  const wrappedNavigateTo = (i: number) => {
    checkpoint(currentAnswer, idx, feedbackRef.current)   // read-site reads the live value
    navigateTo(i)
  }
  return { onAnswerRecorded, wrappedNavigateTo }
}
```

The same applies to any scalar captured across a hook split (e.g. a `currentIndex` read in a save handler defined in a different hook). When in doubt: if a value is read inside a callback and also changes via `setState`, mirror it. Promoted at count=2 — `df5d354` (stale `currentIndex` in `handleSave` after a hook split) and `e137e93` (stale `feedback` Map read in `wrappedNavigateTo`'s checkpoint).

---

## 7. Testing Rules

### Co-locate Tests
```
question-card.tsx
question-card.test.tsx     ← same folder
```

### One Test File Per Source File
Do not put all tests in a single `__tests__` folder.

### New Hooks and Utilities Must Ship With Tests
Any new file in a `_hooks/` or `_utils/` directory, or any new utility in `lib/`, must include a co-located `.test.ts` file in the same commit. Do not rely on the test-writer agent to backfill — write the test alongside the code.

### Test Naming: Describe Behaviour, Not Implementation
```ts
// ❌ WRONG
it('calls updateFsrsState', () => { ... })

// ✅ CORRECT
it('schedules a shorter review interval when the answer is wrong', () => { ... })
```

**Disallowed in `it(...)` titles** (impl-detail leakage — promoted 2026-04-28 after PR #523 rounds 9–11):

| Pattern | Why it leaks impl |
|---------|-------------------|
| `forwards X to <InternalName>` (camelCase or PascalCase) | Names an internal helper, hook, or component the test calls into (e.g., `to handleSubmitSession`, `to AnswerOptions`, `to QuizSession`). Describe the *outcome*, not the call. |
| `from <PascalCaseType>(?:Opts\|Config\|Args)` | Names an internal type. The behavior is the populated output, not the input type's name. |
| `through <camelCaseName>(` or `via <camelCaseName>(` | Names the function under test. The enclosing `describe(...)` already provides that context. |
| `(non-positive\|typeof\|isFinite\|NaN) guard` | Names a specific `\|\|` branch in a validator. Describe what input is rejected, not which branch fires. |
| `(activates\|does not activate) the guard` | Refers to internal navigation/validation guard machinery. Describe the user-observable consequence (e.g., "does not warn when no answers exist"). |
| `matches <PascalCaseType>` (internal helper OR external library/standard type, e.g. `ZodError`) | Names a type instead of describing the result. Describe the externally observable behavior (e.g. "rejects invalid input"), not the type it matches. |
| `maps <snake_case_token>` (e.g. `maps admin_not_found`, `maps question_type`) | Names a snake_case identifier — an error code (RPC `RAISE`/SDK code) or a DB field — not the user-facing result. Describe what the user sees (e.g. "shows a not-found message when the student is soft-deleted"). |

**Permitted** (these are *contracts*, not impl):
- `it('calls onClick when the button is clicked', ...)` — `onClick` is a public prop / public callback contract.
- `it('calls signInWithPassword on valid submit', ...)` — names a public SDK method the user expects.
- `it('does not call the RPC when the input is empty', ...)` — describes the externally observable side-effect.

The distinction: external contracts (props, public callbacks, public SDK calls, RPC names visible at the integration boundary) are part of behavior. Internal helpers, validator branches, and private types are implementation.

A mechanical guard enforces this at pre-commit + CI: the `check-test-title-leakage.mjs` hook (PR #946). It is **diff-scoped and grandfathered** — it flags only `it()` / `test()` / `it.each()` / `test.each()` titles on ADDED (`+`) diff lines, so the many pre-existing `maps <token>` titles do not block commits; only newly-written titles are caught. The Permitted forms above are never flagged (the patterns key on `forwards`/`from`/`maps`/`matches`, not the `calls`/`does not call` verbs the contracts use).

### Test Comments: Audit After Renaming

Omit narrative comments above an `it(...)` if the test name fully describes the behaviour. Comments that paraphrase the title rot when the title changes; reserve comments for non-obvious WHY (hidden invariants, jsdom workarounds, ordering constraints).

**When renaming a test title to be behavior-first, audit any inline comment inside the test body.** Comments often describe a broader implementation scenario than the renamed (more specific) test exercises — once the title narrows, the comment is stale or misleading. Drop it unless it points to a non-obvious WHY that the new title doesn't carry. Promoted 2026-04-28 after stale `JSON.stringify(NaN) → null` / `typeof guard` comments survived a round-9 rename and were re-flagged in round 11.

### jsdom Limitation: Pre-Hydration State Is Not Testable

`@testing-library/react` wraps `render()` in `act()`, which flushes all effects synchronously. This means a hydration guard's pre-hydration state (e.g., disabled button, skeleton) is never observable in jsdom — `useEffect` runs before your assertions can run.

**Do not write tests for the pre-hydration branch.** Only test the post-hydration (normal) state. This is a jsdom constraint, not a missing test.

### Assert URL on Router-Navigation Mocks (from 2026-04-27)

When a test mocks `router.push`, `router.replace`, or imports `redirect` from `next/navigation`, every assertion on that mock **must** check the URL/path argument — not just `.toHaveBeenCalled()`. Use `.toHaveBeenCalledWith('/expected/path')` or pass an explicit string match to `.lastCalledWith`.

`router.back()` is zero-argument and excluded from this rule — assert the observable navigation result (final URL or history state) rather than a destination argument.

```ts
// ❌ WRONG — counts calls but misses wrong redirect target
expect(mockPush).toHaveBeenCalled()

// ✅ CORRECT — asserts the exact destination
expect(mockPush).toHaveBeenCalledWith('/app/exam/results/abc123')
```

**Applies to new tests added from 2026-04-27 onward.** Existing tests are migrated as touched, not in a sweep. Reason: PR #523 round 7 missed a wrong-redirect bug because the test only counted calls.

### Lifecycle Integration Test for New Feature Modes (from 2026-04-27)

Every new feature mode or flag that branches behavior at component, hook, or RPC level (e.g., `mode: 'exam'`, `isExam`, `isAdmin` toggles) requires at least **one** integration test exercising the **full lifecycle**: entry path → in-progress state → exit path → post-exit URL/state.

Component-level tests with the flag toggled on are **necessary but not sufficient**. A lifecycle test connects the dots across the flow.

```ts
// ❌ INSUFFICIENT — tests the flag in isolation, not the flow
it('shows countdown timer when isExam is true', () => { ... })

// ✅ REQUIRED — tests the full flow end-to-end
it('routes to results page after exam timer expires and auto-submits', () => {
  // 1. render with exam session active
  // 2. advance timer to expiry
  // 3. assert auto-submit was called
  // 4. assert router.push called with '/app/exam/results/<id>'
})
```

Reason: PR #523 had isolated `isExam` toggle tests but no test connecting "user starts exam → timer expires → user lands on report" — so the wrong-redirect bug was invisible.

### Refresh / Reload Test for Stateful UI (from 2026-04-27)

Any UI flow that holds client-side state across renders (in-memory answer buffer, multi-step form state, persistent timer) requires a test simulating **page reload mid-flow**.

- **Vitest:** mount the consumer with empty `localStorage` + a fixture representing an active server session, assert recovery render.
- **Playwright:** explicit `page.reload()` mid-spec, assert resume.

```ts
// ✅ CORRECT — Vitest reload simulation
it('recovers in-progress exam from server session when localStorage is empty', () => {
  localStorage.clear()
  mockGetActiveSession.mockResolvedValue(fixtureActiveExamSession)
  render(<ExamPage />)
  // assert the in-progress UI is shown, not a blank/start screen
  expect(screen.getByRole('timer')).toBeInTheDocument()
})
```

Reason: PR #523's exam refresh-resume bug shipped because no test reloaded the page mid-exam — the localStorage gap was invisible.

### E2E Spec Hermiticity (from 2026-04-30)

Every Playwright E2E spec that mutates shared seed data **must** restore state in `test.afterEach` (or `afterAll` for describe-scoped fixtures). Without restoration, downstream specs in the same Playwright project see polluted state and fail with what looks like flakiness but is deterministic cross-spec coupling.

The required shape:

1. **Stable marker constant** for test-created rows, exported from a shared helper module — never a magic string inlined per test. Examples: `E2E_STUDENT_EMAIL_PREFIX = 'e2e-student-mgmt-'`, `E2E_ADMIN_Q_MARKER = '[E2E_ADMIN_Q]'`.
2. **Test-created rows carry the marker** in a queryable column (text prefix preferred over JSON metadata so PostgREST `.like()` works).
3. **Single `afterEach` at the describe level** calls a shared cleanup helper. `afterEach` runs even after a failed test — that is what we want.
4. **Soft-delete, not hard-delete**, when the table has FK children. `student_responses`, `quiz_session_answers`, `flagged_questions`, and `question_comments` all reference `questions(id)`. Hard DELETE risks 23503 FK violations and also violates `docs/security.md` rule 6. **Exception — hard-delete-by-design tables:** a few tables have no `deleted_at` column and no FK children, so soft-delete is impossible and `.delete()` is the correct cleanup. The current case is `quiz_drafts` (ephemeral "save for later" storage, hard-deleted by the app on submit/cancel — mig `20260312000009`; the 20-draft cap trigger counts `count(*)` with no soft-delete filter, so cleanup queries must NOT add `.is('deleted_at', null)`). A soft-delete attempt on such a table errors at runtime (`column "deleted_at" does not exist`) and leaves state the next test inherits.
5. **Zero-row no-op chain** (`.select('id')` + log only when `data.length > 0`) per Section 5 — keeps the helper silent on filter-only tests, surfaces actual mutation when something happened.
6. **Helper has unit tests** (Vitest) covering: org-lookup error path, each update error path, no-op silence, each log path. Use the `vi.hoisted` + `buildChain` queue/shift pattern when the helper makes multiple sequential calls on the same table.

```ts
// ✅ CORRECT — admin-questions.spec.ts pattern
import { restoreSeededQuestionsState } from './helpers/supabase'

test.describe('Admin Question Editor', () => {
  test.afterEach(async () => {
    await restoreSeededQuestionsState()
  })
  // tests that may mutate seeded questions...
})

// ✅ CORRECT — admin-students.spec.ts pattern
test.describe('Admin Student Management — Create', () => {
  test.afterEach(async () => {
    await cleanupE2eStudents()  // hard-deletes rows matching prefix marker
  })
  // tests that create students...
})
```

Reason: issue #587 — `admin-questions.spec.ts`'s bulk-Deactivate test flipped every visible MET question to `status='draft'` and never restored. Within Playwright's `admin-e2e` project, admin-questions runs alphabetically before `internal-exam-*.spec.ts`, so `start_internal_exam_session` raised `insufficient_questions_for_exam` and 6 internal-exam specs timed out in CI. Promoted to a rule at count=2 (`admin-students.spec.ts` was already hermetic; `admin-questions.spec.ts` is the second).

### Multi-Step Cleanup Needs a Per-Step Error Accumulator (from 2026-06-14)

Any `afterEach`/`afterAll` (or shared cleanup helper) with **2 or more distinct cleanup steps** — separate DB mutations or restore operations — must isolate each step in its own `try/catch` and accumulate errors, instead of `await`-ing them sequentially with no isolation. A bare throw in step N (a failed delete, an RLS rejection surfaced via `{ error }`) otherwise skips steps N+1…M, leaking their rows into the next spec — the exact cross-spec coupling the hermiticity rule above prevents.

The required shape (canonical example: `rpc-void-internal-exam-code.spec.ts`):

1. `const errors: string[] = []` at the top of the block.
2. Each step in its own `try { … if (error) throw … } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) } finally { <reset this step's tracking var/set> }`. The `finally` reset (`createdIds.clear()`, `mutated = false`) runs on both success and failure, so a failed step cannot replay stale ids into the next cleanup.
3. After all steps: `if (errors.length > 0) throw new Error(\`afterEach: ${errors.join('; ')}\`)` — surfaces every failure at once without any step skipping a later one.

**Dependent steps:** when a later step depends on an earlier one — an FK ordering (delete a parent row after its FK children, insert children after their parent) OR a data dependency (the step needs a value the earlier step resolved, e.g. a looked-up `userId`) — additionally guard the dependent step with `errors.length === 0` so a failed prerequisite doesn't run the dependent step and trigger a spurious error that masks the real cause. Independent steps (the common case) do not need this guard.

**Best-effort steps:** a cleanup step whose failure does NOT leak shared seed state into the next spec — e.g. `auth.admin.deleteUser` on a user that carries immutable `audit_events` FK references (so the delete can never fully succeed), where the row is reused across runs — should log-and-continue (`console.error`), NOT accumulate into the fatal error list. Accumulating it would make a deliberately-tolerated failure fail CI. Reserve the accumulator + final throw for steps whose failure WOULD leak state (the soft-delete/restore of shared rows).

Complements (does not duplicate) the Biome `noUnsafeFinally` rule — that bans `throw` inside `finally`; this rule governs the cross-step isolation structure. **Single-step cleanups** (one mutation, or one shared-helper call that internally isolates) are exempt.

Promoted at count=2 — `64339b28` (a `throw` inside an `afterEach` finally) + `4f918ded` (`rpc-cross-tenant.spec.ts` afterAll: sequential cleanup blocks with no per-block isolation; a throw in block 1 risked the CL3 seeded session leaking into downstream specs). See issue #794.

### Paginated Fetch Needs a Caller-Level Page-Error Test (from 2026-06-01)

Any caller of `fetchAllRows` (or any multi-fetch / `.range()` pagination helper) must have a co-located test asserting that a **page-fetch error after a successful count** propagates correctly. Set it up one of two ways depending on how the suite mocks the helper:
- **Real helper, mocked queries:** mock the count query to succeed with a non-zero total AND the first page query to return `{ data: null, error }`.
- **Helper mocked as a dependency:** mock `fetchAllRows` to return its page-error result `{ data: [], error }` (the shape it returns after discarding partial pages).

Either way, assert the caller surfaces the error (returns `{ data: [], error }`, throws, or logs + degrades per its contract).

`fetchAllRows` discards partial pages on a page error and returns `{ data: [], error }`, so the failure mode this guards against is a **silently-truncated result that looks complete** (e.g. a GDPR export section missing rows with no signal). A test that only mocks the count error is insufficient — the page-error path is the one that regresses silently.

Promoted at count=2 (PR #681 GDPR pagination + #668 instance #7 `listOrgStudents`/`getComments`).

### Red-Team Isolation/Negative Assertions Must Be Non-Vacuous (from 2026-06-04)

A red-team test that asserts a **negative** — `expect(...).not.toContain(victim)`, `expect(rows).toHaveLength(0)`, "the row still exists / was not modified", an empty cross-tenant result — must first assert that the **protected state genuinely exists**, or the negative passes vacuously when the collection is empty for an unrelated reason.

- **Isolation (cross-user / cross-org):** before asserting the attacker sees zero of the victim's rows, assert the attacker's *own* result is non-empty (`expect(rows.length).toBeGreaterThan(0)`) AND/OR that the victim's row exists via the service-role client. Seed a victim-owned row so that "0 rows" proves RLS rejection, not an empty table.
- **State-flip / no-op (delete/update blocked):** read the protected value *before* the blocked mutation and assert it is unchanged *after* — and confirm the row existed in the first place.

```ts
// ❌ WRONG — vacuous if the cross-org admin simply has no students
expect(rows.map((r) => r.id)).not.toContain(victimUserId)

// ✅ CORRECT — non-vacuous: the admin sees their own org's students, just not the victim
expect(rows.length).toBeGreaterThan(0)
expect(rows.map((r) => r.id)).not.toContain(victimUserId)
```

Promoted at count=3 (#314 RLS-isolation on unseeded tables; #372 state-flip without pre-flip check; PR-B BZ1 `get_admin_dashboard_students` cross-org).

### Red-Team RPC Specs Must Assert the Full Output Contract (from 2026-06-04)

A red-team spec exercising an RPC's **success or idempotent-replay** path must assert the RPC's documented **return payload**, not merely that it executed without error:

1. **Output shape** — assert the returned fields (names + values) match the documented contract (e.g. `score_percentage`, `passed`, `total_questions`, `answered_count`), not just `error === null`.
2. **Idempotent / re-read paths** — seed **≥2 distinct fixture values** (e.g. one passing `75/true` AND one sub-pass `50/false`) so a regression that hardcodes a single return value fails at least one case. A single seed can't distinguish "re-reads from the DB" from "returns a hardcoded constant that happens to match".
3. **Numeric fields** — assert numeric fields are within expected bounds, and for zero-case scenarios (e.g. a session with no answers) assert exact equality to zero, since BIGINT/NUMERIC wire values can regress silently.

Promoted at count=2 (PR #736 `complete_overdue_exam_session` + PR #737 `complete_empty_exam_session` AQ idempotency, both under-asserted then tightened in review).

### New Supabase Query Sites Require an Integration Test (HARD — from #925)

Every NEW `.from('<table>')` or `.rpc('<fn>')` site in **app-layer code** (`apps/web/lib/queries/**`, `apps/web/app/**` Server Actions) must ship with a co-located `*.integration.test.ts` exercising it against the real local Postgres (the integration tier — `apps/web/vitest.integration.config.ts`), not only a mocked-client unit test. Mocked clients can't see the real schema, so schema-contract bugs (wrong column, wrong RLS scope, BIGINT-as-string) pass mocked tests and `tsc`. **Scope:** this is about app-layer query code — NOT `packages/db` migration / RPC-definition PRs, which have their own `__integration__` suite and migration tests; do not cite this rule to block a migration PR. Applies to NEW code; the ~40 pre-existing uncovered app-layer sites are tracked as backlog (#926) so the rule doesn't block its own introduction.

### Integration-Test Negative Assertions Must Be Reachable (from #925)

In app-layer integration tests, verify every negative / isolation assertion is actually reachable given real DB semantics — three tier-specific failure modes make them silently vacuous:
1. **RLS already enforces the exclusion the helper re-filters** → the helper's own filter is untestable via the restricted (student) client; the assertion passes regardless of the helper's logic. Use a service-role client to assert the helper's own filtering.
2. **Shared `beforeAll` seeding makes count-isolation one-sided** → "org A sees 3 rows, not 6" adds no signal over the ordinary functional test when both orgs are seeded before any test runs. Assert from BOTH the actor and the victim perspective.
3. **A DISTINCT-aggregate caps the observed value below a bound** → a secondary bound-check (e.g. `.not.toBe(5)`) may be unreachable; verify the leaked value is distinguishable from the expected before asserting.

(Promoted count=2, cross-commit within #925 Phase 1 — PR #927 [squash `fb2921c6`]; per-mechanism breakdown in the learner `tracker-archive.md` 2026-06-20 entry. The integration-tier analog of §7 "Red-Team Isolation/Negative Assertions Must Be Non-Vacuous." Sweep of the #925 integration files at promotion found them clean.)

---

## 8. What the Code Reviewer Checks Automatically

The `code-reviewer` agent flags these after every commit:

- Files exceeding line limits
- Page files with logic instead of composition
- Components with direct Supabase queries (no Server Component pattern)
- Functions longer than 30 lines
- Functions with >3 parameters (non-object)
- Nesting deeper than 3 levels
- `any` types
- Non-null assertions without a comment
- Barrel `index.ts` files
- `useEffect` used for data fetching (hydration guards are exempt — see Section 6)
- Missing tests for new utility functions
- `.select()` reads that destructure only `{ data }` without checking `{ error }` (see Section 5 — `.single()` PGRST116 no-rows is an allowed exception)

---

## 9. Critical Lifecycle Rule: File Renames & Documentation

**When renaming core files** (e.g., `middleware.ts` → `proxy.ts`), **always grep all docs for stale references before committing**. Pattern to check:
- `docs/*.md` for code examples
- `.claude/rules/*.md` for file paths
- MEMORY.md for references
- Agent memory files (`.claude/agent-memory/`) for notes

This prevents documentation from drifting and confusing future readers.

---

*Last updated: 2026-06-05 (added stale-closure ref-mirroring rule to §6 — issue #444)*
