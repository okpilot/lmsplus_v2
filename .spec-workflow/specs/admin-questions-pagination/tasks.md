# Tasks — Admin Questions Pagination (#461)

- [x] 1. Update types in types.ts
  - File: apps/web/app/app/admin/questions/types.ts
  - Add `page?: number` to `QuestionFilters`
  - Replace `hasMore: boolean` with `totalCount: number` in `QuestionsListResult` success branch
  - _Requirements: R1, R2_

- [x] 2. Update query layer in queries.ts
  - File: apps/web/app/app/admin/questions/queries.ts
  - Replace `QUESTION_LIMIT = 100` with `PAGE_SIZE = 25`
  - Replace `.limit(QUESTION_LIMIT + 1)` overfetch with `.select('...', { count: 'exact' }).range(from, to)`
  - Formula: `from = (page - 1) * PAGE_SIZE`, `to = from + PAGE_SIZE - 1` (inclusive)
  - Destructure `{ data, count, error }`, return `totalCount: count ?? 0`
  - _Requirements: R1, R2_

- [x] 3. Parse page param in page.tsx
  - File: apps/web/app/app/admin/questions/page.tsx
  - Add `page` to `parseFilters()`: positive integer validation, default 1
  - _Requirements: R1.5_

- [x] 4. Thread pagination props through questions-content.tsx
  - File: apps/web/app/app/admin/questions/_components/questions-content.tsx
  - Pass `totalCount`, `page`, `PAGE_SIZE` down to `QuestionsPageShell`
  - _Requirements: R1, R2_

- [x] 5. Create PaginationBar component + update shell
  - File (new): apps/web/app/app/admin/questions/_components/pagination-bar.tsx
  - File (modify): apps/web/app/app/admin/questions/_components/questions-page-shell.tsx
  - Extract pagination into `PaginationBar` with Prev/1/2/3.../Next buttons
  - Replace `hasMore` cosmetic text with "Showing X-Y of Z questions"
  - Disable Prev on page 1, Next on last page
  - _Requirements: R1, R2_

- [x] 6. Reset page on filter change in question-filters.tsx
  - File: apps/web/app/app/admin/questions/_components/question-filters.tsx
  - Add `params.delete('page')` unconditionally at top of `updateFilter`, before key-specific logic
  - _Requirements: R3_

- [x] 7. Update tests
  - File: apps/web/app/app/admin/questions/queries.test.ts — update mock chain (.range, count), replace hasMore/QUESTION_LIMIT assertions
  - File: apps/web/app/app/admin/questions/page.test.ts — add page param parsing tests
  - _Requirements: all_
