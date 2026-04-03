# Requirements — Admin Questions Pagination (#461)

## Introduction

The admin question list is hard-limited to 100 rows with no way to see beyond. PR #460 added a `hasMore` flag and `QUESTION_LIMIT` constant, but without real pagination the admin just sees "(limit reached)" and must narrow filters. This feature adds standard page-number pagination with total count display.

## Alignment with Product Vision

Admin tooling must support the full ECQB question bank (5000+ questions). Without pagination, admins cannot browse or manage questions beyond the first 100.

## Requirements

### R1: Page-number pagination

**User Story:** As an admin, I want to browse questions page by page, so that I can access any question in the bank regardless of position.

#### Acceptance Criteria

1. WHEN admin visits `/app/admin/questions` THEN system SHALL display page 1 (first 25 questions) ordered by `created_at DESC`
2. WHEN admin clicks a page number (e.g. page 3) THEN system SHALL navigate to `?page=3` and display questions 51-75
3. WHEN admin is on page 1 THEN Prev button SHALL be disabled
4. WHEN admin is on the last page THEN Next button SHALL be disabled
5. WHEN `page` param is invalid (negative, zero, non-integer, non-numeric) THEN system SHALL default to page 1

### R2: Total count display

**User Story:** As an admin, I want to see the total number of questions matching my filters, so I know the scope of my question bank.

#### Acceptance Criteria

1. WHEN questions are loaded THEN system SHALL display "Showing X-Y of Z questions" (e.g. "Showing 26-50 of 342 questions")
2. WHEN filters are applied THEN total count SHALL reflect filtered results, not the entire table

### R3: Filter resets pagination

**User Story:** As an admin, I want pagination to reset to page 1 when I change filters, so I always see filtered results from the beginning.

#### Acceptance Criteria

1. WHEN admin changes any filter (subject, topic, subtopic, difficulty, status, search) THEN `page` param SHALL be removed from URL (reset to page 1)

## Non-Functional Requirements

### Performance
- Total count uses Supabase `{ count: 'exact' }` on `.select()` — single query returns both data and count
- Page size of 25 keeps payload small

### Security
- Admin-only page — no student data exposure risk
- No new RLS policies or RPCs needed

### Code Architecture
- Extract pagination UI into a `PaginationBar` sub-component to keep shell under 150 lines
- Page size as exported constant (`PAGE_SIZE = 25`)
