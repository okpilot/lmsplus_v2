# Requirements Document — batch-pagination-cleanup

## Introduction

Batch of 4 issues covering server-side pagination for two student-facing pages (reports listing, quiz report question breakdown), migration of flagged_questions reads to the existing database view, and adding a unique constraint for deterministic bank resolution. Additionally closes 3 issues (#365, #364, #363) already resolved by PR #463.

This batch improves performance at scale (sessions can have up to 500 questions, reports list grows unbounded), eliminates manual soft-delete filtering drift, and hardens a fragile query assumption.

## Alignment with Product Vision

- **Pagination (#470, #469)**: Directly supports the monitoring & visibility principle — session reports and quiz breakdowns must remain performant as students accumulate hundreds of completed sessions with up to 500 questions each. Mobile-responsive pagination supports the "students study on phones between flights" principle.
- **Flagged view (#467)**: Supports compliance-first principle — centralizing soft-delete filtering in the database view eliminates the risk of a callsite forgetting `.is('deleted_at', null)` and exposing deleted flags.
- **Bank resolution (#358)**: Supports server-side security — enforcing the 1:1 org-bank invariant at the DB level prevents silent data corruption if the invariant is accidentally violated.

## Requirements

### Requirement 1: Paginate reports listing page (#470)

**User Story:** As a student, I want the reports page to load quickly with paginated results, so that I can browse my session history without performance degradation as I complete more quizzes.

#### Acceptance Criteria

1. WHEN a student navigates to `/app/reports` THEN the system SHALL display at most 10 session reports per page, ordered by most recent first.
2. WHEN the total number of reports exceeds 10 THEN the system SHALL display pagination controls (page numbers, prev/next) below the list.
3. WHEN a student navigates to a page number via URL `?page=N` THEN the system SHALL display the corresponding page of results.
4. IF the requested page exceeds the total number of pages THEN the system SHALL redirect to the last valid page.
5. WHEN a student clicks a sort toggle (date/score/subject) THEN the system SHALL sort ALL data server-side and reset to page 1 — not sort only the current page's rows.
6. WHEN sort parameters are active THEN the URL SHALL reflect them as `?sort=date&dir=desc` alongside `?page=N`, so sort state is shareable and bookmarkable.
7. WHEN viewed on mobile THEN pagination controls SHALL be accessible and usable without horizontal scrolling.

### Requirement 2: Paginate quiz report question breakdown (#469)

**User Story:** As a student, I want the quiz report question breakdown to be paginated, so that sessions with many questions (up to 500) don't create an excessively long page.

#### Acceptance Criteria

1. WHEN a student views a quiz report THEN the question breakdown section SHALL display at most 10 questions per page.
2. WHEN the session has more than 10 questions THEN the system SHALL display pagination controls below the breakdown.
3. WHEN a student navigates between pages THEN the system SHALL fetch only the questions for that page (server-side pagination).
4. WHEN a student navigates to a question page THEN the session summary (score, time, subject) SHALL remain visible and unchanged.
5. IF the requested question page exceeds total pages THEN the system SHALL redirect to the last valid page.
6. WHEN viewed on mobile THEN pagination controls SHALL be accessible without horizontal scrolling.

### Requirement 3: Migrate flagged_questions reads to active view (#467)

**User Story:** As a developer, I want all flagged_questions read queries to use the `active_flagged_questions` view, so that soft-delete filtering is centralized and cannot be accidentally omitted.

#### Acceptance Criteria

1. WHEN any application code reads flagged questions THEN it SHALL query `active_flagged_questions` view instead of the `flagged_questions` table directly.
2. WHEN flagged questions are written (insert, update, soft-delete) THEN the code SHALL continue using the `flagged_questions` base table.
3. WHEN the migration is complete THEN zero application-level `.is('deleted_at', null)` filters SHALL remain on flagged_questions read paths.
4. WHEN existing tests run THEN all tests SHALL pass with the updated query targets.
5. WHEN the view returns results THEN the application SHALL handle the view's nullable type signature safely (cast with comment, since underlying table has NOT NULL constraints).

### Requirement 4: Deterministic bank resolution (#358)

**User Story:** As an admin, I want question bank resolution to be deterministic, so that new questions always attach to the correct bank even if the schema evolves.

#### Acceptance Criteria

1. WHEN a new migration adds a UNIQUE constraint on `question_banks(organization_id)` THEN the database SHALL enforce exactly one bank per organization.
2. WHEN `insertQuestion` resolves the bank THEN the query SHALL remain functionally identical (the unique constraint makes `.limit(1).single()` deterministic by definition).
3. WHEN the migration runs against existing data THEN it SHALL succeed (current data already satisfies 1:1).

### Requirement 5: Close already-resolved issues (#365, #364, #363)

**User Story:** As a maintainer, I want stale issues closed, so that the board reflects actual work remaining.

#### Acceptance Criteria

1. WHEN PR #463 has already resolved the underlying problem THEN the issues SHALL be closed with a comment referencing the fixing PR.

## Non-Functional Requirements

### Code Architecture and Modularity
- **Reusable pagination**: `PaginationBar` component (already in admin questions) SHALL be moved to a shared location or imported cross-feature.
- **Consistent pattern**: All paginated pages SHALL use the same server-side offset/limit + URL `?page=N` + `PaginationBar` pattern established in PR #463.
- **Single Responsibility**: Query functions return `{ok, data, totalCount} | {ok: false, error}`. Components render. Pages compose.

### Performance
- Reports query SHALL use Supabase `.range(from, to)` with `{ count: 'exact' }` — no loading all rows.
- Quiz report SHALL paginate question fetching with `.range()` — no loading all 500 questions into the React tree.
- Page size: 10 items for both reports and quiz breakdown.

### Sorting and Filtering — Server-Side Only (Decision)
- **All sorting and filtering MUST be server-side** when combined with server-side pagination. Client-side sort/filter on a paginated subset gives incorrect results (e.g., sorting page 1's 10 rows by score does not surface the student's actual top scores).
- Sort state SHALL be encoded in URL params (`?sort=date&dir=desc`) alongside pagination (`?page=N`).
- Changing sort/filter SHALL reset pagination to page 1 and re-fetch from the server.
- This applies to all current and future paginated pages in the application.

### Security
- All queries SHALL respect existing RLS policies (student sees only their own sessions/reports).
- Quiz report SHALL continue using `get_report_correct_options` RPC for correct answer data — no direct SELECT on the `correct` field.
- The `active_flagged_questions` view has `security_invoker = true` — RLS applies through it.

### Reliability
- Out-of-range page navigation SHALL redirect gracefully, not error.
- The unique constraint migration SHALL be idempotent (IF NOT EXISTS or safe for re-run).

### Usability
- Pagination controls SHALL show "Showing X-Y of Z" context.
- Page numbers SHALL use the `buildPageNumbers` algorithm (compact with ellipsis for large page counts).
- Mobile: controls must be tap-friendly and not overflow.
