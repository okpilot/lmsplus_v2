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
| DB migration | `NNN_description.sql` | `001_initial_schema.sql` |

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

### Prefer `type` Over `interface`
Use `interface` only for objects that will be extended/implemented. Use `type` for everything else.

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

---

## 7. Testing Rules

### Co-locate Tests
```
question-card.tsx
question-card.test.tsx     ← same folder
```

### One Test File Per Source File
Do not put all tests in a single `__tests__` folder.

### Test Naming: Describe Behaviour, Not Implementation
```ts
// ❌ WRONG
it('calls updateFsrsState', () => { ... })

// ✅ CORRECT
it('schedules a shorter review interval when the answer is wrong', () => { ... })
```

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
- `useEffect` used for data fetching
- Missing tests for new utility functions

---

*Last updated: 2026-03-11*
