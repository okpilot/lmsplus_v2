# Design — Admin Questions Pagination (#461)

## Overview

Replace the `LIMIT+1` overfetch pattern with Supabase offset pagination (`.range()` + `{ count: 'exact' }`). Add page-number UI with total count display. Page number lives in URL as `?page=N`.

## Data Flow

```text
URL ?page=2&subjectId=...
      |
page.tsx: parseFilters() -> { page: 2, subjectId: '...' }
      |
QuestionsContent (async server component)
      |
getQuestionsList(filters) -> { ok, questions, totalCount }
getSyllabusTree()          -> SyllabusTree
      |
QuestionsPageShell (client) -> count text + PaginationBar
```

## Code Reuse Analysis

### Existing Components to Leverage
- **`parseFilters()`** in `page.tsx`: extend with `page` param parsing
- **`getQuestionsList()`** in `queries.ts`: modify query strategy, same function signature pattern
- **`updateFilter()`** in `question-filters.tsx`: add `params.delete('page')` for reset

### Integration Points
- **Supabase JS client**: `.select('...', { count: 'exact' })` + `.range(from, to)` — standard Supabase pagination
- **Next.js App Router**: `searchParams` carries `page` param, Suspense boundary unchanged

## Components and Interfaces

### `getQuestionsList(filters)` — Query Layer
- **Change**: Replace `.limit(QUESTION_LIMIT + 1)` with `.select('...', { count: 'exact' }).range(from, to)`
- **Formula**: `from = (page - 1) * PAGE_SIZE`, `to = from + PAGE_SIZE - 1` (`.range()` is inclusive on both ends)
- **Returns**: `{ ok: true, questions, totalCount }` (replaces `hasMore`)
- **Destructure**: `const { data, count, error } = await query`

### `PaginationBar` — New Component

- **Purpose**: Renders page numbers, Prev/Next buttons, "Showing X-Y of Z" text
- **Props**: `{ page: number; totalCount: number; pageSize: number }`
- **Navigation**: Uses `router.replace()` with `?page=N` (same pattern as filter selects)
- **File**: `_components/pagination-bar.tsx` (new)

## Type Changes

```ts
// QuestionFilters — add page
type QuestionFilters = {
  // ...existing fields
  page?: number  // NEW — positive integer, default 1
}

// QuestionsListResult — replace hasMore with totalCount
type QuestionsListResult =
  | { ok: true; questions: QuestionRow[]; totalCount: number }
  | { ok: false; error: string }
```

## Error Handling

1. **Invalid page param**: Silently defaults to page 1 (same pattern as invalid UUID filters)
2. **Page beyond results**: Server-side `redirect()` in QuestionsContent to last valid page, preserving all filter params
3. **Count returns null**: Fallback to `count ?? 0`

## Testing Strategy

### Unit Testing
- `queries.test.ts`: Mock chain gains `.range()`, `then` returns `{ data, count, error }`. Test offset calculation, totalCount, edge cases.
- `page.test.ts`: Test `page` param parsing (valid, invalid, missing, zero, negative, float).
- `pagination-bar.test.tsx`: Prev/Next disabled states, page count, active page highlighting.

### Manual Testing
- Visit with 100+ questions, navigate pages
- Change filters mid-pagination — verify reset to page 1
- Visit `?page=999` — redirects to last valid page
- Visit `?page=-1` or `?page=abc` — defaults to page 1
