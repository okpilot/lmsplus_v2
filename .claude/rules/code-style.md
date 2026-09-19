# Code Style Rules — LMS Plus v2
The code-reviewer agent checks the branch diff against these rules in the pre-push review gate. Violations are warnings (non-blocking) or errors (blocking on merge).
---
## 1. File Size Limits
Limits are data: `.claude/limits.json`, enforced by `.claude/hooks/check-file-size-guard.mjs` at pre-commit and in CI.
`.claude/hooks/check-prose-claims.mjs` blocks a cap VALUE from `limits.json` being restated in PROSE as a claim about that cap, at pre-commit and in CI, ratcheted against `.claude/prose-claims.json`.
- **RATCHET, not a gate.** Fails on a NEW over-limit file; on a grandfathered one whose count no
  longer EXACTLY matches its `baseline` row, in EITHER direction; and on a stale `baseline` row
  (its file gone, now compliant, or excluded). Pre-existing violations are frozen in `limits.json`
  `baseline`. A SHRINK must be RECORDED via `check-file-size-guard.mjs --update-baseline`. A GROWTH
  needs an argument in the PR body — the guard prints it as a `+` line. Green means *you did not
  make it worse*, never *the repo is clean*.
  `--update-baseline` rewrites the whole file through `JSON.stringify`. Take the rows it computes,
  apply them as TEXT, check `git diff --numstat`.
- The suppression marker is unavailable for a broken invocation — that route exits 2, not 1, so a
  waiver can never stand in for a check that did not run.
- Some baselined lines are FALSE POSITIVES (a budget or estimate colliding with a cap value) and are
  baselined rather than tuned away: a guard narrowed until it has no false positives has stopped
  detecting.
- **`'use server'` defines a Server Action file, not the `actions/` folder.** A helper beside an
  action takes the utility cap; a Server Action outside `actions/` still takes the action cap.

