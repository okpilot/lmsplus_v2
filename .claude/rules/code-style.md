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

**Zero-row no-op check:** For ownership-scoped DELETE and UPDATE calls, verify at least one row was affected by chaining `.select('id')` and checking the returned array length. Supabase returns no error when RLS blocks a mutation — it returns 200 OK with zero affected rows. Without this check, cross-user or wrong-ID calls silently succeed.

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
```

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

### jsdom Limitation: Pre-Hydration State Is Not Testable
`@testing-library/react` wraps `render()` in `act()`, which flushes all effects synchronously. This means a hydration guard's pre-hydration state (e.g., disabled button, skeleton) is never observable in jsdom — `useEffect` runs before your assertions can run.

**Do not write tests for the pre-hydration branch.** Only test the post-hydration (normal) state. This is a jsdom constraint, not a missing test.

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

---

## 9. Critical Lifecycle Rule: File Renames & Documentation

**When renaming core files** (e.g., `middleware.ts` → `proxy.ts`), **always grep all docs for stale references before committing**. Pattern to check:
- `docs/*.md` for code examples
- `.claude/rules/*.md` for file paths
- MEMORY.md for references
- Agent memory files (`.claude/agent-memory/`) for notes

This prevents documentation from drifting and confusing future readers.

---

*Last updated: 2026-03-14*
