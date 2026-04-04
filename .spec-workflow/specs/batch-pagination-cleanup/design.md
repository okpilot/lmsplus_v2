# Design Document — batch-pagination-cleanup

## Overview

Four changes across the student-facing pages and database layer:
1. **Reports listing pagination** (#470) — server-side paginated + sortable reports list
2. **Quiz report question pagination** (#469) — server-side paginated question breakdown
3. **Flagged view migration** (#467) — switch read queries from `flagged_questions` table to `active_flagged_questions` view
4. **Deterministic bank resolution** (#358) — unique constraint on `question_banks(organization_id)`

Plus closing 3 already-resolved issues (#365, #364, #363).

## Steering Document Alignment

### Technical Standards (tech.md)
- **Decision 34**: Server-side pagination with server-side sort/filter. All paginated lists use Supabase `.range()` + `{ count: 'exact' }`, URL `?page=N&sort=field&dir=asc|desc`, shared `PaginationBar`. Page size: 10 for student pages, 25 for admin.
- **Soft-delete**: All queries respect `deleted_at IS NULL`. The flagged view migration centralizes this for flagged_questions reads.
- **ACID via RPCs**: No new RPCs needed. Quiz report continues using `get_report_correct_options()`.
- **Immutable migrations**: New migration for unique constraint. No existing migration modifications.

### Project Structure (structure.md)
- Feature-based organization: each page's `_components/` stays self-contained
- Shared `PaginationBar` moves to `apps/web/app/app/_components/` (protected-area shared components)
- Co-located tests for all new/changed files
- Server Components for data fetching, no `useEffect`

## Code Reuse Analysis

### Existing Components to Leverage
- **`PaginationBar`** (`admin/questions/_components/pagination-bar.tsx`, 113 lines): Contains `buildPageNumbers()` and `buildPageItems()` algorithms plus the UI. Will be moved to shared location and imported by all paginated pages.
- **`PaginationBar` tests** (`pagination-bar.test.tsx`, 263 lines): Move alongside component. Tests cover all edge cases including ellipsis, boundary pages, single page.
- **Admin questions query pattern** (`queries.ts`): The `.range(from, to)` + `{ count: 'exact' }` + discriminated union return pattern is the template for reports and quiz report queries.
- **`parsePageParam()`** (`admin/questions/page.tsx`): URL page param parsing logic. Will be extracted to a shared utility.

### Integration Points
- **Supabase queries**: Reports query (`lib/queries/reports.ts`) and quiz report query (`lib/queries/quiz-report.ts`) gain pagination params
- **URL state**: `?page=N&sort=field&dir=asc|desc` params parsed in Server Component page files
- **`active_flagged_questions` view**: Already exists in DB (migration 051) with `security_invoker = true`. Types already in `packages/db/src/types.ts`.

## Architecture

### Data Flow — Paginated Pages

```
URL (?page=N&sort=date&dir=desc)
    │
    ▼
page.tsx (Server Component)
    ├── parsePageParam(searchParams)
    ├── parseSortParams(searchParams)
    │
    ▼
*-content.tsx (Server Component)
    ├── query({ page, sort, dir })  →  Supabase .range() + count: 'exact'
    ├── totalPages = ceil(totalCount / PAGE_SIZE)
    ├── redirect if page > totalPages
    │
    ▼
*-shell.tsx (Client Component)
    ├── data display (table/cards)
    ├── sort toggles (update URL params, reset page=1)
    └── PaginationBar ({ page, totalCount, pageSize })
```

This matches the admin questions pattern exactly. The key difference for reports is adding sort URL params.

### Shared Component Location

```
apps/web/app/app/_components/
    ├── pagination-bar.tsx          ← MOVED from admin/questions/_components/
    └── pagination-bar.test.tsx     ← MOVED alongside
```

All paginated pages import from `@/app/app/_components/pagination-bar`.
The admin questions page updates its import path.

### Shared Utility

```
apps/web/lib/utils/parse-page-param.ts    ← NEW: extracted from admin/questions/page.tsx
```

Parses `?page=N` from searchParams, validates as positive integer, defaults to 1.

## Components and Interfaces

### 1. PaginationBar (shared, moved + modified)
- **Purpose:** Renders page navigation controls with prev/next, page numbers, ellipsis, and "Showing X-Y of Z [entity]" summary
- **Interfaces:** `{ page: number, totalCount: number, pageSize: number, entityLabel?: string }` — `entityLabel` defaults to `"questions"` for backward compatibility. Reports page passes `"sessions"`, quiz report omits it.
- **Dependencies:** `useRouter`, `useSearchParams` from Next.js — preserves all other URL params when changing page
- **Changes:** Add optional `entityLabel` prop. Update "Showing X-Y of Z questions" to use the prop. Move to shared location.
- **Location:** `apps/web/app/app/_components/pagination-bar.tsx`

### 2. Reports Query (modified)
- **Purpose:** Fetch paginated, sorted session reports for the current student
- **File:** `apps/web/lib/queries/reports.ts`
- **Current:** `getAllSessions()` returns all sessions, no pagination
- **New:** `getSessionReports(opts: { page: number, sort: SortKey, dir: SortDir })` returns `{ ok: true, sessions: SessionReport[], totalCount: number } | { ok: false, error: string }`
- **Query changes:**
  - Add `.range(from, to)` with `{ count: 'exact' }` on quiz_sessions query
  - Add `.order(sortColumn, { ascending: dir === 'asc' })` server-side
  - PAGE_SIZE = 10
  - Keep parallel subject name resolution (batch lookup for the 10 sessions on the page)
  - Keep answer count aggregation (scoped to the 10 session IDs on the page)

### 3. Reports Page (modified)
- **Purpose:** Parse URL params, compose content + pagination
- **File:** `apps/web/app/app/reports/page.tsx`
- **Changes:** Parse `?page`, `?sort`, `?dir` from searchParams. Pass to content component.

### 4. ReportsContent (modified)
- **Purpose:** Fetch data, handle out-of-range redirect, compose shell
- **File:** `apps/web/app/app/reports/_components/reports-content.tsx`
- **Changes:** Call `getSessionReports(opts)`, calculate totalPages, redirect if page > totalPages, pass data + pagination props to shell

### 5. ReportsList → ReportsShell (modified)
- **Purpose:** Render sorted table/cards + pagination bar
- **File:** `apps/web/app/app/reports/_components/reports-list.tsx`
- **Changes:**
  - Remove client-side sort state (`useState` for sortKey/sortDir)
  - Sort toggles now update URL params (`?sort=date&dir=desc`) via `router.replace()`
  - Changing sort resets `page` param to 1
  - Add `PaginationBar` at bottom
  - Props gain: `page`, `totalCount`, `pageSize`, `sort`, `dir`

### 6. Quiz Report Query (modified)
- **Purpose:** Fetch paginated question breakdown for a completed session
- **File:** `apps/web/lib/queries/quiz-report.ts`
- **Current:** `getQuizReport(sessionId)` returns all questions in one shot
- **New:** Split into two functions:
  - `getQuizReportSummary(sessionId)` — returns session metadata (score, time, subject) without questions. This is the data that doesn't change across pages.
  - `getQuizReportQuestions(opts: { sessionId: string, page: number })` — returns paginated questions with `{ ok: true, questions: QuizReportQuestion[], totalCount: number } | { ok: false, error: string }`
- **Query changes for questions:**
  - Fetch answer rows with `.range(from, to)` + `{ count: 'exact' }` on `quiz_session_answers`
  - Then fetch only the question data for those answer rows (not all session questions)
  - Correct options via `get_report_correct_options` RPC (still needed — scoped to session, returns all correct options; small enough to not paginate)
  - PAGE_SIZE = 10

### 7. Quiz Report Page (modified)
- **File:** `apps/web/app/app/quiz/report/page.tsx`
- **Changes:** Parse `?page` alongside `?session`. Pass both to content.

### 8. ReportCard (modified)
- **File:** `apps/web/app/app/quiz/report/_components/report-card.tsx`
- **Current:** Takes single `QuizReportData` prop (which includes `questions` array), passes `report.questions` to `QuestionBreakdown` and full `report` to `ResultSummary`.
- **Changes:** Accept `summary: QuizReportSummary` + `questions: QuizReportQuestion[]` + pagination props (`page`, `totalCount`, `pageSize`) as separate props instead of a single `QuizReportData`. Pass summary to `ResultSummary`, questions + pagination to `QuestionBreakdown`.
- **Type change:** `QuizReportData` is replaced by `QuizReportSummary` (no `questions` field) + separate `QuizReportQuestion[]`. The old `QuizReportData` type is deleted.

### 9. ResultSummary (modified)
- **File:** `apps/web/app/app/quiz/report/_components/result-summary.tsx`
- **Changes:** Update prop type from `QuizReportData` to `QuizReportSummary`. No functional change — it only uses summary fields.
- **Test:** `result-summary.test.tsx` — update `makeReport` fixture type to `QuizReportSummary`, remove `questions: []` from fixture.

### 10. QuestionBreakdown (modified)
- **File:** `apps/web/app/app/quiz/report/_components/question-breakdown.tsx`
- **Changes:** Remove client-side `PAGE_SIZE = 5` / `showAll` toggle. Accept paginated data + pagination props. Render `PaginationBar`.
- **Test:** `report-card.test.tsx` — update fixture to split summary + questions, remove `QuizReportData` import.

### 11. Flagged View Migration (4 source files + 3 test files modified)
- **Files:**
  - `apps/web/app/app/quiz/actions/flag.ts` — `toggleFlag()` and `getFlaggedIds()` read paths
  - `apps/web/lib/queries/quiz.ts` — `filterFlagged()`
  - `apps/web/app/app/quiz/actions/filter-helpers.ts` — `applyFilters()`
  - `apps/web/lib/gdpr/collect-user-data.ts` — `collectUserData()`
- **Change per file:** Replace `.from('flagged_questions')` with `.from('active_flagged_questions')` on READ queries only. Remove `.is('deleted_at', null)` filter (view handles it). Add type cast with safety comment.
- **Write operations** (`unflagQuestion`, `flagQuestion`) stay on `flagged_questions` base table — writes must go to the table, not the view.
- **Type handling:** View types have nullable fields (Postgres artifact). Cast view result to table Row type with comment:
  ```ts
  // View columns are typed nullable (Postgres artifact); underlying table has NOT NULL constraints.
  // Safe to cast — the view is SELECT * FROM flagged_questions WHERE deleted_at IS NULL.
  const flags = (data ?? []) as Tables<'flagged_questions'>[]
  ```
- **Test files affected:**
  - `apps/web/app/app/quiz/actions/flag.test.ts` — update mock assertions for READ paths (existence check in `toggleFlag`, `getFlaggedIds`) from `'flagged_questions'` to `'active_flagged_questions'`. Keep write-path assertions (`upsert`, `update`) on `'flagged_questions'`.
  - `apps/web/app/app/quiz/actions/filter-helpers.test.ts` — rename `flagged_questions` mock key to `active_flagged_questions` in mock setup
  - `apps/web/lib/gdpr/collect-user-data.test.ts` — rename `flagged_questions` mock key to `active_flagged_questions` in mock setup

### 12. Unique Constraint Migration
- **File:** `supabase/migrations/YYYYMMDDHHMMSS_unique_bank_per_org.sql` (new)
- **SQL:** `ALTER TABLE question_banks ADD CONSTRAINT question_banks_organization_id_key UNIQUE (organization_id);`
- **Safe:** Current data already satisfies 1:1. The `.limit(1).single()` query in `insertQuestion` remains unchanged — the constraint makes it deterministic by definition.

## Data Models

### SessionReportsResult (new discriminated union)
```ts
type SortKey = 'date' | 'score' | 'subject'
type SortDir = 'asc' | 'desc'

type SessionReportsResult =
  | { ok: true; sessions: SessionReport[]; totalCount: number }
  | { ok: false; error: string }
```

### QuizReportSummary (extracted from QuizReportData)
```ts
type QuizReportSummary = {
  sessionId: string
  mode: string
  subjectName: string | null
  totalQuestions: number
  answeredCount: number
  correctCount: number
  scorePercentage: number
  startedAt: string
  endedAt: string | null
}
```

### QuizReportQuestionsResult (new)
```ts
type QuizReportQuestionsResult =
  | { ok: true; questions: QuizReportQuestion[]; totalCount: number }
  | { ok: false; error: string }
```

## Error Handling

### Error Scenarios

1. **Database query failure on paginated fetch**
   - **Handling:** Return `{ ok: false, error: 'Failed to load reports' }`. Log server-side with `console.error`. Content component renders error state.
   - **User Impact:** Sees "Something went wrong" message instead of empty list.

2. **Out-of-range page number in URL**
   - **Handling:** Server Component calculates totalPages, redirects to last valid page preserving other params.
   - **User Impact:** Seamless redirect — no error visible.

3. **Quiz session not found or not owned**
   - **Handling:** Same as current — `getQuizReportSummary` returns null, page redirects to reports.
   - **User Impact:** Redirected to reports list.

4. **Flagged view returns empty due to RLS**
   - **Handling:** Same as current — empty array treated as "no flags". `security_invoker = true` ensures RLS applies.
   - **User Impact:** No change from current behavior.

## Testing Strategy

### Unit Testing
- **PaginationBar**: Already has 263 lines of tests. No changes needed — just move alongside component.
- **`getSessionReports()`**: Test pagination math (range calculation), sort column mapping, error handling, discriminated union returns. Pattern: mock Supabase client chain. **Note:** Current `getAllSessions` uses `throw new Error()` on failure — existing `reports.test.ts` asserts `.rejects.toThrow()`. New function returns `{ ok: false, error }` instead. All `rejects.toThrow` tests must be rewritten as `{ ok: false }` assertions.
- **`getQuizReportSummary()` / `getQuizReportQuestions()`**: Test split behavior, pagination, correct option mapping. Ensure summary doesn't include questions.
- **Flagged view callsites**: Update existing test mocks from `flagged_questions` to `active_flagged_questions` table name. Verify `.is('deleted_at', null)` is no longer chained.
- **`parsePageParam()`**: Test valid, invalid, missing, negative, zero, float inputs.

### Integration Testing
- Reports pagination: verify `.range()` is called with correct bounds for different pages.
- Quiz report split: verify summary and questions can be fetched independently.

### End-to-End Testing
- No new E2E specs needed — existing reports and quiz flow E2E tests cover the pages. Pagination is a UX enhancement, not a new flow.
- If test-writer agent identifies gaps, tests will be added post-commit.