**Same-commit extraction.** If a change grows a file already at/over its cap — or within ~10 lines —
include the extraction in the SAME commit. Does NOT apply to an unsplittable-DDL migration (see the
note on the SQL migration rule in `.claude/limits.json`). Run `wc -l` on every file you plan to grow
during Plan Validation and budget the split up front.
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
**Exception — React render/return bodies (pure JSX composition).** A React function-component or custom-hook **render/return body** may reach **30–35 lines** when the body is **pure JSX/element composition** — laying out and wiring child elements/props — with **no branching logic and no data transformation**. This mirrors the Server-Action-orchestrator boundary above (each line one responsibility).
The exception is **hard-bounded at 35 lines**: anything past 35 is still a violation, and any non-composition logic disqualifies the whole body regardless of length. If the body needs an `if`/loop/`.map` **with logic** (a conditional branch, a computed value, a data reshape), the cap stays 30 and the logic is extracted into a helper or a child component. A bare `.map(item => <Row key={item.id} {...item} />)` rendering a list is composition (allowed); a `.map` that computes or transforms is logic (not allowed).
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
### Mark Component Props as `Readonly`
React function-component props are an immutable contract. Wrap the props parameter's type in `Readonly<…>`, covering both inline-object and named-type annotations.
```tsx
// ❌ WRONG — mutable props
export function QuestionCard({ prompt }: { prompt: string }) { ... }
function ActivePracticeBanner({ session }: ActivePracticeProps) { ... }

// ✅ CORRECT — Readonly props
export function QuestionCard({ prompt }: Readonly<{ prompt: string }>) { ... }
function ActivePracticeBanner({ session }: Readonly<ActivePracticeProps>) { ... }
```
Applies to every React function component, including `page.tsx`/`layout.tsx` default exports (their `params`/`searchParams`/`children` props), `_components/*.tsx`, and `apps/web/components/**`. SonarCloud S6759 scans all `.tsx` as the comprehensive enforcer; the `.coderabbit.yaml` mirror covers the `page.tsx`, `layout.tsx`, `_components/*.tsx`, and `apps/web/components/**` blocks.
**Not Biome-enforceable** — Biome has no function-component-props readonly rule (`useReadonlyClassProperties` targets class properties only). Enforcement is at write-time via code-reviewer, CodeRabbit, and SonarCloud (`typescript:S6759`). Severity: **WARNING**. Pre-existing offenders are swept separately (#1027).
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
**Applies in test files too** — an unguarded cast on an RPC/`.select()` result throws an opaque `TypeError` instead of a clean assertion failure. Guard first: `expect(data).not.toBeNull()` then cast, or `Array.isArray(...)` / `typeof`.
### Fan-Out/Dispatch: Guard Array-Valued Fields with `Array.isArray`
In any fan-out/dispatch function that switches on a discriminated question-type tag and maps an optional array-valued field into a submission row, gate the field with `Array.isArray(x)` — never a bare truthy or length-only check. The two bare forms fail differently: `if (x && x.length > 0)` routes an EMPTY array to the default path (`[]` is truthy but length 0). `if (x)` avoids that specific failure — it lets `[]` through to the array branch — but it still isn't an array check: any other truthy non-array value reaches the array branch too. A string, or an object with no callable `map`, throws at `.map()`; an object that happens to define one can produce a wrong submission row without throwing at all. `Array.isArray(x)` is the only form correct for both cases.
```ts
// ❌ WRONG — empty array is truthy; a length-only check drops the empty case down a wrong branch
if (a.blankAnswers && a.blankAnswers.length > 0) row.blanks = a.blankAnswers.map(...)

// ✅ CORRECT — Array.isArray keeps the empty array in the array branch, not a wrong default
if (Array.isArray(a.blankAnswers)) row.blanks = a.blankAnswers.map(...)
```
When adding a NEW question-type branch, copy the guard shape from an EXISTING array-valued branch, not the nearest branch by position.
### Soft-Delete Filter Requires the Column to Exist
Only apply `.is('deleted_at', null)` to a table with a real `deleted_at` column — a non-existent column passes mocked Vitest chains, `tsc`, and Biome, and breaks only in production (`42703`). Mechanically enforced at pre-commit + CI (`.claude/hooks/check-soft-delete-guard.mjs`): parses `packages/db/src/types.ts` and blocks `.is('<column>')` on any table missing it, generalized beyond `deleted_at`. `docs/database.md` §3 has the fuller matrix.
### Prefer `type` Over `interface`
Use `interface` only for objects that will be extended/implemented. Use `type` for everything else.
### Destructure Supabase Mutation Results
All Supabase mutation calls (`.insert()`, `.update()`, `.delete()`, `.upsert()`) must destructure `{ error }` from the return value — the client never throws on query errors, so awaiting without destructuring silently drops them.
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
**Zero-row no-op check:** any DELETE/UPDATE expected to mutate rows chains `.select('id')` and checks the returned length — Supabase returns 200 OK with zero affected rows on a filter miss or RLS block, so a cross-user or wrong-ID call otherwise silently succeeds.
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
`.select()` reads follow the same rule — destructuring only `{ data }` silently treats an RLS-blocked or transport-failed query as an empty result (`200 OK` with `null`/`[]`).
Match the surrounding error posture:
- **Server Component query helpers** (e.g. `lib/queries/*`) — `throw new Error(\`Failed to fetch X: ${error.message}\`)`, mirroring the sibling reads in the same file. The throw surfaces via `app/error.tsx` + Sentry.
- **Server Actions** — `console.error` server-side and return a generic domain message (never return `error.message` — see *Sanitize Error Messages Returned to Callers*).
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
An `INSERT ... ON CONFLICT (col, ...) [WHERE pred] DO ...` needs a **UNIQUE** index/constraint matching exactly that column set. A plain `CREATE INDEX` (non-unique) does **not** qualify — Postgres raises `42P10`.
**Which constraint class arbitrates which form:**

| Form | Valid arbiter | Notes |
|---|---|---|
| `ON CONFLICT DO NOTHING` (no `conflict_target`) | any usable constraint or unique index, **including exclusion constraints** | Only `NOT DEFERRABLE` constraints and unique indexes are usable as arbiters. |
| `ON CONFLICT (col, …) DO NOTHING` / `DO UPDATE` (column inference) | a matching **NOT DEFERRABLE UNIQUE** constraint or index | An exclusion constraint **cannot** arbitrate a `DO UPDATE`; `42P10` otherwise. |
| `EXCEPTION WHEN unique_violation` (`23505`) | a **UNIQUE** constraint or index specifically | An exclusion constraint raises `exclusion_violation` (`23P01`) instead — a `unique_violation` handler never fires for it. |

A replay/idempotency branch is only *reachable* when its arbiter above actually exists, so any comment asserting replay behaviour depends on that constraint as much as on the function body.
Inside a **plpgsql function body**, the inference target is **not validated at `CREATE OR REPLACE FUNCTION` time — only at execution**: `supabase db reset` applies clean and a structural grep confirms the clause, yet the function throws `42P10` on first run. Clean apply + structural grep is **insufficient** for any plpgsql body with `ON CONFLICT`, `EXECUTE format(...)`, regex literals, or other deferred-validation SQL — you must **execute the function** before trusting it.
Other execution-only failure modes (illustrations, not a checklist — any plpgsql body validated at EXECUTION):
- **`42702` ambiguous column** — an unqualified column shadowed by a same-named `RETURNS TABLE` OUT
  parameter. Always alias the source table: `FROM users u WHERE u.id = auth.uid()`.
- **`42804` result-type mismatch** — dropping a `::int` cast on an aggregate feeding a
  `RETURNS TABLE (col int)` widens it to `bigint`. Keep the cast when touching such an aggregate.
- **`23502` NOT NULL** — NULL propagating through a helper (`normalize_answer(NULL)`) into a NOT NULL
  column. Coalesce at the call site; check whether sibling callers already do.

Before using `ON CONFLICT (cols) [WHERE pred]`, confirm a matching **UNIQUE** index exists AND is non-deferrable (`indisunique = true AND indimmediate = true`) — a `DEFERRABLE` unique constraint passes an `indisunique`-only check while unusable as an arbiter. If making an existing index unique requires destructive de-duplication, prefer a guarded `IF EXISTS (...) THEN RETURN; END IF;` pre-check instead.
### PostgREST Embedded Resources: Use `!` (FK-hint), Not `:` (alias)
`:` aliases the result key but does NOT expand a foreign key — on resolution failure (FK ambiguous, schema drift) it returns null silently. Use `!fk_column_name` to hint the FK explicitly; resolution failures then error loudly.
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
Type the wire shape honestly (`count: number | string`) so a future reader can't strip the coercion thinking TypeScript already guarantees a number.
### Sanitize Error Messages Returned to Callers
Every `if (error)` in a Server Action or exported function/SDK wrapper must match a known code (e.g. `23505`, `PGRST116`) and return a domain-specific message, or log server-side and return a generic string. Never return `error.message` through an exported result type — it can expose internal implementation details.
```ts
// ❌ WRONG — raw DB error leaked to client
if (error) return { success: false, error: error.message }

// ✅ CORRECT — log server-side, return generic string
if (error) {
  console.error('[actionName] DB error:', error.message)
  return { success: false, error: 'Failed to save question' }
}
```
### Escape Dynamic Values in HTML/SVG/XML Templates
Any HTML/SVG/XML template-literal builder must escape caller-supplied or DB-derived parameters with an HTML-entity escape helper before interpolation — even when current call sites are server-trusted. Escape at the interpolation site, not the call sites: a future caller is the injection vector.
```ts
// ❌ WRONG — DB-derived value interpolated raw into SVG markup
return `<text x="10" y="20">${question.prompt}</text>`

// ✅ CORRECT — escape at the interpolation site. esc() is a local HTML-entity escaper, not a shared export —
// copy the inline pattern from an existing builder (seed-quiz-setup-eval.ts or email/templates/internal-exam-code.ts).
return `<text x="10" y="20">${esc(question.prompt)}</text>`
```
### Log Every Error Path, Including Rollbacks
Every error path, including compensating (rollback) paths, must emit `console.error` before returning — a silent rollback failure leaves an inconsistent state with no signal.
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
Never hardcode Supabase project-ref URLs. Derive from `process.env.NEXT_PUBLIC_SUPABASE_URL` (client) or server-only env vars (Server Actions) — a hardcoded URL breaks local dev (`http://localhost:54321`).
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
A React state variable read inside a callback captures the **render-time snapshot** — stale if the callback can fire before the next render commits (hook-stored handlers, timers, async continuations). Mirror callback-critical state in a `useRef` and read `ref.current` inside the callback. Danger case: one callback in a hook updates state via `setState`; a different callback in the same hook, same closure, reads it before the next render — and gets the stale snapshot.
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
The same applies to any scalar captured across a hook split (e.g. a `currentIndex` read in a save handler defined in a different hook). When in doubt: if a value is read inside a callback and also changes via `setState`, mirror it.
### Await Server Actions Before Terminal Navigation
A **terminal navigation** (`router.push`/`replace`, `window.location.assign` to a page the user can't return to) must be the **last statement** on its path. `router.refresh()` is not terminal — it revalidates in place, so a racing Server Action can't cancel it. Sequencing a Server Action before a terminal nav is not sufficient: a slow revalidation can still cancel the pending soft-nav even when invoked first.
- **Critical mutations** (must settle before leaving, e.g. `discardQuiz`): **await** before the terminal navigation.
- **Non-critical cleanup** (e.g. `clearDeploymentPin`): fire it before the nav at minimum; bound a slow one (`Promise.race` + timeout) and pair with a `window.location.assign` fallback.
```ts
// ❌ WRONG — a Server Action fired AFTER the terminal navigation can cancel the soft-nav
router.replace('/app/quiz')
discardQuiz({ sessionId, draftId }).catch(() => {})

// ✅ CORRECT — await the critical mutation; non-critical cleanup fires before; nav is last
clearDeploymentPin().catch(() => {})                       // non-critical: fire before nav
await discardQuiz({ sessionId, draftId }).catch(() => {})  // critical: await to settle (best-effort)
router.replace('/app/quiz')                                // terminal nav: last statement

// ✅ CORRECT — no critical mutation; non-critical cleanup fires before, nav is last (save path)
clearDeploymentPin().catch(() => {})
router.push('/app/quiz')
```
`.catch(() => {})` above is for **ordering**, not a success guarantee — best-effort cleanup navigates regardless of outcome. When success IS a precondition, branch on the error instead of swallowing it. A sync state update (e.g. `setLoading(false)`) between action and nav is fine — not a Server Action, doesn't displace the nav as the last effectful statement.
### Synchronous Re-Entry Guard for Multi-Source Async Handlers
An async handler firing from **more than one source** (timer, click, keyboard, form submit) must gate re-entry with a **synchronous `useRef` one-shot lock**, checked-and-set before the first `await`. Async state (`useState`, `isPending`) is **not** a valid lock — a window exists where two sources both read stale "not pending" and both run the action. `disabled={pending}` only blocks the button path; a timer bypasses it.
```tsx
// ❌ WRONG — isPending/loading is async; a timer fire + a click in the same tick both pass
const [isPending, startTransition] = useTransition()
function handleSubmit() {
  if (isPending) return          // stale until React commits — both callers proceed
  startTransition(() => submit())
}

// ✅ CORRECT — useRef is synchronous; the second caller sees current=true immediately
const submittedRef = useRef(false)
function handleSubmit() {
  if (submittedRef.current) return
  submittedRef.current = true     // set before any await/transition
  startTransition(async () => {
    try { await submit() }
    catch { submittedRef.current = false }   // reset ONLY on the retryable failure path
  })
}
```
Reset `ref.current = false` only on a **retryable failure**; omit the reset when the action is terminal (so a late duplicate can't re-fire after success). For an early-returning validator, set the ref **after** validation passes, never on the early-return.
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
Any new file in `_hooks/`/`_utils/`, or new utility in `lib/`, ships a co-located `.test.ts` in the same commit — do not rely on test-writer to backfill.
### Test Naming: Describe Behaviour, Not Implementation
```ts
// ❌ WRONG
it('calls updateFsrsState', () => { ... })

// ✅ CORRECT
it('schedules a shorter review interval when the answer is wrong', () => { ... })
```
**Disallowed in `it(...)` titles** (impl-detail leakage):

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
A mechanical guard enforces this at pre-commit + CI: the `check-test-title-leakage.mjs` hook. It is **diff-scoped and grandfathered** — it flags only `it()` / `test()` / `it.each()` / `test.each()` titles on ADDED (`+`) diff lines, so the many pre-existing `maps <token>` titles do not block commits; only newly-written titles are caught. The Permitted forms above are never flagged (the patterns key on `forwards`/`from`/`maps`/`matches`, not the `calls`/`does not call` verbs the contracts use).
### Test Comments: Audit After Renaming
Omit narrative comments above `it(...)` when the name fully describes the behaviour; reserve comments for non-obvious WHY. When renaming a title to be behavior-first, audit inline body comments too — a comment describing the old, broader scenario goes stale once the title narrows. Drop it unless it carries a non-obvious WHY.
### jsdom Limitation: Pre-Hydration State Is Not Testable
`render()` wraps in `act()`, flushing all effects synchronously — a hydration guard's pre-hydration state is never observable in jsdom. Do not write tests for the pre-hydration branch; only the post-hydration state. jsdom constraint, not a missing test.
### Assert URL on Router-Navigation Mocks
A test mocking `router.push`/`replace`/`redirect` must assert the URL/path argument, not just `.toHaveBeenCalled()`. `router.back()` is zero-argument and excluded — assert the observable result instead. **Scope: tests added from 2026-04-27 onward.** Existing tests are migrated as touched, never in a sweep.
```ts
// ❌ WRONG — counts calls but misses wrong redirect target
expect(mockPush).toHaveBeenCalled()

// ✅ CORRECT — asserts the exact destination
expect(mockPush).toHaveBeenCalledWith('/app/exam/results/abc123')
```
### Lifecycle Integration Test for New Feature Modes
Every new feature mode/flag branching behavior at component/hook/RPC level requires ≥1 integration test exercising the full lifecycle: entry → in-progress → exit → post-exit state. Component-level tests with the flag toggled on are necessary but not sufficient.
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
### Refresh / Reload Test for Stateful UI
Any UI flow holding client-side state across renders requires a test simulating **page reload mid-flow**: Vitest — mount with empty `localStorage` + an active-session fixture, assert recovery render; Playwright — explicit `page.reload()` mid-spec, assert resume.
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
### E2E Spec Hermiticity
Every Playwright E2E spec mutating shared seed data **must** restore state in `test.afterEach` (or `afterAll`) — otherwise downstream specs see polluted state that looks like flakiness but is deterministic coupling. Required shape:
1. **Stable marker constant** for test-created rows, exported from a shared helper module — never a magic string inlined per test. Examples: `E2E_STUDENT_EMAIL_PREFIX = 'e2e-student-mgmt-'`, `E2E_ADMIN_Q_MARKER = '[E2E_ADMIN_Q]'`.
2. **Test-created rows carry the marker** in a queryable column (text prefix preferred over JSON metadata so PostgREST `.like()` works).
3. **Single `afterEach` at the describe level** calls a shared cleanup helper. `afterEach` runs even after a failed test — that is what we want.
4. **Soft-delete, not hard-delete**, when the table has FK children (`student_responses`, `quiz_session_answers`, `flagged_questions`, `question_comments` reference `questions(id)`) — hard DELETE risks `23503` and violates `docs/security.md` rule 6. **Exception:** hard-delete-by-design tables with no `deleted_at` and no FK children (e.g. `quiz_drafts`) use `.delete()` — a soft-delete attempt there errors at runtime (`column "deleted_at" does not exist`).
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
### Multi-Step Cleanup Needs a Per-Step Error Accumulator
Any cleanup helper with **2+ distinct steps** must isolate each in its own `try/catch` and accumulate errors — a bare throw in step N otherwise skips N+1…M, leaking rows into the next spec. Required shape (canonical: `rpc-void-internal-exam-code.spec.ts`):
1. `const errors: string[] = []` at the top of the block.
2. Each step in its own `try { … if (error) throw … } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) } finally { <reset this step's tracking var/set> }`. The `finally` reset (`createdIds.clear()`, `mutated = false`) runs on both success and failure, so a failed step cannot replay stale ids into the next cleanup.
3. After all steps: `if (errors.length > 0) throw new Error(\`afterEach: ${errors.join('; ')}\`)` — surfaces every failure at once without any step skipping a later one.

**Dependent steps** (FK ordering, or a value from an earlier step): guard with `errors.length === 0` so a failed prerequisite doesn't cascade a spurious error. Independent steps don't need this. **Best-effort steps** (failure doesn't leak state, e.g. `auth.admin.deleteUser` on a row with immutable FK refs that can never fully delete): log-and-continue, don't accumulate — reserve the accumulator for steps whose failure WOULD leak state.
Complements Biome's `noUnsafeFinally` (bans `throw` in `finally`) — this governs cross-step isolation. Single-step cleanups are exempt.
### Paginated Fetch Needs a Caller-Level Page-Error Test
Any caller of `fetchAllRows` (or a `.range()` pagination helper) needs a co-located test asserting a **page-fetch error after a successful count** propagates: mock the count to succeed non-zero and the first page to return `{ data: null, error }` (real helper), or mock `fetchAllRows` to return `{ data: [], error }` (mocked dependency). Assert the caller surfaces the error. A null payload with no error is equally an error — `fetchAllRows` rejects it as a count/page disagreement rather than passing it as an empty page. Guards against a silently-truncated result that looks complete (e.g. a GDPR export missing rows with no signal).
### Isolation/Negative Assertions Must Be Non-Vacuous
ANY test asserting a **negative** (`.not.toContain(victim)`, empty cross-tenant result, unmodified row, `toHaveLength(0)`) must first assert the **protected state genuinely exists** — otherwise the negative passes vacuously on an empty collection. Scope is every tier: red-team specs, `*.integration.test.ts`, and unit tests. See also *Integration-Test Negative Assertions Must Be Reachable* below for reachability conditions beyond empty-collection vacuity.
- **`.every()` / `.some()` on a possibly-empty array:** `[].every(pred)` is `true` for ANY predicate. An `.every()` following an assertion that the same array is empty can never fail — delete it, or guard it with a `length > 0` assertion first.
- **Isolation:** assert the attacker's own result is non-empty AND/OR the victim's row exists via service-role client, so "0 rows" proves RLS rejection, not an empty table.
- **State-flip/no-op:** read the protected value before the blocked mutation, assert unchanged after, and confirm the row existed first.
```ts
// ❌ WRONG — vacuous if the cross-org admin simply has no students
expect(rows.map((r) => r.id)).not.toContain(victimUserId)

// ✅ CORRECT — non-vacuous: the admin sees their own org's students, just not the victim
expect(rows.length).toBeGreaterThan(0)
expect(rows.map((r) => r.id)).not.toContain(victimUserId)
```
### Red-Team RPC Specs Must Assert the Full Output Contract
A red-team spec exercising an RPC's **success or idempotent-replay** path must assert the RPC's documented **return payload**, not merely that it executed without error:
1. **Output shape** — assert returned fields match the documented contract, not just `error === null`.
2. **Idempotent/re-read paths** — seed ≥2 distinct fixture values so a hardcoded-return regression fails at least one case.
3. **Numeric fields** — assert expected bounds; zero-case scenarios assert exact equality (BIGINT/NUMERIC wire values regress silently).
### New Supabase Query Sites Require an Integration Test (HARD)
Every NEW `.from('<table>')`/`.rpc('<fn>')` site in app-layer code (`apps/web/lib/queries/**`, `apps/web/app/**` Server Actions) ships with a co-located `*.integration.test.ts` against real local Postgres (`apps/web/vitest.integration.config.ts`) — mocked clients can't see the real schema, so schema-contract bugs pass mocked tests and `tsc`. Scope: app-layer only, not `packages/db` migration/RPC PRs (own suite). Applies to new code; pre-existing sites are backlog.
### Integration-Test Negative Assertions Must Be Reachable
Verify every negative/isolation assertion is reachable given real DB semantics:
1. **RLS already enforces the exclusion** the helper re-filters → untestable via the restricted client; use service-role to assert the helper's own filtering.
2. **Shared `beforeAll` seeding** makes count-isolation one-sided → assert from BOTH actor and victim perspective.
3. **A DISTINCT-aggregate caps the observed value** → verify the leaked value is distinguishable from expected before asserting a bound.
### A Test Must Fail If Its Mechanism Is Removed
Before trusting any assertion: if the protected code were deleted, would the test go red? If not, it documents an outcome rather than pins a mechanism. Recurring shape: a SECOND guard reaches the same result first, so the guard under test is never consulted (e.g. a length floor rejects a fixture before the rule under test fires; a REVOKE test asserting only `error != null` passes on a misspelled RPC name too). Cheapest proof: revert the production change locally, watch the test fail, restore. Otherwise pick a fixture whose expected value differs from every value an unrelated guard could produce.
### A `MUTATION:` Comment Is a Prose Claim, Subject to §10
A `// MUTATION: <break>` line asserts `<break>` turns THIS test red — a behaviour claim, governed by §10 like any other comment. List only mechanisms the fixture can actually REACH: naming two mechanisms where one is unreachable (an earlier guard rejects the input first) silently overclaims. Verify by reverting ONLY the named mechanism — exactly those tests should go red; a superset is under-specific, green is false. Where a mechanism can't be reached, say so rather than implying coverage.
**Naming a reachable mechanism isn't enough — the described FAILURE MODE must be true too.** A comment can name a real break yet mischaracterize how it fails (claims "pass silently", actually throws downstream). Reddening proves the mechanism, not the account of HOW — verify by reading the actual output, not predicting it.
**A guard that splits a file into lines strips the `\r` first.** No `$`-anchored pattern matches past a CRLF carriage return, so a Windows-authored file reads as having none of what the guard looks for — silently, and fail-open.
**Verify the mutation actually APPLIED before reading the result** — a `sed` with a non-matching anchor is a silent no-op, indistinguishable from an unpinned test (both report SURVIVED). Check the edit landed before concluding anything.
Re-derive rather than trust an audit claim: `node .claude/hooks/run-mutations.mjs` re-runs every encoded claim; `--coverage` reports each suite's claim sites, how many a marker links, and the encoded count.
**Link a comment to the mutations that grade it with `// GROUP: <id>, <id>` above or inside the test.** Every id must name a mutation in the data file: `--coverage` reports a dangling one and exits non-zero; the grading run throws on it before anything is graded. `--coverage` is the only claim count — a `grep` for the token also counts test titles and string fixtures, which the parser excludes, so the two disagree by construction.
### Both Halves of a Two-Sided Gate Must Compare Tokens the Same Way
When one half of a check decides what a change ADDED and another decides what SURVIVES elsewhere, both must use IDENTICAL matching semantics — a split is invisible per-half in review and shows up only as a wrong verdict on a crossing input. (E.g., one half anchored token boundaries, the other used substring `grep -F`; an unrelated superstring then counted as a surviving occurrence.) The tell is a fix applied to one side of a comparison — find the other place that must agree and correct both, or state why they legitimately differ.
### Guard Against COALESCE/Fallback-Coincidence Test Vacuity
When a test asserts a value producible by BOTH the correct-guard path AND a `COALESCE`/fallback default, it's partially vacuous — a regression dropping the guard still yields the fallback and passes. Seed a fixture whose REAL value differs from the fallback, or document the limitation inline.
```ts
// ❌ VACUOUS — the fixture's real actor_role is also 'student', so a regression dropping the
// `deleted_at IS NULL` filter (security.md rule 10) from the role lookup still returns 'student'
expect(row.actor_role).toBe('student')

// ✅ NON-VACUOUS — seed the actor with a role that differs from the fallback default, so a
// filter-drop regression changes the observed value (or add an inline comment stating the limitation)
seedActor({ role: 'admin' })            // real role ≠ the 'student' fallback
expect(row.actor_role).toBe('admin')
```

---
## 8. What the Code Reviewer Checks Automatically
The `code-reviewer` agent flags these on the branch diff in the pre-push review gate:
- Page files with logic instead of composition
- Components with direct Supabase queries (no Server Component pattern)
- Functions longer than 30 lines (EXCEPTION: React render/return bodies of pure JSX composition, no branching/data-transform — allowed up to 35 lines; see §3)
- Functions with >3 parameters (non-object)
- Nesting deeper than 3 levels
- `any` types
- Non-null assertions without a comment
- Barrel `index.ts` files
- Component props not wrapped in `Readonly<…>` (WARNING — see Section 5; SonarCloud `typescript:S6759`)
- `useEffect` used for data fetching (hydration guards are exempt — see Section 6)
- Missing tests for new utility functions
- `.select()` reads that destructure only `{ data }` without checking `{ error }` (see Section 5 — `.single()` PGRST116 no-rows is an allowed exception)
- Array-valued fields in fan-out/dispatch functions guarded with `Array.isArray(...)`, not a bare truthy/length check (see Section 5)
---
## 9. Critical Lifecycle Rule: File Renames & Documentation
**When renaming core files** (e.g., `middleware.ts` → `proxy.ts`), **always grep all docs for stale references before committing**. Pattern to check:
- `docs/*.md` for code examples
- `.claude/rules/*.md` for file paths
- MEMORY.md for references
- Agent memory files (`.claude/agent-memory/`) for notes

`.claude/hooks/check-prose-paths.mjs` runs at pre-commit and in CI. It blocks a file path written
in PROSE that does not resolve on disk. Its suppression marker is `prose-path-ok: <reason>`.
Read the guard's header for its mechanics and bounds.
---
## 10. Comment Accuracy — any claim, not just SQL
A comment or doc that asserts behaviour the code does not have. A wrong comment is worse than none —
it is what the next reader trusts when deciding whether a guard can safely be removed.
1. **Never propagate a claim from another doc — re-derive it from the code.** A doc is evidence of
   what someone believed, never of what the code does.
2. **Never enumerate an OPEN set — state how to derive it.** A set that can gain a member (files in
   a directory, tables carrying a policy, sites matching a pattern) gets a DERIVATION: a command, a
   query, a pointer to the authoritative list. Name members only as explicit ILLUSTRATIONS or with
   an as-of date. CLOSED sets are fine.
3. **A partial comment edit is the tell.** Editing part of a comment block means reading the whole
   block, then grepping the retracted phrase repo-wide: `git grep -nF -- '<retracted phrase>' -- :/`
   (or `grep -RFn -- '<phrase>' .` from the root). Both `-F` and the repo-wide path are load-bearing
   — without them a regex or a subtree-only search fails open. A claim re-typed unchanged inside a reflowed block is a NEW assertion on a `+` line
   that reads as old text. Mechanically enforced at `commit-msg` by
   `.claude/hooks/check-retracted-phrase.mjs`, scoped to `.claude/`, `docs/`, `.spec-workflow/`,
   `CLAUDE.md`, `.coderabbit.yaml` (excludes agent-memory and all-`[x]` specs); it needs the hunk to
   contain the replacement and can't see a paraphrase — the grep above is still yours to run.
   Waiver: `Retracted-ok: <token> — <reason>` trailer.
   **Grep the CLAIM, not only the STRING that expressed it** — a sweep anchored on the retracted
   wording reports clean on every paraphrase of the same assertion. Search a distinctive TOKEN of
   the subject (the command, the filename, the field), not the sentence that carried it. Partial
   remedy for the paraphrase-blindness `agent-workflow.md § Rule-Mirror Sync` records as OPEN.
4. **Verify the fix is STAGED, not merely written** — `git grep` reads the working tree and goes
   clean the moment text is on disk. Run `git diff --staged` AND
   `git status --short --untracked-files=all` (the flag is needed because
   `status.showUntrackedFiles=no` silently drops `??` lines).
5. **Re-reading finds incoherence; only re-deriving finds a claim that's coherent and false.**
   While a source file is open to verify one claim, re-derive every OTHER claim in the block that
   file can answer before closing it.
6. **A commit message may not cite a SHA that does not resolve.** Enforced at `commit-msg` by
   `.claude/hooks/check-commit-claims.mjs` via `git rev-parse --verify` (no `--quiet`, which
   conflates ambiguous and absent). Bounds: proves the commit EXISTS, never that the claim about it
   is true; detection is PARTIAL, so a green gate isn't proof every cited SHA was checked. Read
   `TRIGGER_WORDS`/`extractRefs` in the hook rather than a copy here.
7. **Recompute any count, and test any EXTENT QUANTIFIER, as the LAST authoring step, against
   the final diff.** Distinct from cl.2 (enumerating an open set): this governs a count you've
   decided to state — measuring it before your commit's remaining edits land makes it stale on
   arrival. Prefer shipping the derivation as a runnable command over stating the number
   (`check-file-size-guard.mjs --stats`). **"Count" includes EXTENT QUANTIFIERS** (`most`, `every`,
   `neither` — an open, illustrative set, governed by cl.2): replace the word with the command that
   establishes the extent, or test it against a falsifying fixture — a UNIVERSAL needs the case
   expected to FAIL.
8. **A correction is the likeliest place to write a NEW inaccuracy.** Clauses 1-3 target text you
   did not rewrite; the commoner failure is the sentence you just wrote to FIX one. Re-derive a
   correction before committing it, on the same terms as the claim it replaces.

Before asserting any DB/RPC guard, ownership, replay/idempotency, or invariant behaviour, trace to
the LATEST definition for the MATCHING SIGNATURE — supersession forms are an OPEN set
(`agent-workflow.md § "name EVERY supersession form"`) reaching beyond the function body
(`ALTER FUNCTION`, `ALTER POLICY`, triggers, constraints, indexes, GRANTs). A replay branch is only
reachable while its arbiter constraint exists (§5).
This is the WRITE-side companion to the review-side "Pre-Flag Verification" rules in
`.claude/rules/agent-*.md` and `.claude/agents/*.md`.
