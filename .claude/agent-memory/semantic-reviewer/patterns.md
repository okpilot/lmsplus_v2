# Semantic Reviewer — Patterns & Learnings

> Running log of recurring issues, positive patterns, and areas needing extra scrutiny.

## Session Log

### 2026-04-10 — PR diff master...HEAD (feat/subject-selector-collapsible, batch quick-wins: #507, #505, #502, #504, #382, #474)
- **Files reviewed:** require-admin.ts, rethrow-redirect.ts + 5 callers, reports.ts, 3 migrations (idx, bucket, RPC), subject-select.tsx
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 2 | **GOOD:** 7
- **Issue:** `apps/web/lib/queries/reports.ts:85-88` — When `rows.length === 0` (empty result OR out-of-range page), the function returns `{ ok: true, sessions: [], totalCount: 0 }`. The comment acknowledges the ambiguity but the caller (`ReportsContent`) handles it correctly: `totalPages = max(1, ceil(0/10)) = 1`, so any `page > 1` triggers a redirect to page 1, and page 1 with an empty result shows the "no sessions" empty state. Functionally correct, but `totalCount: 0` is a lie for the out-of-range case — it will show "0 sessions" in the UI header for one render before the redirect fires. The previous implementation used a pre-flight count query to avoid this. New implementation trades display accuracy for N+1 query elimination. Not a security issue.
- **Suggestion 1:** `supabase/migrations/20260410000010_get_session_reports_rpc.sql:54-76` — The RPC accepts `p_limit INT` with no clamping. A caller can pass `p_limit = 1000000` and receive the full dataset in one response. In practice the TypeScript caller always sends `PAGE_SIZE=10`, but the RPC does not enforce this. Since it's SECURITY DEFINER and data-scoped to `auth.uid()`, this is not a privilege escalation risk — only the caller's own data is returned. Non-blocking, but worth noting: add `GREATEST(1, LEAST(p_limit, 100))` for defense-in-depth on the RPC interface.
- **Suggestion 2:** `supabase/migrations/20260410000010_get_session_reports_rpc.sql:65` — The `answered_count` is computed via a correlated subquery `(SELECT count(*) FROM quiz_session_answers qsa WHERE qsa.session_id = qs.id)` that runs once per row in the outer query. For a page of 10 sessions this is 10 extra queries. Acceptable at this scale, but note that the pre-refactor comment in `reports.ts` had flagged this as an RPC optimization target. Now the optimization is in the RPC, but the correlated subquery is the same pattern — it could instead use a LEFT JOIN with GROUP BY or a window function. Non-blocking.
- **Positive 1:** `require-admin.ts` — `.maybeSingle()` fix is correct. The previous `.single()` threw `PGRST116` when a soft-deleted admin had 0 rows (noted as ISSUE in 2026-04-08 review). Now returns `null` → `!profile || profile.role !== 'admin'` → redirect to `/app`. Test coverage at line 94-108 confirms the new path.
- **Positive 2:** `rethrow-redirect.ts` — Wraps the undocumented internal import in a single location. All 5 callers updated consistently. Test verifies both throw and no-throw paths. The mock strategy (mocking `rethrowRedirect` directly rather than `isRedirectError`) is correct — tests are testing the component behavior, not the helper implementation.
- **Positive 3:** RPC security checklist: `auth.uid()` check present (line 34-37), `SET search_path = public` present (line 26), soft-delete filter on `quiz_sessions` present (`AND qs.deleted_at IS NULL`, line 71), `easa_subjects` has no `deleted_at` (reference data, verified in migration 001), `quiz_session_answers` is immutable (no `deleted_at` needed). Full security checklist passes.
- **Positive 4:** SQL injection prevented via double whitelist — sort column whitelisted in CASE/WHEN, direction whitelisted in IF/ELSE. User input never interpolated directly into format string.
- **Positive 5:** `count(*) OVER()` window function is evaluated before LIMIT in PostgreSQL's execution order. Returns total row count (pre-pagination), not page count. The TypeScript mapping `rows[0]?.total_count ?? 0` correctly extracts it from the first row.
- **Positive 6:** Sort key alignment: TypeScript `SORT_COLUMN_MAP` sends `'started_at'`, `'score_percentage'`, `'subject_name'` — exactly matching the RPC CASE whitelist values.
- **Positive 7:** `storage.buckets` INSERT with `ON CONFLICT (id) DO NOTHING` is idempotent — safe to run against a production instance that already has the bucket. Migration can run against both fresh CI and existing production without error.
- **Pattern — `.single()` → `.maybeSingle()` for user profile lookups:** When querying a users table where soft-deletes can produce 0-row results, always use `.maybeSingle()` not `.single()`. `.single()` throws PGRST116 (service error) instead of cleanly returning null. This applies to require-admin.ts and any other auth check that looks up a user profile.
- **Pattern — window function totalCount for paginated RPCs:** `count(*) OVER()` is the correct pattern for single-query pagination. It runs before LIMIT, so `rows[0].total_count` gives the true total. The tradeoff: if the page has 0 rows (out-of-range), `total_count` is unavailable. Callers must handle this by treating `totalCount: 0` as "possibly out of range" and redirecting to page 1.

### 2026-04-10 — commit 2f31c09 (refactor(reports): move sort controls into table headers and mobile dropdown)
- **Files reviewed:** sortable-head.tsx, session-table.tsx, reports-list.tsx, reports-list.test.tsx, session-table.test.tsx
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 2 | **GOOD:** 6
- **Suggestion 1:** `reports-list.tsx:52` — `value.split('-') as [SortKey, SortDir]` is an unvalidated cast. The values are sourced from `SORT_OPTIONS` (all 6 tested), so it is safe within the current design. However, if a future caller passes an arbitrary string to `onValueChange` (e.g., an empty string slipping through a Base UI edge case), `split('-')` returns `['', undefined]` and `updateParams` receives `undefined` for `dir`. The `if (!value) return` guard only catches `null`/empty-string, not a single-part string like `'date'` with no dash. Non-blocking given controlled option values, but a Zod/enum guard would eliminate the edge case entirely.
- **Suggestion 2:** `session-table.tsx:22-49` — `SortableTableHead` is used inside a plain `<table>/<thead>/<tr>` structure, not inside shadcn's `Table/TableHeader/TableRow` wrappers. `TableHead` renders a plain `<th>` so the HTML is valid, but `TableHead` brings default classes (`h-10 align-middle whitespace-nowrap text-foreground`) that the non-sortable sibling `<th>` elements (Mode, Correct, Time) do not receive. This means sortable and non-sortable headers have different height/alignment/color defaults. Not a logic bug, but a visual consistency gap that may be noticeable at screen sizes where `h-10` on only some `<th>` cells causes uneven header row height. Consider applying `TableHead` to all header cells or keeping all as plain `<th>`.
- **Positive 1:** `handleSort` toggle logic preserved exactly from before the refactor — same toggle-on-same-key, same date-defaults-to-desc, same `page: null` reset. Behavioral parity confirmed.
- **Positive 2:** All 6 `sort-dir` combinations are covered by `SORT_OPTIONS`. The `Select` value (`sort + '-' + dir`) is guaranteed to match an option because `page.tsx` validates and defaults both `sort` and `dir` before passing them as props. No unmatched-value blank Select risk in practice.
- **Positive 3:** Mobile sort tests cover the full round-trip: initial value binding (`date-desc`), `score-asc` reflection, `router.replace` params extraction, page reset, and `subject-desc` edge case. Good test coverage for new feature.
- **Positive 4:** `SortableTableHead` reuse from admin dashboard is clean. No copy-paste; new `className` and `align` props added without breaking existing admin dashboard usage (both props are optional with defaults).
- **Positive 5:** `aria-sort` attribute is correctly applied — only sortable columns carry it, non-sortable columns (Mode, Correct, Time) correctly omit it per WCAG 1.3.1.
- **Positive 6:** Responsive layout is mutually exclusive and correct: desktop hint uses `hidden md:block`, desktop table uses `hidden md:block`, mobile section uses `md:hidden`. No risk of double-rendering.
- **Pattern — string-split unvalidated cast for composite Select values:** When a Select's `onValueChange` parses a composite string (e.g., `'score-asc'`) via `split()`, the null guard (`if (!value) return`) only covers empty/null. It does not guard against single-part strings or unexpected separators. If adding similar parse logic elsewhere, either add a Zod enum parse or a `parts.length === 2` guard before the destructure.

### 2026-04-09 — commit 995de26 (feat(quiz): replace subject dropdown with inline collapsible panel #414)
- **Files reviewed:** subject-select.tsx, subject-select.test.tsx
- **CRITICAL:** 0 | **ISSUE:** 2 | **SUGGESTION:** 2 | **GOOD:** 4
- **Issue 1:** `subject-select.tsx:44-46` — Conflicting inline style and CSS class approach. The component sets `height: var(--collapsible-panel-height)` as an inline `style` prop on `CollapsibleContent` while Base UI's `CollapsiblePanel` also injects `--collapsible-panel-height` as an inline style on the same element (confirmed in `CollapsiblePanel.js:126`). Two inline style blocks on the same element — the consumer's `style` prop and Base UI's internally-injected style — must merge, but they will not automatically do so because Base UI uses `useRenderElement` to merge props. If `elementProps` (the caller's `style`) is spread AFTER Base UI's own style in `useRenderElement`'s props array, the consumer's static `height: var(--collapsible-panel-height)` will override the height Base UI is actively trying to transition (which changes from `undefined`→`auto` vs `Npx` during animation). This means the animation will not work: the panel will jump open/shut rather than animate smoothly, or will remain stuck at `auto` height. The Tailwind `data-[starting-style]:h-0` and `data-[ending-style]:h-0` classes on the element itself are the correct CSS-first approach; the inline `style` prop for `height` is redundant and counterproductive. Fix: remove `style={{ height: 'var(--collapsible-panel-height)', transition: 'height 150ms ease-out' }}` entirely. Use only `transition-[height]` Tailwind utility (or equivalent) alongside the `data-[starting-style]:h-0` and `data-[ending-style]:h-0` Tailwind classes. The CSS variable is set by Base UI automatically.
- **Issue 2:** `subject-select.test.tsx` — The mock `CollapsibleContent` renders children unconditionally, regardless of whether the panel is open. In production, Base UI unmounts (or hides) the panel when closed by default (`keepMounted` defaults to false on `CollapsiblePanel`). The test for "calls onValueChange when a subject row is clicked" (line 61) clicks on `screen.getByText('Meteorology')` which is always visible in the test environment. In production, the rows are hidden until the trigger is clicked. This means the test passes in both correct and broken implementations — it would not catch a regression where clicking items works but only when the panel is open. The test should open the panel first via the trigger, then click the item.
- **Suggestion 1:** `subject-select.tsx:23-25` — Trigger `className` builds open-state classes with a template literal that conditionally concatenates `'rounded-b-none border-b-transparent'` strings. The `border-b-transparent` class removes the bottom border of the trigger when open to visually merge with the content panel. However `border-b-transparent` makes the border transparent, not removes it — the border space is still present. A 1px gap can appear between the trigger bottom and the content border. Consider `border-b-0` to fully remove the bottom border, or ensure the layout is verified visually.
- **Suggestion 2:** `subject-select.tsx` — No `aria-label` or accessible name on the `CollapsibleTrigger`. The trigger button contains inline spans that describe the selection state, but screen readers may announce "Select a subject [code] [name] [N] questions [chevron graphic]" as a flat concatenated string without semantic structure. Consider adding `aria-label` to the trigger or marking the code badge as `aria-hidden` to avoid redundant announcements.
- **Positive 1:** Contract preserved — props interface `{ subjects, value, onValueChange }` is identical to the old Select implementation. Zero changes to the parent component `quiz-config-form.tsx`. Clean contract.
- **Positive 2:** `CollapsibleContent` is a thin wrapper over `CollapsiblePrimitive.Panel` (verified in `collapsible.tsx:13-14`). The `data-[starting-style]:h-0` and `data-[ending-style]:h-0` Tailwind classes correctly target the Base UI `data-starting-style` and `data-ending-style` data attributes (confirmed in `CollapsiblePanelDataAttributes.d.ts`). The CSS variable name `--collapsible-panel-height` is correct (confirmed in `CollapsiblePanelCssVars.d.ts`).
- **Positive 3:** `onClick` handler closes the panel (`setOpen(false)`) after calling `onValueChange`. The panel closes after selection — correct UX. No state desync possible since both state updates are batched in the same handler.
- **Positive 4:** `subjects.find((s) => s.id === value)` with `value=""` returns `undefined`, rendering the "Select a subject" placeholder. Empty string value (no selection) handled correctly — no crash, no spurious item highlighted.
- **New pattern — Base UI CollapsiblePanel inline style conflict:** Never pass `height` as an inline `style` prop to `CollapsibleContent`/`CollapsiblePanel`. Base UI injects `--collapsible-panel-height` as an inline style internally. Consumer inline styles on the same element compete with the internal injection. Use Tailwind classes targeting `data-[starting-style]` and `data-[ending-style]` for the animation instead.
- **New pattern — test mock open-gate:** When mocking a disclosure component (Collapsible, Accordion, Dialog) with a pass-through that always renders children, tests must still simulate the open interaction before clicking items inside. Otherwise the test verifies only that the item click handler fires — not that the interaction requires the panel to be open first.

### 2026-04-08 — commit affa016 (test: assert org-scope and role query params in getStudentDetail)
- **Files reviewed:** reports-list.test.tsx (single test file, no production code)
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 1 | **GOOD:** 3
- **Suggestion:** `reports-list.test.tsx` — `window.location` is overwritten with `{ value: { search: '?sort=date&dir=desc' }, writable: true }` in the sort-toggle `beforeEach`, but `window.location` is a restricted property in jsdom. `Object.defineProperty` with `writable: true` on the `window.location` descriptor works only because jsdom permits it in this version. If jsdom is upgraded and tightens the descriptor to `configurable: false`, the `defineProperty` call will throw `TypeError: Cannot redefine property: location`. The more idiomatic approach for setting `location.search` in jsdom is either `delete window.location; window.location = { ...window.location, search: '...' }` or using `Object.assign` on the existing object. Non-blocking for current jsdom version — but worth noting as a future brittleness.
- **Positive 1:** Removal of the dead `useSearchParams` mock is correct. `useUpdateSearchParams` reads `window.location.search` at call time (not a `useSearchParams()` snapshot), so the old mock had no effect on the hook's behavior. Removing it eliminates misleading test scaffolding.
- **Positive 2:** The new `new URL(url, 'http://x').searchParams` assertion pattern is strictly better than `stringContaining('dir=asc')`. The old assertions would have passed even if `dir=asc` appeared anywhere in the URL string (e.g., as a path segment or other param value). The new approach validates exact param key-value pairs via the URL API, which is how browsers and the production hook interpret the params.
- **Positive 3:** The second sort-toggle test now additionally asserts `params.get('dir')` is `'asc'` when switching to a new sort key. This was not previously tested — only `sort=score` and `!page=` were checked. Adding the `dir` assertion is correct: the production code resets `dir` to `'asc'` when switching to a non-date sort key (`key === 'date' ? 'desc' : 'asc'`). The assertion now covers that branch.
- **Test mock pattern note:** `window.location` overrides in jsdom via `Object.defineProperty` are a test-layer concern only — this commit introduces no production code risk.

### 2026-04-08 — PR #503 PR-level sweep (fix/batch-admin-hardening, 6 commits, 39 files)
- **Scope:** Full PR diff against master — cross-commit consistency, not per-file style
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 1 | **GOOD:** 10
- **Issue:** `apps/web/app/app/reports/_components/reports-list.test.tsx` — stale `useSearchParams` mock not removed after `reports-list.tsx` was migrated to `useUpdateSearchParams` in this PR. The mock (`useSearchParams: () => new URLSearchParams('sort=date&dir=desc')`) is now dead code — `useUpdateSearchParams` reads `window.location.search` not `useSearchParams`. Because no test sets `window.location.search` to match, the sort-toggle tests exercise an empty initial URL (not `sort=date&dir=desc` as the mock implies). Tests still pass because assertions use `stringContaining` rather than exact URLs, but they verify less than intended — specifically, they don't confirm that the existing sort key is preserved when toggling direction.
- **Suggestion:** `student-table-shell.tsx:29` — still imports `useRouter` for `router.push()` navigation to student detail pages (line 107). This is correct (push is different from replace), but it creates a mixed import where `useRouter` and `useUpdateSearchParams` are both live in the same component. Low priority — functionally correct.
- **Positive 1:** Cross-commit type consistency — `deletedAt: string | null` added to `StudentDetail` type (types.ts, commit 1), returned from `getStudentDetail` (queries.ts, commit 1), displayed in `StudentHeader` badge (student-header.tsx, commit 1), tested in both `queries.test.ts` (commit 5) and `student-header.test.tsx` (commit 3). Full chain consistent across all 4 commits.
- **Positive 2:** Test mock chain updated correctly — `makeDetailChain` in queries.test.ts was updated from `['select', 'eq', 'is']` to `['select', 'eq']` (commit 6) matching the production query change from `.is('deleted_at', null)` to `.eq('role', 'student')` (commit 1). Per-commit and cross-commit consistent.
- **Positive 3:** database.md (commit 2) accurately describes the migration (commit 1) — "Returns stats for all students in the org (both active and soft-deleted)" matches the removed `AND u.deleted_at IS NULL` filter in the RPC. Doc updated in same PR session.
- **Positive 4:** code-style.md isRedirectError rule (commit 4) matches production usage exactly — import path `next/dist/client/components/redirect-error`, pattern `catch (error) { if (isRedirectError(error)) throw error }` is identical across all 5 content wrappers added in commit 1.
- **Positive 5:** pagination-bar.test.tsx updated in commit 6 to match the hook's trailing `?` fix — old assertion `'?'` replaced with `'/test'` (clean path). Per-commit fix and test update are in sync.
- **Positive 6:** student-table-shell.test.tsx fully migrated to `window.location` pattern matching the new hook — `mockUseSearchParams` removed, `usePathname` mocked, `window.location.search` set via `Object.defineProperty` in all per-test setups.
- **Positive 7:** Error boundary scope is correct — single `apps/web/app/app/admin/error.tsx` covers all admin routes. The `isRedirectError` re-throw in content wrappers ensures redirects escape the error boundary and reach Next.js routing.
- **Positive 8:** `get_admin_student_stats` migration (commit 1) — avg_score remains `NULL` for students with no sessions (no COALESCE on `ss.avg_sc`), consistent with database.md's documented behavior "NULL for students with no completed sessions (not 0)".
- **Positive 9:** `getStudentSessions` (queries.ts) retains `.is('deleted_at', null)` on quiz_sessions even though `getStudentDetail` dropped it on users. Intentional and correct — sessions should not show soft-deleted session records, but the student record itself should be visible.
- **Positive 10:** `require-admin.ts` redirect behavior verified against all 4 test cases — unauthenticated (null user + error), no session (null user + no error), not admin (role mismatch), profile query error (service error, no redirect). Test accurately covers the production code's three different outcomes.
- **Recurring pattern confirmed — useSearchParams → window.location migration requires test updates in ALL consumers:** This PR correctly updated pagination-bar.test.tsx and student-table-shell.test.tsx but missed reports-list.test.tsx. Pattern: when migrating from `useSearchParams` to `useUpdateSearchParams`, grep ALL test files that mock `useSearchParams` and update them — do not scope to just the directly modified source files.

### 2026-04-08 — commit e131b63 (test: batch testing improvements #489, #488, #475, #473, #423, #417)
- **Files reviewed:** require-admin.ts, use-update-search-params.ts (new), pagination-bar.tsx, student-table-shell.tsx, session-history-table.tsx, reports-list.tsx, dashboard-header.tsx, kpi/recent/student/weak-topics content components, getStudentDetail query, migration 20260408000007
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 2 | **GOOD:** 8
- **Issue:** `require-admin.ts:21-25` — Profile query uses `.single()` but has no `deleted_at IS NULL` filter. The `users` table `tenant_isolation` RLS policy already filters `deleted_at IS NULL`, so a soft-deleted admin gets 0 rows → `PGRST116` → "Service error: could not verify admin role" instead of the expected redirect to `/auth/login`. Edge case: soft-deleted admin bypasses proxy (proxy also uses a non-null check on `deleted_at` via RLS) but could trigger this error path. Not introduced by this commit — pre-existing, but worth fixing with `.is('deleted_at', null)` added explicitly for defense-in-depth.
- **Suggestion 1:** `use-update-search-params.ts:29` — `router.replace(\`\${pathname}?\${params.toString()}\`)` always appends `?` even when `params` is empty (e.g., deleting the only param leaves `/path?`). Next.js normalizes trailing `?` in browser history but the URL briefly flickers and tests now assert `/test?` which is a cosmetic artifact. Fix: `router.replace(params.toString() ? \`\${pathname}?\${params.toString()}\` : pathname)`.
- **Suggestion 2:** `use-update-search-params.ts` — `window.location.search` read inside `useCallback` avoids SSR crash since callbacks only execute client-side. However, there is no guard or comment explaining this assumption. If the callback were ever called during a server render (impossible with current architecture but possible if the hook is misused in a shared component), it would throw `ReferenceError: window is not defined`. A one-line comment `// window is safe here — this callback is only invoked from browser event handlers` makes the intent auditable.
- **Positive 1:** `require-admin.ts` — `redirect('/auth/login')` for unauthenticated vs `redirect('/app')` for authenticated non-admin is the correct destination split. No open redirect — both targets are hardcoded internal paths.
- **Positive 2:** All 5 content components (`kpi-cards-content`, `recent-activity-content`, `student-table-content`, `weak-topics-content`, `session-history-content`) now consistently re-throw `isRedirectError`. Previously only catching and swallowing all errors, including redirects. The pattern is applied to every content wrapper that calls a query using `requireAdmin()` — complete coverage.
- **Positive 3:** `getStudentDetail` query — `.eq('role', 'student')` replaces `.is('deleted_at', null)`. This correctly allows inactive (soft-deleted) students to be fetched for historical stats display. The `deleted_at` value is now exposed in the return type and shown via `StudentHeader` badge.
- **Positive 4:** Migration `20260408000007` — SECURITY DEFINER soft-delete rule correctly followed: `users` lookup for admin's own profile includes `AND deleted_at IS NULL` (line 33). `questions` filter includes `AND deleted_at IS NULL`. `quiz_sessions` filter includes `AND qs.deleted_at IS NULL`. `student_responses` correctly omits a `deleted_at` filter (immutable table, no such column).
- **Positive 5:** Migration `20260408000007` — `auth.uid()` check at top, `is_admin()` guard follows immediately after. Correct SECURITY DEFINER ordering per security rules. `SET search_path = public` present.
- **Positive 6:** `use-update-search-params.ts` — Reading `window.location.search` at call time (not render time) is the correct fix for the stale-snapshot race when multiple sibling components update URL params before React re-renders. The test "reads from window.location.search at call time, not render time" explicitly verifies this behavior.
- **Positive 7:** `student-table-helpers.tsx` — `StudentRow` now always fires `onClick` regardless of `isActive` status, allowing admins to view historical stats for inactive students. Tests updated to match.
- **Positive 8:** All `isRedirectError` imports use `next/dist/client/components/redirect-error` consistently across all 5 affected files.
- **New pattern — isRedirectError must be re-thrown in ALL try/catch wrappers that wrap requireAdmin() callers:** When `requireAdmin()` changes from throwing to redirecting, every `try/catch` that swallows errors from its callers must re-throw redirect errors. This includes Server Component content wrappers (like `*-content.tsx` files). Pattern: grep for all files that (a) have a `try/catch` block and (b) call a function that calls `requireAdmin()` directly or indirectly — all must re-throw `isRedirectError`.
- **New pattern — trailing `?` on URL when all params deleted:** When building a URL via `\`${pathname}?${params.toString()}\``, if all params are deleted, `params.toString()` is `''` and the result is `pathname?`. Always guard: `params.toString() ? \`${pathname}?${params.toString()}\` : pathname`.

### 2026-04-03 — commit 62e8b70 (feat(admin): add page-number pagination to question list #461)
- **Files reviewed:** queries.ts, types.ts, page.tsx, questions-content.tsx, questions-page-shell.tsx, question-filters.tsx, pagination-bar.tsx (new), queries.test.ts, page.test.ts, pagination-bar.test.ts
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 2 | **GOOD:** 7
- **Issue:** `pagination-bar.tsx:34` + `queries.ts:9-11` — Out-of-range page behavioral inconsistency. When a user visits `?page=999` with only 50 total results (2 pages), queries.ts fetches with `from=24950, to=24974` (returns 0 rows). PaginationBar clamps `page` to `totalPages=2` for its display, computing "Showing 26–50 of 50 questions" and highlighting page 2 as active — but the table is empty. The display claims data is visible that is not. Fix: pass `clampedPage` back to the data layer, or clamp in `getQuestionsList` itself (e.g., `const page = Math.max(1, Math.min(filters.page ?? 1, Math.ceil(count / PAGE_SIZE)))`), or redirect to page 1 when `page > totalPages` after the count is known.
- **Suggestion 1:** `questions-page-shell.tsx:49` + `pagination-bar.tsx:42` — Duplicate count display. When pagination is visible (totalPages > 1), users see two simultaneous question counts: the header showing "{totalCount} questions" (total matching all filters) and PaginationBar's "Showing {from}–{to} of {totalCount} questions". The header count is redundant — PaginationBar's "Showing X–Y of Z" already contains the total. Consider removing the standalone count paragraph or hiding it when pagination is shown.
- **Suggestion 2:** `pagination-bar.tsx:32` — `PaginationBar` returns `null` when `totalCount === 0 || totalPages <= 1`. The check correctly hides the bar for single-page result sets. However `totalPages = Math.max(1, ...)` ensures it's always >= 1, so `totalPages <= 1` means exactly 1 page (0–25 results). This is fine and correct — no bug, but the `Math.max(1, ...)` plus `<= 1` check creates mild confusion about whether 0-result cases are handled via `totalCount === 0` or `totalPages <= 1` (they overlap when count=0). A comment clarifying the guard intent would help future readers.
- **Positive 1:** `question-filters.tsx:25` — `params.delete('page')` is the first operation in `updateFilter`, before any key-specific logic. This ensures page resets on every filter change regardless of which key is updated. Correct placement.
- **Positive 2:** `page.tsx:10-14` — `parsePageParam` correctly handles all invalid inputs: non-string (arrays), non-numeric, zero, negative, and floats (parseInt truncates). Consistent with the pattern established for UUID and difficulty parsing in the same function.
- **Positive 3:** `queries.ts:30` — `.range(from, to)` is positioned in the base query before the filter conditions are applied, which is correct. Supabase applies OFFSET/LIMIT at the DB level after WHERE clauses, so filter correctness is unaffected.
- **Positive 4:** `queries.ts:51` — `{ data, count, error }` destructuring is complete — `count` is not silently dropped. Fallback `count ?? 0` on line 69 handles the unlikely null case.
- **Positive 5:** `pagination-bar.tsx:99-113` — `buildPageNumbers` produces no duplicate page numbers across all edge cases (verified by execution: total=8 all currents, total=10 all boundary currents). The `Math.min(total-1, current+1)` bound on the loop correctly prevents the loop from emitting `total`, which is always pushed separately.
- **Positive 6:** `pagination-bar.tsx:87-97` — `buildPageItems` uses a counter (`ellipsisCount`) to give each ellipsis a unique key (`ellipsis-1`, `ellipsis-2`). No key collision on pages with two ellipsis spans.
- **Positive 7:** `queries.ts` — No `options[].correct` exposure risk: this is admin-only data. Admin route protected at proxy level (`profile?.role !== 'admin'` check in proxy.ts). No RLS or security gap introduced.
- **New pattern — clamp pagination at data layer, not display layer:** When a PaginationBar component clamps the displayed page (`Math.min(page, totalPages)`) but the query uses the raw page from URL params, the display and data diverge for out-of-range URLs. The clamp must happen before the DB query, either in the query function itself or in the Server Component that passes the page to both. Pattern: wherever you compute `totalPages`, verify that the `page` fed to the query has already been clamped to `[1, totalPages]`.

### 2026-04-03 — commit 0ac66ce (feat(workflow): add pre-commit critics, spec artifacts, and 4 workflow improvements)
- **Files reviewed:** plan-critic.md, implementation-critic.md, agent-critic.md, agent-workflow.md, agent-doc-updater.md, doc-updater.md, CLAUDE.md, steering docs (product/tech/structure), spec artifacts (design/requirements/tasks), plan-critic/patterns.md
- **CRITICAL:** 0 | **ISSUE:** 3 | **SUGGESTION:** 4 | **GOOD:** 5
- **Issue 1:** `.claude/agent-memory/implementation-critic/patterns.md` missing — agent definition references this path for memory writes but the file/directory was never created. plan-critic got a bootstrapped scaffold; implementation-critic did not. Symmetry gap breaks the memory feedback loop on first run.
- **Issue 2:** `CLAUDE.md` NEVER DO block not updated — "NEVER skip implementation-critic" and "NEVER skip plan-critic for multi-file plans" are documented in agent-critic.md and agent-workflow.md but absent from the top-level NEVER DO summary in CLAUDE.md. The NEVER DO block is the quick-reference orchestrator constraint list; gaps there reduce visibility of hard rules.
- **Issue 3:** `agent-workflow.md` Task Persistence section — fallback rule covers TaskCreate/TaskUpdate unavailability but has no fallback for TaskList (needed on session resume). If the task tool set is down, the NEVER rule "never start without checking TaskList" cannot be satisfied and no recovery path is documented. Natural fix: point to spec's `tasks.md` as the TaskList fallback.
- **Suggestion 1:** Plan-critic timeout uses file count as scaling metric; implementation-critic uses diff line count. Inconsistent. Line count is a better complexity proxy for both.
- **Suggestion 2:** agent-critic.md severity reference is incomplete — plan-critic CRITICAL escalation path (orchestrator direct vs revision loop) not stated in the handling rules file.
- **Suggestion 3:** DRIFT severity definition is ambiguous — "non-blocking" stated in the header but escalation to CRITICAL on security contradictions creates a blocking path not reflected in the top-level definition.
- **Suggestion 4:** Interview "zero ambiguities" auto-skip relies on undifferentiated orchestrator self-assessment. Requiring the orchestrator to state which three categories were checked makes the skip auditable.
- **Positive 1:** Revision caps (1-round plan-critic, 2-round implementation-critic) stated consistently across all 3 files. No cross-file drift.
- **Positive 2:** Steering drift CRITICAL escalation for security contradictions consistent in both agent-doc-updater.md and doc-updater.md agent definition.
- **Positive 3:** Implementation-critic revision cap includes "prevent infinite loops" rationale — auditable intent.
- **Positive 4:** Delegation Protocol litmus test ("Could this agent execute end-to-end without a follow-up question?") is binary and actionable. Failure logging creates the same learning record as agent memory files.
- **Positive 5:** CLAUDE.md workflow expansion from 9 to 15 steps preserved all original steps in correct positions. No existing step was silently collapsed.
- **New pattern — agent memory files must be bootstrapped at agent creation time:** When a new agent definition is created that references a memory file path, the bootstrapped (empty scaffold) memory file must be created in the same commit. plan-critic got `.claude/agent-memory/plan-critic/patterns.md`; implementation-critic did not. Pattern: for every new agent definition that calls for memory writes, create the memory file scaffold in the same commit.
- **New pattern — NEVER DO blocks need to mirror all always-runs pipeline gates:** When a new "always runs, never skip" pipeline step is added (like implementation-critic), it must appear in CLAUDE.md NEVER DO "Workflow — hard stops" in the same commit. agent-workflow.md and agent-critic.md are detailed references; CLAUDE.md NEVER DO is the quick-reference — both must stay in sync.
- **Recurring check to add:** When reviewing workflow/rule markdown commits, verify that every new agent created in the diff has a corresponding memory directory + scaffold file.

### 2026-03-29 — commit e38ef8c (fix(dashboard): address all 7 CodeRabbit review findings #412)
- **Files reviewed:** activity-heatmap.tsx, activity-heatmap.test.tsx, heatmap-header.tsx (new), heatmap-cell.tsx, stat-cards.tsx, use-drag-scroll.ts
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 1 | **GOOD:** 5
- **Issue:** `apps/web/app/app/dashboard/_components/stat-cards.tsx:117` — The singular/plural fix was applied only to `currentStreak` (line 114). The `bestStreak` label on line 117 still renders `"Best: {bestStreak} days"` without the same check. When `bestStreak === 1` the UI shows "Best: 1 days". The fix introduced an inconsistency between the two streak displays in the same component.
- **Suggestion:** `apps/web/app/app/dashboard/_components/activity-heatmap.test.tsx:49` — The new scoped cell assertion `dayLabel.closest('div')!.querySelector('div')!` is coupled to the DOM shape of `HeatmapCell` (outer wrapper div → inner colored box div → span day label). The `!` non-null assertions on both traversal steps will throw `TypeError` at test runtime rather than failing gracefully if the DOM structure ever changes. Prefer `screen.getByText('10').closest('[data-testid]')` pattern, or add a `data-testid="heatmap-cell-10"` to `HeatmapCell` and select by that. The current approach works but will produce an opaque error on structure change.
- **Positive 1:** `use-drag-scroll.ts` — `onWheel` edge-guard logic is correct. The pre-check `if (nextScrollLeft === el.scrollLeft) return` before `e.preventDefault()` means vertical scroll is only trapped when there is remaining horizontal travel. At both edges the native page scroll is correctly allowed to proceed.
- **Positive 2:** `use-drag-scroll.ts` — `pointercancel` added symmetrically: listener registered and removed in the same `useEffect` cleanup return. No leak introduced.
- **Positive 3:** `activity-heatmap.test.tsx` — `scrollIntoView` mock is now scoped to `beforeEach`/`afterEach` rather than module level. This correctly restores jsdom's original prototype between test runs, preventing mock state from leaking across describe blocks that run in the same worker process.
- **Positive 4:** `activity-heatmap.tsx` — Adding `offset` to the `useEffect` dependency array (with the biome-ignore comment explaining the intent) is the correct fix. When navigating past-to-past months, `todayDay` stays `-1` for both months (the `else` branch fires: `container.scrollLeft = 0`). Without `offset` in deps, the effect only ran once on initial render and never reset scroll on subsequent past-month changes. With `offset` in deps the reset now fires on every navigation. Behavior is correct and the comment makes the lint suppression auditable.
- **Positive 5:** `heatmap-header.tsx` — Correctly extracted as a pure presentational component with no hooks. Imports `HeatmapInfo` (which itself imports `InfoTooltip`, a `'use client'` component). Since `HeatmapHeader` is rendered from `ActivityHeatmap` which carries `'use client'`, the boundary is already established; no `'use client'` directive is required or correct on the new file.
- **New pattern — singular/plural fixes must cover all instances in the same component:** When applying a `value === 1 ? 'singular' : 'plural'` fix, grep the entire component for all occurrences of the same word. `stat-cards.tsx` has two streak displays; only one was fixed. Pattern: after applying a textual fix for a specific value, do `grep -n "days"` (or equivalent) in the modified file to catch sibling occurrences before committing.

### 2026-03-29 — commit ca09f34 (fix(dashboard): fix bestStreak plural + add missing tests)
- **Files reviewed:** stat-cards.tsx, stat-cards.test.tsx, heatmap-header.test.tsx, use-drag-scroll.test.ts
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 1 | **GOOD:** 4
- **Original ISSUE resolved:** `stat-cards.tsx:117` — `bestStreak` now uses `bestStreak === 1 ? 'day' : 'days'`, matching the pattern already applied to `currentStreak` on line 114. Both streak labels are now consistent.
- **Suggestion:** `use-drag-scroll.test.ts:53-63` — The "removes all listeners on unmount" test asserts that `pointerdown`, `pointermove`, `pointerup`, and `wheel` are removed. The production hook also registers `pointerleave` and `pointercancel` (lines 42-43, 49-50 of use-drag-scroll.ts). These two are not checked in the test, so if cleanup for either were accidentally removed from the hook, the test would not catch the resulting listener leak. Non-blocking — the test verifies the primary path, but the coverage gap exists.
- **Positive 1:** `stat-cards.test.tsx` — Two new tests added specifically for the singular boundary (`currentStreak === 1`) and the zero case (`currentStreak === 0`). These pin the fixed behavior and would catch any future regression. However `bestStreak === 1` is not yet covered by a test (only `screen.getByText(/Best: 21 days/)` is asserted). Low severity since the production fix is correct — but a `bestStreak={1}` regression test would make the coverage symmetric.
- **Positive 2:** `heatmap-header.test.tsx` — Full behavioral coverage for the new extracted component: heading renders, both display formats (full and short month), both button interactions, both disabled states, and both-enabled state. No logic gaps.
- **Positive 3:** `use-drag-scroll.test.ts` — All critical interaction paths covered: drag scroll, no-drag guard, post-up guard, wheel scroll, left/right boundary clamping, no-overflow no-scroll. The `pointerEvent` helper correctly works around jsdom's missing `pageX` in `PointerEventInit` using `Object.defineProperty`, and the `makeScrollDiv` helper correctly stubs the four read-only layout properties jsdom doesn't support. Sound approach for a browser-interaction-heavy hook.
- **Positive 4:** `useDragScroll` `ref.current === null` guard test correctly uses `createRef<HTMLDivElement>()` (default `current: null`) rather than an explicit `{ current: null }` cast. This matches the real hook signature and tests the actual null-guard path.
- **New pattern — test coverage for cleanup must match all registered listeners:** When writing unmount/cleanup tests for hooks that register multiple event listeners, assert every listener name registered, not just the primary ones. `useDragScroll` has 5 listener types; the test checks 4. Pattern: read source and test in parallel to verify the set of asserted events equals the set of registered events.

### 2026-03-27 — commit 7eeff14 (feat(gdpr): add data export and EASA retention documentation — PR 3/3)
- **Files reviewed:** export-student-data.ts, gdpr-actions.ts, collect-user-data.ts, gdpr/types.ts, export-student-dialog.tsx, data-export-card.tsx, student-table.tsx, students-page-shell.tsx, privacy-policy-content.tsx, terms/page.tsx, docs/decisions.md, docs/plan.md, migration 057 (RLS reference)
- **CRITICAL:** 0 | **ISSUE:** 2 | **SUGGESTION:** 3 | **GOOD:** 7
- **Issue 1:** `apps/web/lib/gdpr/collect-user-data.ts:63-67` — When called via `exportMyData()` (user self-export, RLS-scoped client), the `audit_events` query at line 63 silently returns 0 rows. The RLS policy `audit_read_instructors` restricts SELECT to instructor/admin roles only — students have no SELECT policy on `audit_events`. The export payload's `audit_events` array will always be empty for self-export. The function makes no distinction about which client is passed, so the missing-data case is invisible to the caller. GDPR Article 15 requires complete data disclosure — returning an empty audit array for a user who has login and quiz-completion events in the table is a compliance gap.
- **Issue 2:** `apps/web/lib/gdpr/collect-user-data.ts:33-34` — The `quiz_sessions` query filters `deleted_at IS NULL` (line 34), which means soft-deleted sessions are excluded from the export. `quiz_sessions` has no `deleted_at` column (schema comment at migration 001 line 179: "immutable record — no soft delete"), so `.is('deleted_at', null)` is a no-op call that will silently succeed without filtering anything — but the intent was likely to guard against deleted sessions. More importantly, for the `quiz_session_answers` phase-2 query (lines 77-84), session IDs are derived from sessions. If `deleted_at` were someday added to `quiz_sessions`, this filter would exclude sessions whose answers should still be exported for GDPR completeness. The soft-delete filter on an immutable table is semantically incorrect.
- **Suggestion 1:** `apps/web/lib/gdpr/collect-user-data.ts:76-85` — `answersResult` has no `.error` check. When `sessionIds.length > 0`, the Supabase call can fail (network, RLS denial, etc.) but the error is silently dropped. Only `{ data: [] }` is checked for the empty-sessions short-circuit. The returned data is used directly: `answersResult.data ?? []`. If the query errors, `data` is null and `??` makes it an empty array — silently omitting answers from the export rather than throwing. All other 8 parallel queries throw on error only for `userResult` (line 70); the rest are also silently dropped on error. The function's error contract (throws on user-not-found, returns empty arrays for everything else) is inconsistent with GDPR completeness requirements.
- **Suggestion 2:** `apps/web/app/app/admin/students/_components/export-student-dialog.tsx:48` — The filename is derived from `student.email.split('@')[0]`, which could contain characters unsafe for filenames on some OSes (e.g., `+`, spaces in quoted-local-part of RFC 5321 email). Low risk but non-empty: sanitize with a regex replace before using as filename.
- **Suggestion 3:** `apps/web/lib/gdpr/collect-user-data.ts` — The `user_consents` query at line 58 exports `ip_address` and `user_agent` from `user_consents` (these columns exist per migration 057). The SELECT only asks for `document_type, document_version, accepted, created_at` — `ip_address` and `user_agent` are correctly omitted from the consent export. However, the `audit_events` query exports `ip_address` directly. For the admin export path (using adminClient), this means an admin gets the student's IP address history. This is legitimate under GDPR Article 15 (export to data subject) but consider whether admin-initiated export should include raw IP addresses vs. the user's self-export.
- **Positive 1:** `export-student-data.ts` — Org-scope guard is correctly ordered: Zod parse → `requireAdmin()` (gets `organizationId`) → adminClient query with `.eq('organization_id', organizationId)` before calling `collectUserData`. A cross-org fetch attempt returns "Student not found" without revealing whether the student exists in another org. Defense-in-depth is correct.
- **Positive 2:** `export-student-data.ts` — `adminClient` used correctly for admin export (bypasses RLS to reach all tables), `createServerSupabaseClient()` used correctly for self-export (enforces RLS). Correct client discipline.
- **Positive 3:** `gdpr-actions.ts` — `exportMyData()` uses `supabase.auth.getUser()` (cryptographically verified via JWT) rather than `getSession()` (client-supplied, unverified). Correct auth pattern.
- **Positive 4:** `collect-user-data.ts` — Phase-2 `quiz_session_answers` query correctly short-circuits when `sessionIds.length === 0` rather than firing `.in('session_id', [])` which would return all rows (Supabase `.in()` with empty array behavior is a known footgun). This is correct.
- **Positive 5:** `collectUserData` selects explicit column lists on every table — no `SELECT *`. No question correctness data (`options[].correct`) is accessed. The export is from user-activity tables only.
- **Positive 6:** `export-student-dialog.tsx` — `URL.revokeObjectURL(url)` is called immediately after `link.click()`. This is correct for synchronous downloads; the blob URL is not needed after the click.
- **Positive 7:** `decisions.md` — Decision 33 correctly cites GDPR Article 17(3)(b) for the EASA exemption. The privacy policy update is accurate — the Article 17 erasure right is documented as not applicable with a clear legal basis reference.
- **New pattern — dual-client functions need explicit client-capability documentation:** When a function accepts both RLS-scoped and admin clients (like `collectUserData`), each query should be annotated with whether it will silently return no data under RLS. The current JSDoc says "Works with both user-scoped (RLS) and admin (service-role) clients" but does not say which queries return empty data under RLS — making silent data gaps invisible.
- **Recurring check to add:** Before exporting data from a compliance feature, verify each table's SELECT RLS policy grants access to the target user role (student vs. admin). `audit_events` has no student SELECT policy — confirmed gap.
- **Files still needing extra scrutiny:** `apps/web/lib/gdpr/collect-user-data.ts` — dual-client silent-empty pattern. `apps/web/e2e/helpers/supabase.ts` — `ensureConsentRecords` version-filtering gap (5 sessions, still not addressed).

### 2026-03-27 — commit 44e305f (feat(consent): add legal pages, remove analytics cookies, add footer links)
- **Files reviewed:** consent/actions.ts, consent-form.tsx, versions.ts, migration 058, legal/layout.tsx, legal/terms/page.tsx, legal/privacy/page.tsx, login-form.tsx, forgot-password-form.tsx, consent.spec.ts, actions.test.ts, consent-form.test.tsx, proxy.ts, check-consent.ts
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 2 | **GOOD:** 7
- **Issue:** `supabase/migrations/20260327000058_remove_cookie_analytics.sql:32-64` — Migration 058 replaces the `record_consent` RPC via `CREATE OR REPLACE` but does NOT re-issue the `GRANT EXECUTE ON FUNCTION record_consent(TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated` that migration 057 line 81 established. In PostgreSQL, `CREATE OR REPLACE FUNCTION` preserves existing permissions on the function when the signature is unchanged. However this is a silent assumption — if the function was ever dropped and recreated (e.g., in a clean migration test environment like CI `supabase db reset --no-seed`), the grant from migration 057 still applies because 057 runs first. In a fresh DB, 057 grants and 058 overwrites without re-granting — the grant from 057 covers the same signature so it survives. The risk is real but latent: if a future migration ever `DROP`s and recreates the function, the grant would be lost. Defensive practice: always `GRANT EXECUTE` at the end of any migration that replaces a SECURITY DEFINER function, even when the signature is unchanged.
- **Suggestion 1:** `supabase/migrations/20260327000058_remove_cookie_analytics.sql:5` — `DELETE FROM user_consents WHERE document_type = 'cookie_analytics'` is a hard DELETE on an immutable table. The migration runs as superuser (bypasses RLS), so it works. This is the correct cleanup approach here because `cookie_analytics` rows were never written to production (the analytics path was conditional on `acceptedAnalytics: true` which was never true). However the comment in the migration does not explain WHY a hard delete is acceptable on an otherwise-immutable table. Future readers may copy this pattern. Add a comment: "Direct DELETE is safe here — migration runs as superuser, bypassing RLS. In production this type was never inserted (acceptedAnalytics was always declined). This is a one-time schema cleanup, not a data-flow pattern."
- **Suggestion 2 (carry-forward — 4th time):** `apps/web/e2e/helpers/supabase.ts` — `ensureConsentRecords` still does not filter by `document_version`. The analytics removal does not fix this gap. After any version bump, test users will have only old-version consent rows and all non-consent E2E specs will hit the gate. GitHub issue should be created to track this as the prior suggestion noted.
- **Positive 1:** `versions.ts` — `CURRENT_ANALYTICS_VERSION` is cleanly removed alongside the analytics path. No orphaned constant. The prior ISSUE from commit 27c15b7 about analytics version consistency is now moot — the whole analytics branch is gone.
- **Positive 2:** `consent/actions.ts` — ConsentSchema correctly narrows down to only the two required fields. Zod `z.literal(true)` on both TOS and Privacy means the schema rejects any input that doesn't have both set to `true`. The removed `acceptedAnalytics: z.boolean()` was the only optional field — its removal makes the schema stricter, not looser.
- **Positive 3:** `proxy.ts` — consent gate cookie format `${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}` is not affected by the removal; the two-part format was already correct and remains intact. No proxy changes needed and none were made — correct scope discipline.
- **Positive 4:** `/legal` routes are NOT in the proxy matcher — this is correct. Unauthenticated users clicking footer links to `/legal/terms` or `/legal/privacy` from the login page must be able to access them without auth. If they were in the matcher and a consent-gate redirect happened, it would create an infinite redirect loop (consent page → legal page → consent page).
- **Positive 5:** `check-consent.ts` — `checkConsentStatus` RPC call and `buildConsentCookieValue()` both reference only TOS and Privacy versions. No analytics version was embedded in the cookie value. The removal requires no change to the cookie parsing or validation logic — clean containment.
- **Positive 6:** All test files updated consistently — `consent-form.test.tsx`, `actions.test.ts`, `consent.spec.ts` all remove the analytics checkbox/path assertions in sync. No test references the removed analytics path.
- **Positive 7:** `legal/layout.tsx` and both page files are pure Server Components — no `'use client'`, no logic, no hooks. Correct App Router pattern for static legal pages.
- **Prior Suggestion resolved:** `consent/actions.ts:62-73` — analytics path removed entirely, so the concern about no audit row for declined analytics is now moot. The product decision is that analytics are not collected, so no consent row is needed.
- **Files still needing extra scrutiny:** `apps/web/e2e/helpers/supabase.ts` — `ensureConsentRecords` version-filtering gap (4 sessions, not yet addressed). `apps/web/app/consent/actions.ts` — multi-RPC partial-failure idempotency gap (no UNIQUE constraint) from commit 75ffa51 still open.

### 2026-03-27 — commit 6f7b1bf (feat(quiz): randomize answer option order in get_quiz_questions RPC)
- **Files reviewed:** packages/db/migrations/002_rpc_functions.sql, supabase/migrations/20260327000059_shuffle_answer_options.sql, apps/web/lib/queries/load-session-questions.ts, apps/web/lib/queries/quiz-report.ts, apps/web/app/app/quiz/actions/submit.ts, apps/web/app/app/quiz/actions/check-answer.ts
- **CRITICAL:** 0 | **ISSUE:** 2 | **SUGGESTION:** 1 | **GOOD:** 4
- **Issue 1:** `packages/db/migrations/002_rpc_functions.sql` — source-of-truth file for `get_quiz_questions` is stale in three dimensions: (a) missing `SECURITY DEFINER` + `SET search_path = public` + `auth.uid()` guard (added by migration 038), (b) missing `question_number` return column (added by migration 008), (c) `explanation_text`/`explanation_image_url` still returned as `NULL::text` instead of real column values (fixed by migration 038). The new migration 059 correctly adds all security annotations, but the numbered source-of-truth file was not brought into sync. A developer reading `002_rpc_functions.sql` to audit security sees no auth guard and incorrectly concludes the function is unauthenticated.
- **Issue 2:** Report view shows options in original DB storage order, not the shuffled order the student saw during the quiz. `quiz-report.ts:110` fetches questions directly from the `questions` table; shuffle order is not stored anywhere. Cosmetically inconsistent: the student's report does not reflect their actual quiz experience. No correctness impact — scoring is ID-based throughout.
- **Suggestion:** Migration comment (line 5) should clarify that `DROP FUNCTION IF EXISTS` is safe on a fresh database because of `IF EXISTS`. Minor documentation clarity.
- **Positive 1:** New function correctly carries `SECURITY DEFINER`, `SET search_path = public`, and `auth.uid() IS NULL` guard — full compliance with security rules.
- **Positive 2:** Answer correctness is ID-based (`opt->>'correct'`), not position-based — shuffling cannot cause wrong scoring.
- **Positive 3:** `loadSessionQuestions` re-sorts by `questionIds` input array after RPC call — question order is stable even if Postgres returns rows in different order.
- **Positive 4:** Both `deleted_at IS NULL` and `status = 'active'` guards preserved in new migration.
- **New recurring pattern — numbered migration files drift from Supabase migrations:** `packages/db/migrations/002_rpc_functions.sql` is described as "source of truth" but is now at least 3 migrations behind the live schema for `get_quiz_questions`. Pattern: when a Supabase migration drops-and-recreates a function, the numbered source file must be updated in the same commit. Without it, the numbered files become misleading documentation.
- **New pattern — shuffle without persisted order breaks report fidelity:** Any time display order is randomized at load time but not stored, the review/report experience diverges from the quiz experience. If session fidelity matters (EASA exam prep context — it does), either store the order at session creation or sort the report deterministically and document the divergence.

### 2026-03-27 — commit 27c15b7 (fix(consent): add CURRENT_ANALYTICS_VERSION constant + tests)
- **Files reviewed:** versions.ts, consent/actions.ts, consent/actions.test.ts, login-complete/route.test.ts, consent/_components/consent-checkbox.test.tsx, agent-memory files
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 2 | **GOOD:** 6
- **Suggestion 1:** `apps/web/app/consent/actions.test.ts:194-209` — The new `maxAge` test uses `acceptedAnalytics: false`, which is the correct path. However the assertion hardcodes the cookie value as `'v1.0:v1.0'` (the mock return value). This is fine today but the test does not verify that `CURRENT_TOS_VERSION` and `CURRENT_PRIVACY_VERSION` are what compose the cookie value — it asserts the mocked string. The real behavioral gap this test should protect (wrong version in cookie on a version bump) is caught upstream in `check-consent.test.ts`. Non-blocking.
- **Suggestion 2 (carry-forward — 3rd time):** `apps/web/e2e/helpers/supabase.ts:27-32` — `ensureConsentRecords` still does not filter by `document_version`. Logged in prior sessions (227c976). Not addressed in this commit. Will silently fail to re-seed test users after a version bump.
- **Prior ISSUE confirmed closed:** `consent/actions.ts:65` — `p_document_version` for `cookie_analytics` was hardcoded `'v1.0'`. Now uses `CURRENT_ANALYTICS_VERSION`. ISSUE from commit 227c976 is fully resolved. grep confirms no remaining `'v1.0'` literals for analytics path.
- **Positive 1:** `CURRENT_ANALYTICS_VERSION` added to `versions.ts` alongside TOS and Privacy constants — single source of truth now covers all three document types. Full constant parity achieved.
- **Positive 2:** `CURRENT_ANALYTICS_VERSION` imported and used immediately in `actions.ts` — no intermediate step where the constant existed but wasn't wired in.
- **Positive 3:** New `maxAge` test in `actions.test.ts` uses `expect.objectContaining({ maxAge: 31_536_000 })` — non-brittle assertion that won't break if other cookie options change.
- **Positive 4:** New `maxAge` test in `route.test.ts` uses `toContain('Max-Age=31536000')` — correctly uses Pascal-case form matching actual Set-Cookie header serialization. Pattern documented in test-writer memory.
- **Positive 5:** `consent-checkbox.test.tsx` correctly avoids testing `stopPropagation` behavior in jsdom (documented as untestable in test-writer memory). Structural assertion `label.toContainElement(link)` correctly verifies intent without relying on browser event semantics.
- **Positive 6:** `vi.resetAllMocks()` in `beforeEach` present in `consent-checkbox.test.tsx` — correct isolation pattern.
- **Recurring pattern confirmed resolved:** Partial constant adoption (logged 227c976) — after introducing TOS/Privacy constants, analytics was missed. Now fixed. Pattern remains in memory for future vigilance.
- **Files still needing extra scrutiny:** `apps/web/e2e/helpers/supabase.ts` — `ensureConsentRecords` version-filtering gap (3 sessions, not yet addressed).

### 2026-03-27 — commit 227c976 (fix(consent): address CodeRabbit PR #385 review findings)
- **Files reviewed:** login-complete/route.ts, consent/actions.ts, consent-checkbox.tsx, e2e/helpers/supabase.ts, docs/plan.md, docs/database.md
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 2 | **GOOD:** 5
- **Issue:** `consent/actions.ts:65` — `p_document_version` for `cookie_analytics` is hardcoded as `'v1.0'` literal while TOS and Privacy use named constants from `versions.ts`. No `CURRENT_ANALYTICS_VERSION` constant exists. Inconsistent with the single-source-of-truth pattern established for the other two document types. A future analytics version bump will silently write the wrong version to the audit log.
- **Suggestion 1:** `consent/actions.ts:62-73` — When `acceptedAnalytics` is `false`, no row is written to `user_consents`. The audit log cannot distinguish "user declined analytics" from "analytics was never presented". GDPR audit completeness requires a `{ accepted: false }` row for explicit rejection. Non-blocking for the gate; blocking for GDPR audit completeness before first live student.
- **Suggestion 2:** `e2e/helpers/supabase.ts:27-32` — `ensureConsentRecords` checks for existing rows without filtering by `document_version`. A version bump will cause the helper to skip inserting the new version, leaving test users with only old-version consent rows. All non-consent E2E specs will hit the gate on next run after any version bump.
- **Positive patterns:** Cookie `maxAge` bump applied consistently to both set-sites (login-complete + consent/actions) in the same commit. `<label>` + `stopPropagation` fix is behaviorally correct. All three E2E provisioning helpers now call `ensureConsentRecords` — prior CRITICAL resolved. Named constants now used in E2E seeding for TOS/Privacy versions.
- **Prior CRITICAL confirmed closed:** `ensureAdminTestUser` (admin-supabase.ts) now calls `ensureConsentRecords`. Verified line 49 and 81.
- **Recurring pattern — partial constant adoption:** When a named constant is introduced for a multi-instance value (e.g., document version), trace ALL places the literal was previously hardcoded and replace every instance. In this commit, `'v1.0'` was replaced in `supabase.ts` (TOS + Privacy) but NOT in `actions.ts` (analytics). Pattern: after introducing a constant, grep the entire codebase for the literal string it replaces and audit every remaining occurrence.
- **Files needing extra scrutiny:** `apps/web/app/consent/actions.ts` — multi-RPC sequence without full constant coverage; analytics version is a latent mismatch. `apps/web/e2e/helpers/supabase.ts` — `ensureConsentRecords` version-filtering gap will surface on first version bump.

### 2026-03-27 — commit 75ffa51 (feat(consent): add GDPR consent gate with user_consents table)
- **Files reviewed:** proxy.ts, login-complete/route.ts, consent/actions.ts, consent/page.tsx, consent-form.tsx, check-consent.ts, versions.ts, migration 057, proxy.test.ts, consent.spec.ts, e2e/helpers/supabase.ts, e2e/helpers/admin-supabase.ts
- **CRITICAL:** 1 | **ISSUE:** 2 | **SUGGESTION:** 3 | **GOOD:** 7
- **Critical:** `e2e/helpers/admin-supabase.ts` — `ensureAdminTestUser()` does not call `ensureConsentRecords()`. The consent gate now fires for ALL users after login. `admin-auth.setup.ts` waits for `/app/dashboard` but will land on `/consent`, breaking all admin E2E specs that depend on `admin.json` storage state. `ensureTestUser` and `ensureLoginTestUser` were updated; `ensureAdminTestUser` was not. Behavioral inconsistency across the three user-provisioning helpers.
- **Issue 1:** `consent/actions.ts:38-73` — Partial failure on the multi-RPC sequence (TOS succeeds, privacy fails) leaves a TOS row in `user_consents` on first submit. Re-submit inserts a second TOS row. No UNIQUE constraint on `(user_id, document_type, document_version)`, no `ON CONFLICT` guard. Duplicates are harmless for correctness (check_consent_status uses EXISTS) but degrade GDPR audit trail quality — multiple consent timestamps look like revoke-and-re-accept cycles to a regulator.
- **Issue 2:** `proxy.test.ts:44` — Cookie name and value hardcoded as `'__consent'` and `'v1.0:v1.0'` without importing constants. The proxy test does NOT mock `versions.ts` (unlike route tests which stub `buildConsentCookieValue`), so if `CONSENT_COOKIE` or either version is bumped, `makeConsentedRequest()` silently builds the wrong cookie. Test appears to pass the wrong path, masking the real failure.
- **Suggestion 1:** Cookie `maxAge` 86400 (24h) is shorter than session lifetime (7 days). Users with valid sessions re-encounter the consent gate after 24h, triggering additional `record_consent` inserts. Combined with Issue 1 (no idempotency), long-term users accumulate unbounded consent rows. Consider aligning maxAge with session lifetime or making `record_consent` idempotent.
- **Suggestion 2:** `consent.spec.ts` test 5 explicitly relies on state left by test 4. `serial` ordering preserves this, but if test 4 is skipped the failure in test 5 is non-obvious. Document the dependency at the test level or add a precondition assertion.
- **Suggestion 3:** `consent.spec.ts` hard-DELETEs from `user_consents` (an append-only table) via admin client. This is a test-isolation exception, not production code, but it should be commented to prevent the pattern from being copied into application code.
- **Positive patterns:** SECURITY DEFINER RPCs follow all rules (search_path, auth.uid check, soft-delete guard on users). Consent gate is ordered correctly in proxy (after unauth guard, only fires for authenticated users). Cookie set only after all DB writes succeed — no cookie/DB split-brain path. Version constants as single source of truth. Idempotent consent seeding in E2E helpers. Safe handling of TABLE-returning RPC with Array.isArray guard + fail-safe 'required' default.
- **New recurring pattern — new auth-touching features must audit all user-provisioning helpers:** When a new gate is added to the login or session flow, check ALL three E2E setup helpers (ensureTestUser, ensureLoginTestUser, ensureAdminTestUser) and all setup files (auth.setup.ts, admin-auth.setup.ts). This commit missed `ensureAdminTestUser`. The pattern: any change to `login-complete/route.ts` or `proxy.ts` gate ordering requires tracing every helper that performs a login flow in E2E setup.
- **Files needing extra scrutiny going forward:** `apps/web/e2e/helpers/admin-supabase.ts` — not updated when consent was added to the other two helpers. `apps/web/app/consent/actions.ts` — multi-RPC sequence without idempotency; needs UNIQUE constraint or re-submit guard before any re-consent scenario is possible (e.g., version bump).

### 2026-03-27 — commit 1d88515 (fix(settings): warn when E2E teardown cannot find test user)
- **Files reviewed:** apps/web/e2e/settings.spec.ts
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 1 | **GOOD:** 3
- **Suggestion:** `settings.spec.ts:144-163` — The `afterAll` teardown is now a pure safety net: it always resets the test user's password to `TEST_PASSWORD` via the admin API, even when the in-test change-back step at lines 136-141 already succeeded. The teardown is unconditional and correct by design — no behavioral gap. However, `listUsers()` with no filter fetches ALL users in the project, not just the test user. For a small dev/staging project this is harmless, but `admin.auth.admin.getUserByEmail(TEST_EMAIL)` would be faster and remove the `Array.find()` scan. Non-blocking; the current approach works correctly.
- **Positive 1:** Early return with `console.warn` on missing user is the right defensive pattern. Previously the code silently skipped the password reset (the `if (user)` block ended). Now it surfaces the anomaly in the test log — credential drift is now detectable without a test failure.
- **Positive 2:** Indentation cleanup correctly flattens the logic. The previous form nested the reset inside `if (user) { ... }`, which made the error-logging block at the bottom (lines 160-162) appear optional. The new form makes the reset unconditional once the user is found — the intent is now unambiguous.
- **Positive 3:** The teardown is still correctly placed in `test.afterAll` (not `test.afterEach`), so the admin API is called once per describe block, not once per test. The per-test in-test change-back (lines 136-141) provides immediate recovery; `afterAll` is the outer safety net. Two-layer teardown is the right architecture for a credential-mutating test.
- **Carry-forward note — audit gap now 4 sessions old:** The `user.password_changed` missing audit event (first flagged 2026-03-26 commit d9e1d10) has not been addressed. This commit does not touch `actions.ts`. Flagging for the 4th time. GitHub issue #379 exists for auth audit events — this specific event should be tracked there if not already included.

### 2026-03-27 — commit ee1f7d9 (fix(settings): resolve sonar warnings and coverage gap)
- **Files reviewed:** change-password-form.tsx, change-password-form.test.tsx, edit-name-form.tsx, edit-name-form.test.tsx, profile-card.tsx, actions.ts
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 2 | **GOOD:** 5
- **Suggestion 1:** `change-password-form.tsx:120` — Submit button disabled guard is `!currentPassword || !password`. `confirmPassword` is NOT included. The button enables when only two of three required fields are filled. The Zod `refine` rule catches the mismatch and shows "Passwords do not match", so no security gap exists. But the UX is inconsistent: the button appears actionable before all required inputs are complete. The enabled-with-empty-confirm state is explicitly tested (line 62-69) — the test reflects the current design. Fix: add `|| !confirmPassword` to the disabled condition and update the test assertion.
- **Suggestion 2:** `actions.ts:84` — The `user.password_changed` audit event is still not written after a successful password change. This is the open ISSUE carried from commit d9e1d10 (2026-03-26). This commit does not introduce it; flagging to keep it visible. Three sessions have now passed without the fix. `docs/security.md §10` requires it. Fix: write audit event via `adminClient` after `supabase.auth.updateUser()` succeeds.
- **Positive 1:** `React.FormEvent` change — removing the `<HTMLFormElement>` type parameter is correct. Only `e.preventDefault()` is called; no element-specific properties are accessed. The narrowing was unnecessary.
- **Positive 2:** `Readonly<>` applied consistently — `ProfileCard`, `StatBlock`, and `EditNameForm` all receive `Readonly<>`. `ChangePasswordForm` has no props so nothing was missed. Coverage is complete.
- **Positive 3:** New tests correctly assert that `changePassword` and `updateDisplayName` are NOT called when client-side validation fails. This validates the guard-before-call contract.
- **Positive 4:** `vi.mock('sonner', ...)` placed before mocked imports — Vitest hoisting order is correct. `toast.success` and `toast.error` are properly isolated from the real sonner library.
- **Positive 5:** `waitFor()` used for async assertions (post-transition state) in success tests. Synchronous `findByRole('alert')` used for validation errors (synchronous state updates). Correct async testing discipline throughout.
- **Note — audit gap now 3 sessions old:** The `user.password_changed` missing audit event (first flagged 2026-03-26 commit d9e1d10) has not been addressed in 3 subsequent commits. Pattern: security audit gaps that survive multiple fix cycles should be escalated to a GitHub issue if not tracked already.



### 2026-03-26 — commit d9e1d10 (fix(settings): address review findings — Server Action password change, soft-delete guard, tests)
- **Files reviewed:** actions.ts, change-password-form.tsx, profile.ts, actions.test.ts, profile.test.ts, docs/database.md, docs/plan.md, patterns.md
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 2 | **GOOD:** 6
- **Issue:** `actions.ts:61-71` — `changePassword` calls `supabase.auth.updateUser()` with no audit event written. The prior CRITICAL (client-side path) is fixed, but the audit gap carried forward. `docs/security.md §10` lists `user.password_changed` as a required audit event. `record_login()` is the precedent — a SECURITY DEFINER RPC writes the audit event. The Server Action must call an equivalent RPC (or write the audit event via `adminClient`) after a successful password change.
- **Suggestion 1:** `change-password-form.tsx:47` — On `res.error === 'Session expired. Please sign in again.'`, the form shows the message in the inline error paragraph only. `reset-password-form.tsx` shows the same message AND renders a "Request a new reset link" href to `/auth/forgot-password`. A student hitting a session expiry during a password change has no CTA to recover. Not a security gap but a UX behavioral inconsistency with the established reset flow.
- **Suggestion 2:** `profile.ts:93-96` — `student_responses` count query uses `.select('*', { count: 'exact', head: true })`. `head: true` issues a HEAD request and omits the body, which is correct. However `select('*')` in a count-only query still passes the column list through PostgREST — `select('id')` or `select('', { count: 'exact', head: true })` is the conventional form in this project and avoids transmitting a wildcard over RLS.
- **Positive 1:** `actions.ts` — Zod `safeParse` now runs BEFORE `supabase.auth.getUser()` in both `updateDisplayName` and `changePassword`. Correct validation-first order per `docs/security.md §7`.
- **Positive 2:** `profile.ts:64` — `.is('deleted_at', null)` soft-delete guard added to organizations query. Consistent with `quiz_sessions` filter in `getProfileStats()`.
- **Positive 3:** `actions.ts` — `changePassword` is a `'use server'` Server Action with Zod validation, auth check, sanitized error messages, and server-side error logging. Correct pattern.
- **Positive 4:** `actions.test.ts` — Input-validation tests explicitly assert they run WITHOUT auth (no `mockAuthenticatedUser()` call) — this validates that the safeParse-first order is exercised by the tests, not just by the production code.
- **Positive 5:** `actions.test.ts` — Zero-row check test (`buildUpdateChain({ data: [] })`) correctly asserts that `mockRevalidatePath` is NOT called on no-op. This is exactly the behavioral contract code-style.md §5 requires.
- **Positive 6:** `profile.test.ts` — Table-switch `buildChain` pattern handles all four tables independently. Stats edge cases cover null scores, empty sessions, and null counts — comprehensive coverage of the `getProfileStats` computation branches.
- **Fix quality:** All 3 prior findings addressed. CRITICAL fully resolved. Issue 1 (soft-delete) resolved. Issue 2 (Zod order + safeParse) fully resolved. Audit gap (previously noted as part of CRITICAL) not yet addressed — logged as new ISSUE above.

### 2026-03-26 — commit 552bb2f (feat(settings): add student profile & settings page #368)
- **Files reviewed:** change-password-form.tsx, edit-name-form.tsx, profile-card.tsx, actions.ts, page.tsx, profile.ts, nav-icon.tsx, nav-items.ts, migration 056
- **CRITICAL:** 1 | **ISSUE:** 2 | **SUGGESTION:** 3 | **GOOD:** 4
- **Critical:** `change-password-form.tsx` — Password change uses direct client-side `supabase.auth.updateUser()` with no Server Action boundary. No audit event is written (`user.password_changed` event is missing). `reset-password-form.tsx` calls `signOut()` after success; this form does not, leaving other sessions active. Behavioral inconsistency with the existing reset flow and an audit log gap. Fix: move to a Server Action that writes an audit event and considers revoking other sessions.
- **Issue 1:** `profile.ts:64` — Organizations query missing `.is('deleted_at', null)` soft-delete filter. Inconsistent with `getProfileStats()` which correctly filters `quiz_sessions` by `deleted_at`. Any soft-deleted org's name is still returned to the student's profile.
- **Issue 2:** `actions.ts` — Zod `.parse()` called AFTER `supabase.auth.getUser()` instead of before. Correct order: validate input first, auth check second. Also uses `try/catch` around `.parse()` instead of `.safeParse()`, masking unexpected exceptions.
- **Suggestion 1:** `change-password-form.tsx` — No `session missing` error handling distinct from generic errors (inconsistent with `reset-password-form.tsx` which shows a "request new link" fallback).
- **Suggestion 2:** `profile.ts:85-89` — `totalSessions` counts only scored sessions (`completed.length`) while `totalAnswered` is unscoped. Creates a subtle presentation inconsistency. Intentional or not, should be documented.
- **Suggestion 3:** `migration 056` — No `ENABLE ROW LEVEL SECURITY` safety check in the migration. Earlier migrations cover this, but a comment noting that dependency would clarify the migration's safety assumption.
- **Positive 1:** New UPDATE RLS policy has both `USING` and `WITH CHECK` — correct per docs/security.md Section 3.
- **Positive 2:** `actions.ts` zero-row guard on UPDATE via `.select('id')` — follows code-style.md Section 5 pattern.
- **Positive 3:** Error messages sanitized — raw DB errors logged server-side, generic strings returned to client.
- **Positive 4:** `getProfileData()` uses `Promise.all` for concurrent DB calls — correct Server Component data-fetching pattern.
- **New recurring pattern — client-side auth mutations without audit trail:** Security-critical auth operations (password change, account update) done via direct browser Supabase calls bypass the audit event layer. Only operations going through Server Actions can write to `audit_events` via the service role. Template: any mutation that should produce an audit record MUST go through a Server Action, even if Supabase Auth natively supports client-side calls for that operation.
- **Files needing extra scrutiny:** `apps/web/lib/queries/profile.ts` — multi-query fetch function, easy to miss soft-delete guards on related-table joins. `apps/web/app/app/settings/actions.ts` — fix Zod order before shipping.

### 2026-03-26 — commit 8b0aa1ae (fix(quiz): clear stale selection on failed submit + add tests)
- **Files reviewed:** use-session-state.ts, session-answer-block.test.tsx, session-answer-block.tsx, answer-options.tsx, use-session-state.test.ts
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 2 | **GOOD:** 4
- **Suggestion 1:** `use-session-state.ts:32` — `setSelectedOption(selectedId)` is called optimistically before the async `executeSubmit` call returns. On the failure path, the newly added `setSelectedOption(null)` correctly clears it. However, there is a brief window during which `selectedOption` is non-null and `submitting` is true. In that window `AnswerOptions` receives `selectedOptionId=someId` AND `disabled=true`. The disabled+selected combination renders the option highlighted and greyed-out (opacity-50 from the `disabled && !showResult` class). This is the correct visual state for "in-flight" — the selection is locked while the request is in-flight. No bug, but the behavior is implicit. A comment at line 32 noting the optimistic set and the failure-path rollback on line 41 would make the intent explicit for the next maintainer.
- **Suggestion 2:** `session-answer-block.test.tsx` — The test suite does not cover the interplay between `submitting=true` and `selectedOption` being non-null simultaneously (the in-flight window). Specifically: `submitting=true + selectedOption='opt-b'` should show the option as highlighted AND disabled (not just disabled). This is the state during a pending submit. The current `disabled` tests only pass `submitting=true` without a `selectedOption`, which tests the disabled state but not the visual highlight during submission. Low risk given the component logic is a pure prop-forward, but the coverage gap means the in-flight UX regression would not be caught by tests.
- **Positive pattern 1:** `use-session-state.ts:39-41` — The failure branch now correctly sequences: set error first (`setError(result.error)`), then clear selection (`setSelectedOption(null)`). The order matters only at the level of React batching (both run before any re-render in React 18), but the logical order — report the error, then reset input state — is semantically correct and mirrors `handleNext`'s pattern of `setError(null)` then `setSelectedOption(null)`.
- **Positive pattern 2:** `session-answer-block.test.tsx` — `makeProps()` factory with `Partial<>` overrides is a clean pattern for component tests. All 11 tests share a single minimal baseline and only specify what they're testing. No test sets up more props than it needs.
- **Positive pattern 3:** `session-answer-block.test.tsx` — `data-*` attribute stubs for child mocks correctly expose numeric/boolean props as strings (e.g. `data-disabled={String(props.disabled)}`). Assertions use `.toBe('true')` / `.toBe('false')` — consistent with how jsdom serialises dataset values, no implicit coercion risk.
- **Positive pattern 4:** The `FeedbackPanel` mock exposing only `isCorrect` and `onNext` is correctly scoped — it covers only the props the component file actually passes. The mock type does not expose `explanationText` or `explanationImageUrl`, which are internal to `FeedbackPanel`. This correctly isolates `SessionAnswerBlock`'s responsibility from `FeedbackPanel`'s rendering.
- **Pattern confirmed — fix + test in the same commit:** The previous session (b6bab035) flagged both the `setSelectedOption(null)` fix and the missing test as separate findings. This commit delivers both together. Pattern works: ISSUE → fix → SUGGESTION (test) → test added. Clean loop.
- **Note:** The existing `use-session-state.test.ts` at line 115-128 ("sets error and resets submitting when onSubmitAnswer returns failure") does NOT assert `result.current.selectedOption`. That test covers the hook's error path but not the `selectedOption` reset. Adding an assertion `expect(result.current.selectedOption).toBeNull()` to that test would complete the hook-level coverage of the fix. Currently only the component-level test (via the prop-forwarding tests) indirectly validates that the fix works. Low risk because the fix is a single line and the existing test exercises the same code path.

### 2026-03-26 — commit b6bab035 (fix(quiz): prevent double-submission when feedbackData is null)
- **Files reviewed:** session-answer-block.tsx, answer-options.tsx, use-session-state.ts, active-session.tsx, session-runner.tsx
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 1 | **GOOD:** 3
- **Issue:** `use-session-state.ts:32,39-40` — `setSelectedOption(selectedId)` is called unconditionally before the async submit. On the failure path (`result.success === false`), `selectedOption` is left non-null and is never cleared. With the new unconditional `selectedOptionId={selectedOption}` prop in `session-answer-block.tsx`, `AnswerOptions` receives a non-null `lockedSelection` after a failed submit. `showResult` stays false (no `correctOptionId`), so green/red styling is not shown, but `currentSelection = lockedSelection ?? selected` — the prop overrides the internal `selected` state. The user can click a new option (clicks are not blocked since `showResult=false, disabled=false`), `setSelected` fires, but the `??` branch never runs because `lockedSelection` is non-null. The visual highlight stays on the pre-error option — the user cannot see their new selection before retrying. Fix: add `setSelectedOption(null)` in the failure branch of `handleSubmit` in `use-session-state.ts`.
- **Suggestion:** `session-answer-block.tsx` has no co-located test. The error-path selection regression above is not caught by any existing test. Test-writer should add coverage for: (1) no `selectedOption` → Submit disabled, (2) `selectedOption` set + `feedbackData=null` (error path) → options remain interactive and new click updates highlight, (3) `selectedOption` + `feedbackData` set → locked selection, options not interactive.
- **Positive pattern 1:** `answer-options.tsx:46` — `showResult = lockedSelection != null && correctOptionId != null` dual-gate correctly prevents result-mode styling when `selectedOption` arrives before `correctOptionId`. The existing test at line 282 directly covers this contract. The fix relied on this guard being correct — and it is.
- **Positive pattern 2:** `use-session-state.ts:24` — `submittingRef` guard correctly prevents double-submission (the actual bug #318). The fix to `session-answer-block.tsx` is the right approach for the happy path.
- **Positive pattern 3:** `handleNext` correctly calls `setSelectedOption(null)` before advancing — per-question scoping of `selectedOption` is correct on the forward path. Confirms the "lifted selection state not reset on navigation" recurring pattern (logged 2026-03-23) is resolved for this flow.
- **New recurring pattern — fix masks error path via prop gating:** When a prop is gated on a condition (`feedbackData ? value : null`), removing the gate reveals the error path. Before fixing a gated-prop pattern, trace every state the prop's source can be in when the condition is false. In this case, `feedbackData=null` includes both the pre-submit state (selectedOption=null, safe) and the post-failure state (selectedOption=non-null, the hidden regression). The fix correctly unblocked the pre-submit path but re-exposed the post-failure path. Pattern: when removing a prop gate, enumerate ALL states that previously produced the falsy branch — not just the intended one.

### 2026-03-26 — commit 7a7f17e (fix(quiz): keep All filter pill visible when counts hit zero)
- **Files reviewed:** filter-pill.tsx, question-grid.tsx, question-grid.test.tsx
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 1 | **GOOD:** 3
- **All clear.** No security gaps, no logic bugs, no behavioral regressions.
- **Suggestion:** `filter-pill.tsx:50` — Removing the early return solves the bug but makes FilterRow render a lone "All" pill for every quiz session regardless of whether the student has ever flagged or pinned anything. A more targeted guard (`if (flaggedCount === 0 && pinnedCount === 0 && filter === 'all') return null`) would restore the "no-op row hidden" default while still showing the row when the user is in a filtered state and removes the last item. Non-blocking UX suggestion.
- **Positive pattern 1:** Fix is surgical — individual Flagged/Pinned pills remain gated on their respective counts. The early return removal doesn't accidentally expose empty filter pills.
- **Positive pattern 2:** Updated tests assert complete behavioral contracts (row present + All pill present + contextual pills absent) rather than just toggling a single assertion. The fallback test verifies both that the row persists AND that the stale pill disappears.
- **Positive pattern 3:** The existing `useEffect` fallback in `question-grid.tsx` (lines 101-104) that resets `filter` to 'all' when counts drop to 0 composes correctly with the FilterRow change. By the time counts reach 0, filter state is already 'all', so the All pill is active on render.
- **Memory correction:** Positive pattern 5 from commit 5ef6d23 ("filter row correctly conditionally renders only when flaggedCount > 0 || pinnedCount > 0 — the filter UI doesn't appear for quizzes with no flags or pins") is superseded. The new correct pattern: the row always renders; individual Flagged/Pinned pills are conditionally rendered based on their respective counts.

### 2026-03-24 — commits a1db6aa + 8f856dd (fix(quiz): improve quiz session UX + remove unused prop)
- **Files reviewed:** finish-quiz-dialog.tsx, finish-quiz-dialog.test.tsx, quiz-session.tsx, quiz-controls.tsx, quiz-controls.test.tsx, quiz-main-panel.tsx, quiz-tab-content.tsx, explanation-tab.tsx, explanation-tab.test.tsx
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 3 | **GOOD:** 5
- **Issue:** `finish-quiz-dialog.tsx:26-27` — `confirmingDiscard` and `confirmingSubmit` state is NOT reset when the `open` prop flips to `false`. The component returns null early (line 29) but is never unmounted (it lives unconditionally in quiz-session.tsx). `handleClose` correctly resets both vars, but `onSave` (line 143) and `onDiscard` (line 108) call the prop directly with no state reset. After a save or discard that closes the dialog, both confirmation panels retain their last state. On the next open, stacked confirmation panels appear immediately. Fix: add `useEffect(() => { if (!open) { setConfirmingDiscard(false); setConfirmingSubmit(false) } }, [open])`.
- **Suggestion 1:** `finish-quiz-dialog.tsx:151` — `setConfirmingDiscard(true)` does not clear `confirmingSubmit`. `handleSubmitClick` clears `confirmingDiscard`, but the inverse is not enforced. Both panels can appear simultaneously. Fix: add `setConfirmingSubmit(false)` alongside `setConfirmingDiscard(true)`.
- **Suggestion 2:** `finish-quiz-dialog.tsx:57-66` — `<div role="dialog">` is missing `aria-modal="true"`. The replaced `<dialog open>` implied modal semantics natively. The ARIA div needs the explicit attribute for screen readers.
- **Suggestion 3:** `quiz-session.tsx:85` — `md:pb-8` removed, leaving `pb-32` on all screen sizes. No content hidden (128px > footer height), but desktop now has excess whitespace that may be unintentional.
- **Positive pattern 1:** Dialog lifted out of fixed footer to viewport-level — correct fix for `inset-0` stacking context (dialog was centering inside the footer, not the viewport).
- **Positive pattern 2:** Single `QuizControls` instance replaces the dual mobile/desktop split — eliminates the overloaded `onSubmit` dual-purpose prop noted in patterns from commit 5ef6d23.
- **Positive pattern 3:** `onSubmit` renamed to `onSubmitAnswer` at `QuizControls` boundary — removes prop ambiguity between "submit answer" and "submit quiz" paths.
- **Positive pattern 4:** `isCorrect` prop removed from `ExplanationTab` — redundant verdict display eliminated; `AnswerOptions` remains the single source of correct/incorrect feedback.
- **Positive pattern 5:** `handleSubmitClick` two-step confirm logic is correct — `unanswered > 0 && !confirmingSubmit` gate prevents double-confirming.
- **New recurring pattern — dialog state not reset on programmatic close:** A component that conditionally renders null (early-return guard on `open`) but is never unmounted retains state between open/close cycles. `handleClose` covers user-initiated closes (backdrop, Escape, "Return to Quiz") but prop-driven closes (`onSave`, `onDiscard` calling parent handlers directly) bypass state reset. Pattern: any dialog with internal confirmation state that can be closed via callback props needs a `useEffect` keyed on the `open` prop to reset state whenever the dialog closes, regardless of who closed it.

### 2026-03-23 — commit e7648f9 (fix: address CodeRabbit, SonarCloud, and Codecov review findings)
- **Files reviewed:** question-grid.tsx, quiz-config-handlers.ts (new), use-quiz-config.ts, quiz-session.tsx, quiz-main-panel.tsx, info-tooltip.tsx, info-tooltip.test.tsx, question-grid.test.tsx, migration 051
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 3 | **GOOD:** 5
- **Issue:** `question-grid.tsx:61-67` — `effectiveFilter` correctly falls back to `'all'` when the active filter's count drops to 0, but `filter` state is never reset. When `flaggedCount` returns from 0 to 1 (user re-flags a question), `effectiveFilter` snaps back to `'flagged'` without user action, because `filter` was still `'flagged'` internally. Ghost-state bug. Fix: `useEffect` that resets `filter` when the triggering count reaches 0.
- **Suggestion 1:** `quiz-config-handlers.ts` — `createConfigHandlers` factory called on every render, returns unstabilized function references. Behavior-preserving refactor but hides the stability gap. Future effect dependency additions may cause spurious re-runs.
- **Suggestion 2:** `migration 051` — `security_invoker` is correct. App-level audit of direct `flagged_questions` queries (vs. using the view) is the outstanding completion step for Issue 2 from commit 5ef6d23.
- **Suggestion 3:** `quiz-session.tsx:46` — biome-ignore suppression is justified. Comment could be strengthened to explain setter stability as well.
- **Resolved from prior session:** Suggestion 3 from commit 5ef6d23 (needsCollapse computed from totalQuestions regardless of filter) is resolved — `needsCollapse` is now gated on `effectiveFilter === 'all'`.
- **Resolved from prior session:** Issue 1 from commit 5ef6d23 (stale pendingOptionId on navigation) is resolved via `useEffect` keyed on `currentIndex`, with justified biome-ignore.
- **New recurring pattern — ghost state via effectiveFilter:** `filter` state in `question-grid.tsx` is overridden by a derived `effectiveFilter` but not reset when the override condition clears. Pattern: when a derived value silently overrides a state variable's effect, the underlying state must be kept in sync via a reset effect. Otherwise the derived override can reactivate later without user action.

### 2026-03-23 — commit 5ef6d23 (feat(quiz): redesign session layout, fix unflag RLS, responsive grid)
- **Files reviewed:** quiz-session.tsx, quiz-main-panel.tsx, quiz-controls.tsx, question-grid.tsx, answer-options.tsx, flag.ts, migration 050, question-grid.test.tsx, quiz-controls.test.tsx, quiz-main-panel.test.tsx, quiz-session.test.tsx, question-tabs.tsx, question-tabs.test.tsx, info-tooltip.test.tsx
- **CRITICAL:** 0 | **ISSUE:** 2 | **SUGGESTION:** 3 | **GOOD:** 7
- **Issue 1:** `quiz-session.tsx:41-47` + `quiz-session.tsx:163-168` — `pendingOptionId` (the lifted selection state for the mobile Submit footer) is never reset when the user navigates to a different question. `navigate(-1/1)` and `navigateTo(i)` in `useQuizNavigation` do not clear `pendingOptionId` in `quiz-session.tsx`. When the user selects option B on question 1, navigates to question 2, then presses the mobile "Submit Answer" footer button without selecting anything, the footer submits the stale `pendingOptionId` from question 1 as the answer to question 2. `canSubmitAnswer` guards against this only partially: `!s.existingAnswer` blocks re-submission of already-answered questions, but a freshly loaded question 2 has `existingAnswer = undefined`, so `canSubmitAnswer` evaluates to `true` for the stale ID. The footer shows "Submit Answer" and fires `s.handleSelectAnswer(pendingOptionId)` with the wrong option ID.
  - Fix: call `setPendingOptionId(null)` whenever navigation fires. The simplest place is wrapping `s.navigate` and `s.navigateTo` at the call sites in `quiz-session.tsx`, or using a `useEffect` keyed on `s.currentIndex`.
- **Issue 2:** `supabase/migrations/20260323000050_fix_flagged_unflag_rls.sql` — The SELECT policy now returns ALL flags for the student regardless of `deleted_at` (including soft-deleted/unflagged rows). This is intentional — the migration comment correctly explains the FORCE ROW LEVEL SECURITY constraint. However, the new policy opens a data leak vector: a student's full flag history (including previously unflagged questions) is now returned by any query that does NOT include `.is('deleted_at', null)`. The two queries in `flag.ts` were updated in this commit to add explicit `.is('deleted_at', null)` filters, but there is no application-level guardrail preventing future queries from omitting this filter. Any future developer who queries `flagged_questions` via Supabase client and forgets `.is('deleted_at', null)` will silently get soft-deleted rows — a data accuracy bug, not a security breach (the student sees their own history), but a correctness gap. The migration would benefit from a comment explicitly warning that all app-level queries MUST add `.is('deleted_at', null)` as a compensating control. Consider also adding a DB-level view `active_flagged_questions` filtering `deleted_at IS NULL` so callers can use the view instead of remembering the filter.
- **Suggestion 1:** `question-grid.tsx:145` — When a filter is active (e.g. "Flagged") and the current question is not in the filter set, the mobile 2-row window still computes `windowStart` based on the unfiltered `currentIndex`. The `squares` array has `null` entries for hidden questions. `squares.slice(windowStart, windowEnd)` thus returns a slice that may be entirely or partially `null`, rendering as empty gaps in the grid. The visible window will appear to show far fewer than 2 rows of squares when many questions are filtered out. If the current question is not flagged but the user switched to "Flagged" filter, they see a grid that may show 0 squares in the window even though flagged questions exist at other indices. The window logic should be computed on the filtered (non-null) subset, not on the raw `squares` array.
- **Suggestion 2:** `quiz-controls.tsx` — The desktop QuizControls (rendered with `showSubmit={false}`) does not show a Submit button, relying on `AnswerOptions` to render its own desktop "Submit Answer" button (`md:block` on that button). The mobile QuizControls (fixed footer, `showSubmit={canSubmitAnswer}`) shows a Submit button only when `canSubmitAnswer`. The two submit paths have different confirmation semantics: desktop fires `AnswerOptions.onSubmit` → `QuizMainPanel.s.handleSelectAnswer` directly; mobile fires `QuizSession.onSubmit` → `s.handleSelectAnswer(pendingOptionId)`. Both reach the same function, but the indirection is different. This split submit architecture is the root cause of Issue 1 (stale pendingOptionId). A comment at the `QuizControls` call site on line 125 (`showSubmit={false}`) would clarify why desktop submit lives in `AnswerOptions` instead.
- **Suggestion 3:** `question-grid.tsx:62` — `needsCollapse` is computed as `totalQuestions > twoRows`. When a filter is active, the visible square count may be much smaller than `totalQuestions` (e.g. 2 flagged questions out of 40 total). The collapse toggle is shown and "Show all (40)" is rendered even when only 2 squares are visible in the filtered view. The toggle text is misleading — it implies showing 40 questions when the filter limits to 2. Either `needsCollapse` should be computed on the filtered count, or the toggle label should reflect the filtered count.
- **Positive pattern 1:** `answer-options.tsx` — The `showResult` fix (`lockedSelection != null && correctOptionId != null`) correctly prevents the flickering answer-highlighted state that occurs when `selectedOptionId` arrives before `correctOptionId`. Both conditions must be true before locking the UI into result mode. Previously resolved Issue 2 from commit 86d0ed84.
- **Positive pattern 2:** `flag.ts` — Both `toggleFlag` and `getFlaggedIds` now add explicit `.is('deleted_at', null)` instead of relying on RLS. This is the correct compensating control for the RLS change in migration 050.
- **Positive pattern 3:** `quiz-session.tsx:163-168` — The mobile submit handler correctly calls `setPendingOptionId(null)` after submitting, resetting the lifted state on success. The stale ID issue (Issue 1) is only triggered by navigation, not by successful submission.
- **Positive pattern 4:** `question-grid.tsx` — ResizeObserver + `useCallback(measure, [])` correctly prevents the observer from re-subscribing on every render. Cleanup via `observer.disconnect()` in the effect's return function is correct.
- **Positive pattern 5:** `QuestionGrid` filter row correctly conditionally renders only when `flaggedCount > 0 || pinnedCount > 0` — the filter UI doesn't appear for quizzes with no flags or pins.
- **Positive pattern 6:** `quiz-session.tsx` — Desktop QuizControls is rendered with `showFinishDialog={s.showFinishDialog}` (correct, propagates dialog state); mobile QuizControls is rendered with `showFinishDialog={false}` (intentional — mobile has no finish dialog, that lives at desktop). The split is documented by the surrounding JSX structure.
- **Positive pattern 7:** Migration 050 RLS policies both have USING and WITH CHECK on the UPDATE policy (`student_id = auth.uid()` on both sides). Ownership is correctly enforced for the soft-delete UPDATE path.
- **New recurring pattern — lifted selection state not reset on navigation:** `pendingOptionId` is the second instance of "lifted state that should be keyed to current question but isn't explicitly reset on navigation." The previous instance was `selectedOption` in `session-answer-block.tsx` (commit 86d0ed84 Issue 2). Pattern: any state variable that tracks user input on the current question must be reset when `currentIndex` changes. The canonical reset point is: `useEffect(() => { resetLocalState() }, [currentIndex])` or wrapping navigation callbacks at the `QuizSession` level.

### 2026-03-23 — commit 57ec870 (fix(dashboard,quiz): calendar heatmap, compact stats, filter-topic decoupling)
- **Files reviewed:** activity-heatmap.tsx, info-tooltip.tsx, heatmap-info.tsx, stat-cards.tsx, subject-grid.tsx, use-quiz-config.ts, use-filtered-count.ts, lookup.ts, lookup-helpers.ts, dashboard/page.tsx, manual-eval-175-179.md
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 3 | **GOOD:** 5
- **Issue:** `use-quiz-config.ts:68-73` — `fc.refetch` is in the `useEffect` dependency array but `refetch` is a plain function defined inside `useFilteredCount` with no `useCallback` wrapping. In React, every render of `useFilteredCount` produces a new `refetch` function reference. This makes the dependency always referentially different, causing the effect to fire on every render of `useQuizConfig` as long as `subjectId` is set and `hasActiveFilters` is true. The effect itself has early-return guards so the spurious extra calls are gated — but the dependency array correctly lists `fc.refetch` while the underlying hook does not stabilize it. The practical impact is an extra server request per render cycle during active filter state. Wrapping `refetch` in `useCallback` inside `use-filtered-count.ts` would stabilize it.
- **Suggestion 1:** `lookup.ts:54-58` — New early-bail logic (`hasTopics && hasSubtopics`) is logically inverted relative to the old logic's intent. The old code bailed if EITHER array was empty (`topicIds.length === 0 || subtopicIds.length === 0`). The new code only bails if BOTH are empty. This means that passing `topicIds=[]` with a non-empty `subtopicIds` now reaches the DB query (where previously it would have short-circuited). This is the intentional new behavior, but the condition inverts the mental model — `hasTopics` is `true` when `topicIds` is `undefined` OR non-empty, meaning "undefined is the same as having topics." This is non-obvious and could mislead future maintainers. A comment clarifying the intent would help.
- **Suggestion 2:** `docs/manual-eval-175-179.md` — Two checklist items reference the "Practice" link on subject cards (lines 45, 231) but the link was removed from `subject-grid.tsx` in this commit. The manual eval doc now instructs testers to verify behavior that no longer exists, which will cause confusion during QA.
- **Suggestion 3:** `activity-heatmap.tsx` — The `now` value is memoized with `useMemo(() => new Date(), [])` — the empty dep array means it is captured once at mount and never updated. For a dashboard page that might be left open across midnight, the `todayDay` and `isFutureDay` calculations will remain anchored to the mount-time date. This is an acceptable UX tradeoff (page refresh fixes it) but is worth noting.
- **Positive pattern 1:** `use-filtered-count.ts` — generation counter (`filterGeneration`) correctly prevents stale async results from overwriting fresh state when rapid filter changes fire multiple overlapping server calls. Race condition is handled correctly.
- **Positive pattern 2:** `use-quiz-config.ts` — `mountedRef` pattern correctly suppresses the spurious effect firing on initial mount. The mount-skip is correctly implemented as a ref (not state), avoiding a double-render.
- **Positive pattern 3:** `activity-heatmap.tsx` — ISO weekday offset `(getUTCDay() + 6) % 7` correctly converts JS Sunday=0 to ISO Monday=0 for the calendar grid alignment. Math is correct.
- **Positive pattern 4:** `lookup.ts` — `getFilteredCount` retains Zod validation on all inputs and auth check before any DB access. Security posture maintained across the refactor.
- **Positive pattern 5:** `getDailyActivity(365)` — The `boundParam` guard in `analytics.ts` caps at 365, so the call-site change from 31 to 365 is safe and cannot be escalated by user input.
- **Recurring pattern — unstabilized function in useEffect deps:** First occurrence of a `useEffect` depending on an unstabilized function reference from a sibling hook. Pattern: any function returned from a custom hook and used in another hook's `useEffect` dependency array should be wrapped in `useCallback` at the source.

### 2026-03-23 — commit 281b05f (fix(reports): address CodeRabbit + SonarCloud review findings)
- **Files reviewed:** reports-list.test.tsx, reports-list.tsx, session-card.tsx, session-table.tsx, docs/plan.md
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 2 | **GOOD:** 4
- **All clear.** No security gaps, no logic bugs, no behavioral regressions.
- **Suggestion 1:** `session-table.tsx:53` — The `<Link>` inside the Subject `<td>` calls `e.stopPropagation()` to prevent the row's `onClick` from double-firing. This is correct for mouse clicks but does not stop keyboard events. When keyboard focus is on the `<Link>` and the user presses Enter, the browser fires a click event on the link (navigates) AND the `<tr>` `onKeyDown` also fires on the same keystroke if the `<tr>` itself is focused. In practice, `<tr tabIndex={0}` and `<a href>` inside a cell are two separate tab stops, so both cannot be focused simultaneously — this is safe today. However, it is a subtle invariant that is not documented. A comment on the `stopPropagation` call would clarify why it is sufficient for mouse but not needed for keyboard (the latter is structurally prevented by separate focus targets).
- **Suggestion 2:** `reports-list.test.tsx:7-9` — The `useRouter` mock returns a plain `vi.fn()` for `push`. The mock is declared at the module level but not reset in `beforeEach`. Across the sort-behavior tests (lines 144-187), each test calls `userEvent.click()` on row items; if a future test relies on `push` having been called zero times, the stale call count from a prior test will cause a false positive. Adding `vi.resetAllMocks()` in a `beforeEach` at the top of the describe block would make the mock isolation explicit.
- **Positive pattern 1:** `getAnchorLinks()` helper correctly isolates `<a>` elements from `<tr role="link">`. This is the right fix for the test isolation gap flagged in the PR-level sweep (2026-03-21 entry) — the test now targets the canonical link element rather than the ARIA role which now matches both the `<a>` and the keyboard-accessible `<tr>`. Good self-contained fix.
- **Positive pattern 2:** `Readonly<{...}>` applied consistently to all four component prop types touched in this commit (ReportsList, SessionCard, SessionTable, SessionRow). No partial application.
- **Positive pattern 3:** `== null` / `!= null` flip is behavior-preserving. Both `scorePercentage == null` and `scorePercentage != null` with swapped branches produce identical output — the change is purely cosmetic for TypeScript narrowing. Verified no logic regression.
- **Positive pattern 4:** `tabIndex={0}` + `onKeyDown` + `focus-visible` outline correctly added to `<tr>` as a single coherent a11y fix — all three pieces needed for a keyboard-navigable non-interactive element are present together.
- **Previous suggestion resolved:** Desktop table row full-row clickability (ISSUE from 2026-03-21 PR sweep) is now addressed via `onClick={navigate}` + `onKeyDown`. The inconsistency with `SessionCard` (which used a wrapping Link) is resolved with a complementary pattern appropriate for a table layout.
- **Pattern note — mock reset omission:** Second occurrence of `useRouter`/`push` mock defined at module level without `beforeEach` reset. The first was in session-table tests added in commit ca55c3c. Low risk while tests are independent, but worth flagging as a latent isolation issue.

### 2026-03-21 — PR-level sweep: feat/179-reports-redesign (commits b104ae4..ca55c3c)
- **Files reviewed:** session-table.tsx, session-card.tsx, reports-list.tsx, reports-list.test.tsx, reports-utils.ts, reports-utils.test.ts, score-color.ts, score-color.test.ts, score-ring.tsx, docs/plan.md
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 4 | **GOOD:** 6
- **Issue:** `session-table.tsx:38` — desktop table wraps only the Subject cell in a `<Link>`, while the full row has hover styling. `SessionCard` (mobile) correctly wraps the entire card. Navigation on desktop degraded to a single cell despite the full-row hover affordance. The a11y fix commit (ca55c3c) fixed mobile but missed this inconsistency. Also breaks link test isolation: jsdom renders both views and `getAllByRole('link')` returns links from both, making the test assertion non-deterministic if column order changes.
- **Suggestion 1:** `session-card.tsx` / `session-table.tsx` — mock_exam displays "EXAM" (plain amber text) in mobile card vs. styled "Exam" badge in desktop table. Visually inconsistent between breakpoints. Also `MODE_LABELS.mock_exam = 'Exam'` in reports-utils.ts is a dead entry — neither component reaches it for mock_exam.
- **Suggestion 2:** `reports-utils.ts:formatDate` — no guard against invalid Date input. Third occurrence across the codebase (formatDuration in commit 29b441f, formatDate in commit b104ae4 initial, same function here at PR level). `isNaN(d.getTime())` guard should be added.
- **Suggestion 3:** `reports-list.test.tsx:169-177` — arrow character assertions use Unicode literals in textContent, fragile if arrow moves to CSS pseudo-element.
- **Suggestion 4:** `reports-list.test.tsx:92-111` — color assertions use `.find()` across both desktop and mobile DOM nodes. Passes as long as either component uses inline style. Would give false positive if one component switches to CSS class color.
- **Positive resolutions from commit b104ae4 review:** test name corrected (toggles date to ascending), `score-color.ts` now has co-located test, `reports-utils.ts` now has co-located test, `scoreColor` correctly shared from `score-ring.tsx`.
- **Recurring pattern — partial a11y fix:** a11y fix applied to mobile component (`SessionCard`) but not to the structurally different desktop component (`SessionTable`). Pattern: when an a11y fix applies to a feature rendered by two sibling components (responsive split), verify the fix in both.
- **Recurring pattern — formatDate invalid input:** Three occurrences of formatting utilities that call `new Date(input)` without `isNaN` guard. Recommend adding a lint/review rule: any utility that calls `new Date(userString)` must guard with `isNaN(d.getTime())`.

### 2026-03-21 — commit b104ae4c (feat(reports): redesign with session table, mode badge, color-coded scores)
- **Files reviewed:** score-color.ts (new), session-card.tsx (new), session-table.tsx (new), reports-utils.ts (new), reports-list.tsx (refactored), reports-list.test.tsx (updated), score-ring.tsx (minor)
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 4 | **GOOD:** 4
- **Issue:** `reports-list.test.tsx:134-141` — test named "toggles date to ascending when Date button is clicked twice" but only clicks once. Test passes because one click on the active sort key flips direction (default is desc → one click gives asc). Name actively misstates the behavior and will mislead future maintainers if `toggleSort` semantics change.
- **Suggestion 1:** `session-table.tsx:37-63` — six `<Link>` elements per row (one per `<td>`), all with the same `href`. Produces six tab stops and six screen-reader announcements per row. `SessionCard` correctly uses a single wrapping link.
- **Suggestion 2:** `reports-utils.ts:1-5` — `MODE_LABELS.mock_exam = 'Exam'` is a dead entry. Both `SessionCard` and `SessionTable` short-circuit on `exam === true` before reaching the map. Dead entry is misleading to future readers.
- **Suggestion 3:** `score-color.ts` — new utility in `lib/utils/` has no co-located `.test.ts` file. Violates code-style.md Section 7 rule that new lib utilities must ship with tests. EASA pass-mark boundary (70%, 50%) is the highest-risk path and is untested at the unit level.
- **Suggestion 4:** `reports-utils.ts:formatDate` — no guard against invalid Date input. `new Date(invalid).toLocaleDateString()` returns the string "Invalid Date" visible in UI. Second occurrence of a utility function in this codebase lacking an invalid-input guard (previous: `formatDuration` in commit 29b441f).
- **Positive patterns:** `scoreColor` correctly extracted to a shared utility rather than duplicated in `ScoreRing` and the reports components. `ReportsList` correctly uses `md:hidden`/`md:block` for responsive layout without a JS media query. Sort logic correctly handles null `scorePercentage` via `?? 0` fallback — null scores sort as 0 rather than NaN. `'use client'` stays on `ReportsList` (sort state) while `SessionCard` and `SessionTable` are pure Server-compatible components with no client dependency — correct boundary placement.
- **Recurring pattern — missing utility test:** `score-color.ts` follows the pattern of `formatDuration` in commit 29b441f — both are new utility files in `lib/` that shipped without co-located tests. Two occurrences. Recommend adding the test rule to the checklist for the test-writer agent.
- **Recurring pattern — invalid input guard missing in formatting utilities:** `formatDate` (this commit) and `formatDuration` (commit 29b441f) both compute a value from a DB string without guarding against invalid/empty input. Two occurrences. Pattern: whenever a formatting utility calls `new Date()` or arithmetic on a DB timestamp, add `isNaN` / `Math.max(0, ...)` guards.

### 2026-03-21 — commit 29b441f (feat(quiz): redesign results page with score ring, stats grid, question breakdown)
- **Files reviewed:** quiz-report.ts, result-summary.tsx (new), score-ring.tsx (new), question-breakdown.tsx (new), report-question-row.tsx, report-card.tsx, page.tsx, quiz-report.test.ts, report-card.test.tsx, report-question-row.test.tsx
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 3 | **GOOD:** 6
- **Issue:** `quiz-report.ts:85` — `easa_subjects` lookup drops `error` from the destructure. Every other failure path in `getQuizReport` logs and returns `null`. This one silently falls back to `subjectName = null` and continues. If the subjects table is unavailable (RLS block, missing table in a new environment, migration not yet run), the function returns a report with a missing subject name rather than surfacing the error. Inconsistent with the established error handling pattern in the same function.
- **Suggestion 1:** `score-ring.tsx:11` — Color thresholds changed from the old `scoreColor` function (≥75% green) to `≥70% green`. Also, colors are hardcoded hex (`#22C55E`, `#F59E0B`, `#EF4444`). SVG `fill`/`stroke` attributes do not inherit CSS variables, so these values bypass the project's oklch theme system and dark mode. The ring will render the same color in both light and dark themes, ignoring `--color-destructive` etc.
- **Suggestion 2:** `result-summary.tsx:4` — `formatDuration` does not guard against negative duration (endedAt before startedAt due to malformed DB data). `Math.round(ms / 1000)` on a negative `ms` yields a negative `totalSeconds`, producing output like `-1m -5s`. A `Math.max(0, totalSeconds)` guard would prevent nonsense output.
- **Suggestion 3:** `quiz-report.ts:103-106` — Direct SELECT on `questions` table is intentional for the post-session report (the `.coderabbit.yaml` no-answer-exposure rule explicitly carves out this case when both the ended_at guard and the options stripping are present — both are). However, the SELECT includes `options` JSONB which may contain a `correct` field on the raw DB rows. The stripping in `buildReportQuestions` (`options.map((o) => ({ id, text }))`) is the only defense. This is correct and intentional — logging it as a positive pattern to ensure future reviewers do not flag it as a false positive.
- **Positive patterns:** `ended_at` guard (line 80) correctly blocks mid-session access before any question data is fetched. `buildReportQuestions` strips `correct` from options via `{ id: o.id, text: o.text }` projection — confirmed defense. `QuestionBreakdown` correctly uses `'use client'` at the lowest interactive boundary (pagination state) while `ReportCard` and `ResultSummary` remain Server Components. `optionLetter` correctly returns `''` for not-found IDs, and the "No answer" rendering path handles empty string correctly. Subject lookup uses `.maybeSingle()` (correct for nullable FK — no PGRST116 on miss). Auth guard (`if (!user) return null`) remains in place before all DB queries.
- **Pattern note — Supabase error silently dropped:** Fourth occurrence of a `.from(...).select()` chain where only `{ data }` is destructured without `{ error }`. In query-only (non-mutation) contexts, the project pattern is inconsistent — some queries check error, some don't. This is a low-severity pattern but worth watching: if the subjects table is missing in CI or a migration is unrun, the silent `null` fallback hides the root cause.

### 2026-03-21 — commit f6f5ba6 (feat(quiz): action bar with flag/pin, finish dialog stacked buttons, DB flags)
- **Files reviewed:** use-flagged-questions.ts (new), quiz-session.tsx, quiz-main-panel.tsx, quiz-controls.tsx, quiz-nav-bar.tsx, finish-quiz-dialog.tsx, flag.ts, flag.test.ts, quiz-session.test.tsx, quiz-main-panel.test.tsx, quiz-nav-bar.test.tsx
- **CRITICAL:** 0 | **ISSUE:** 2 | **SUGGESTION:** 3 | **GOOD:** 5
- **Issue 1:** `use-flagged-questions.ts:27` — `toggle` calls `toggleFlag({ questionId })` without `await` being visible in `useTransition`. The toggle is called directly (not inside `startTransition`), so it is a raw async call with no transition boundary. If the Server Action call fails (`result.success === false`), the hook silently returns `false` with no error surfaced to the UI. The flag button shows no loading state during the round-trip and no error state on failure. Compared to `getFlaggedIds` which runs inside `startTransition`, the toggle has no equivalent concurrency protection. This is a behavioral inconsistency within the same hook.
- **Issue 2:** `finish-quiz-dialog.tsx:108-109` — After the button swap in this commit, the primary "Submit Quiz" button's `onClick` is `onSubmit`. The "Return to Quiz" button's `onClick` is `handleClose`, which calls `setConfirmingDiscard(false)` then `onCancel`. If a user had previously clicked "Discard Quiz" (entering `confirmingDiscard=true`), then backed out with Cancel, then opened the dialog again, the `confirmingDiscard` state is local to the component and survives re-open (since `open` is prop-driven, not unmounting the component). This was pre-existing before this commit, but this commit moved `handleClose` off the submit button (where it called `handleClose` = cancel+close) onto a dedicated "Return to Quiz" button, making the dialog harder to close accidentally — this is a UX improvement. However: the new primary button calls `onSubmit` directly, bypassing `handleClose`. If submission fails, `showFinishDialog` remains open, but `confirmingDiscard` is `true` if the user had entered that state. The "Discard Quiz" confirm panel and the "Submit Quiz" primary button are now simultaneously visible if the user: (1) clicks Discard → (2) submission starts → (3) submission fails while `confirmingDiscard=true`. This requires an unusual failure mode but the state machine is inconsistent.
- **Suggestion 1:** `use-flagged-questions.ts:15` — The identity-check deduplication guard (`prevIdsRef.current === questionIds`) only works if the parent stabilizes the array reference (e.g., via `useMemo`). The comment "stable array from parent" is an assumption, not an enforced invariant. `s.questionIds` in `quiz-session.tsx` is derived from `useQuizState` — if `useQuizState` reconstructs the array on every render, this guard never fires and `getFlaggedIds` is called on every render. Worth verifying or documenting the stability contract.
- **Suggestion 2:** `quiz-main-panel.tsx:83-89` — The new "Finish Test" button in the header has no `disabled` state during `s.submitting`. The action bar's "Submit Quiz" button (via `FinishQuizDialog`) correctly disables during submission. Two entry points to the same dialog with different disabled-during-submit behavior.
- **Suggestion 3:** `unflagQuestion` in `flag.ts:59-65` — this has two identical return statements after the zero-row check (lines 64 and 65). The `if (!data?.length) return { success: true, flagged: false }` branch and the fall-through return the same value. The zero-row check correctly returns success, but the select result is now destructured (`.select('student_id')`) per the fix from the PR-level sweep finding — the duplicate return is harmless but indicates the fix was partially applied (select added, but the zero-row path still returns the same thing as the success path, so callers still cannot distinguish concurrent unflag from local unflag).
- **Positive patterns:** `toggleFlag` in the hook correctly drives local state from `result.flagged` (server truth), not from a local toggle of the previous state — avoids desync bugs. `getFlaggedIds` returns `{ success: true, flaggedIds: [] }` on unauthenticated rather than throwing — graceful degradation. `EMPTY_SET` constant correctly removed and replaced with real DB data. `onToggleFlag` is wired correctly all the way from `quiz-session.tsx` through `quiz-main-panel.tsx` → `quiz-controls.tsx` → `ActionButton` — no prop-declared-but-not-forwarded gap (contrast with `learningObjective` in commit 8771aa2). `aria-pressed` correctly used on the toggle buttons — correct semantic for toggle state.
- **Previous ISSUE resolved:** `flaggedIds={new Set()}` hardcoding from commit 3aa5a6b (quiz grid, session commit) is now fully fixed — `flaggedIds` from DB is wired to both `QuestionGrid` and `QuizControls`.
- **Previous PR-sweep ISSUE partially resolved:** `unflagQuestion` now has `.select('student_id')` and `data?.length` check (zero-row case) — but both branches of the zero-row check return the same `{ success: true, flagged: false }` value. The structural fix is correct; behavioral outcome is unchanged.

### 2026-03-20 — commit 8771aa2 (feat(quiz): comments thread UI, statistics card, LO box, userId threading)
- **Files reviewed:** comments-tab.tsx (rewrite), use-comments.ts (new), statistics-tab.tsx, explanation-tab.tsx, quiz-tab-content.tsx, quiz-main-panel.tsx, quiz-session.tsx, quiz-session-loader.tsx, session/page.tsx, actions/comments.ts, migration 049
- **CRITICAL:** 0 | **ISSUE:** 2 | **SUGGESTION:** 2 | **GOOD:** 5
- **Issue 1:** `learningObjective` prop is declared in `QuizTabContentProps` and in `ExplanationTabProps` but is never destructured or forwarded inside `QuizTabContent`. The LO box added to `ExplanationTab` is unreachable — no call site can make it render. Fix: destructure `learningObjective` in `QuizTabContent` and pass it to `ExplanationTab`.
- **Issue 2:** `addComment` and `removeComment` use inconsistent mutation strategies. `removeComment` is optimistic (updates state first, rolls back on failure). `addComment` is pessimistic (awaits server, then updates state). The behavioral inconsistency means delete appears instant while add has visible latency with no loading indicator. Both operations in the same hook should follow the same strategy.
- **Suggestion 1:** `addComment` error from a previous failed attempt is never cleared when the user starts a new submission. In `handleSubmit`, there is no `setError(null)` call before invoking `addComment`. A stale error message is visible while the user types a new comment. Fix: call `setError(null)` (or expose a clearError from the hook) at the start of `handleSubmit`.
- **Suggestion 2:** `getComments` returns `{ success: true, comments: [] }` on unauthenticated call (carried from commit 6520962 review, unresolved). All other comment/flag actions return `{ success: false, error: 'Not authenticated' }`. Silent empty response hides auth failures from callers.
- **Positive patterns:** `userId` flows from Server Component (`supabase.auth.getUser()`) through the prop chain to `CommentsTab` — never derived client-side, never trusted from local state. Delete authorization is a two-layer design: UI hides the button (`isOwn` check) and RLS enforces ownership at DB level — correct defense-in-depth. Generation counter pattern in `useComments` correctly prevents stale responses from landing when question changes rapidly. Zod validation + auth checks on all three comment actions. `question_comments` migration correctly has ENABLE + FORCE RLS, split policies per operation, and index scoped to non-deleted rows.
- **Pattern note — prop declared but not forwarded:** `learningObjective` is the third occurrence of a prop added to a type definition but dropped in the implementation body (prior: `flaggedIds={new Set()}`, `answeredIds` stale mock). Pattern: when a prop drives a rendering path (conditional box, icon, aria-label), actively verify at least one code path forwards the prop to the component that consumes it.
- **Pattern note — mutation strategy inconsistency within same hook:** When a hook exposes multiple mutation functions (add + remove), they should follow the same optimistic/pessimistic strategy unless there is a documented reason for the difference. Mixed strategies create unpredictable UX and test complexity.

### 2026-03-20 — commit 86d0ed84 (feat(quiz): redesign answer options with letter circles + state colors)
- **Files reviewed:** answer-options.tsx (changed), answer-options.test.tsx, session-answer-block.tsx, quiz-main-panel.tsx, quiz-main-panel.test.tsx, use-quiz-state.ts
- **CRITICAL:** 0 | **ISSUE:** 2 | **SUGGESTION:** 3 | **GOOD:** 4
- **Issue 1:** `disabled` prop does not gate `setSelected` in the onClick handler. Guard is `!showResult && setSelected(option.id)` — missing `!disabled`. HTML `disabled` blocks native clicks in most browsers, but synthetic/AT clicks bypass it. One-character fix: `!showResult && !disabled && setSelected(option.id)`.
- **Issue 2:** `session-answer-block.tsx:31` gates `selectedOptionId` behind `feedbackData`: `selectedOptionId={feedbackData ? selectedOption : null}`. When `feedbackData` is null (e.g., component re-mount or navigation before feedback resolved), `showResult=false` and `AnswerOptions` renders in pre-submit mode for a question that was already answered. The Submit button reappears and a double-submission is possible. Fix: pass `selectedOptionId={selectedOption}` unconditionally — `correctOptionId` already gates whether result colors appear.
- **Suggestion 1:** LETTERS array has no documented ceiling. Fallback to numeric `String(index + 1)` is safe but silently inconsistent for >8 options. Add a comment asserting the EASA max-4-options assumption.
- **Suggestion 2:** `data-selected` attribute is not set when `showResult=true`, making it unreliable for E2E automation of post-submission state. Consider `data-pending-selection` semantics or a separate `data-show-result` attribute.
- **Suggestion 3:** "disables all option buttons" test uses `getAllByRole('button').filter(...)` which counts Submit button in the result. Fragile assertion — `toBeGreaterThan(0)` would pass if only Submit were disabled. Rewrite using `data-testid="option-*"` selectors.
- **Positive patterns:** `getOptionStyle` extracted to pure named function with explicit boolean params — correct pattern for testable style derivation. `showResult` derived from single canonical source (`lockedSelection != null`) — no partial-state risk. `key={s.question.id}` at call site correctly resets local state on navigation.
- **Pattern note — `disabled` prop bypass via missing onClick guard:** Two-layer defense (HTML `disabled` attribute + onClick guard) is the correct pattern for interactive controls. HTML `disabled` alone is not a behavioral contract. Always include `!disabled` in onClick guards when the component manages local selection state.

### 2026-03-20 — commit 3aa5a6b (feat(quiz): full-screen session layout + color-coded question grid)
- **Files reviewed:** layout.tsx (new), quiz-session.tsx, quiz-main-panel.tsx, question-grid.tsx, use-quiz-state.ts, question-card.tsx, question-grid.test.tsx, quiz-session.test.tsx
- **CRITICAL:** 0 | **ISSUE:** 2 | **SUGGESTION:** 2 | **GOOD:** 5
- **Issue 1:** `QuizSession` hardcodes `flaggedIds={new Set()}` (quiz-session.tsx:37) — flagged question IDs are never passed to the grid, so the flag icons and aria-labels added in this commit never appear in real usage. The `flaggedIds` prop, `FlagIcon`, and flagged aria-label string are dead code in production.
- **Issue 2:** `getCircleClass` (question-grid.tsx:39-44) gives the current question `bg-primary text-primary-foreground` regardless of whether it is answered or not. This means the current question's color overrides the correct/incorrect feedback color once the student navigates back to an already-answered question. The test "current question overrides correct/incorrect color" documents this as intentional, but the user has no way to know they already answered this question correctly or incorrectly — the green/red state is hidden behind `bg-primary`. This is a real UX regression relative to the old `ring-2` pattern, which applied the ring as an additional signal on top of the answered color.
- **Suggestion 1:** `quiz-session.test.tsx` mocks `QuestionGrid` with a stale prop signature: the mock still declares `answeredIds: Set<string>` (line 113) which no longer exists in the real component. The mock compiles and tests pass only because TypeScript mock bodies are not type-checked against the real component signature here. A future caller reading the test would see `answeredIds` and incorrectly assume the real component accepts it.
- **Suggestion 2:** The new `layout.tsx` uses `fixed inset-0 z-50`. The parent `AppShell` already implements its own fullscreen guard (`isFullscreen` on line 20 of `app-shell.tsx`) that strips the nav entirely and renders `min-h-screen bg-background`. Both mechanisms coexist correctly today, but the two-layer fullscreen approach (AppShell hides nav + layout.tsx overlays fixed div) is undocumented. If either layer is removed independently, the other leaves a visible or invisible artefact. A comment on `layout.tsx` explaining the two-layer contract would prevent future breakage.
- **Positive patterns:** `feedbackMap` derivation in `quiz-session.tsx` correctly copies only `{ isCorrect }` — does not expose the full `FeedbackEntry` including `correctOptionId` to the grid. Good minimal data exposure. `getCircleClass` correctly returns `null` sentinel for unanswered state (feedback returns `null` not `undefined`). `aria-label` correctly appends flagged/pinned state to each button. `feedback` Map exposed from `useQuizState` is the same Map reference already held by the hook — no data duplication. Test "current question overrides correct/incorrect color" documents the priority rule for reviewers.
- **Pattern note — hardcoded empty set for wired-but-unused feature:** `flaggedIds={new Set()}` is the second occurrence (prior: `answeredIds` was removed but its mock not cleaned up) of a prop added to a component and wired to rendering logic but never passed real data at the call site. Future reviews should actively check: when a new prop drives rendering (icons, aria-labels, CSS classes), verify at least one call site passes non-empty data.

### 2026-03-20 — PR-level sweep: feat/177-comments-flags (commits 6520962..693c544)
- **Files reviewed:** comments.ts, flag.ts, flag.test.ts, comments.test.ts, migration 049, types.ts, database.md, code-style.md
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 3 | **GOOD:** 7
- **Issue:** `unflagQuestion` (flag.ts:47-57) adds `.is('deleted_at', null)` predicate (good — narrows the race) but does not chain `.select('student_id')` or check `data?.length`. Zero-row updates return no error, so a concurrent unflag leaves the caller with `{ success: true, flagged: false }` indistinguishable from a successful local unflag. Violates the zero-row no-op rule added in the same PR (code-style.md commit 3). `deleteComment` in the same PR does it correctly — inconsistency within the same feature.
- **Suggestion 1:** `getComments` returns `{ success: true, comments: [] }` on unauthenticated call; all other actions return `{ success: false, error: 'Not authenticated' }`. Carried forward from commit-1 review, unresolved at PR level.
- **Suggestion 2:** `flagQuestion` UPSERT resurrection path (soft-deleted row reflagged) is behaviorally correct but lacks a comment explaining the SELECT+upsert interaction. Test suite has no "reflag previously-unflagged question" scenario.
- **Suggestion 3:** RLS SELECT policy EXISTS subquery intent (orphaned-auth defense) is undocumented in the migration comment. Carried forward from commit-1 review, unresolved at PR level.
- **Cross-commit consistency positive:** Zero-row rule doc (commit 3) correctly documents the pattern that deleteComment (commit 2) follows. Doc-to-code alignment is correct for comments; misalignment for unflagQuestion.
- **Pattern note — "rule written, not followed":** This PR introduced a new doc rule (zero-row no-op check) and a feature that partially follows it. Future reviews should actively cross-check: when a new rule is added in commit N of a PR, verify all code touched by the PR complies with it, not just the file where the rule was triggered.

### 2026-03-20 — commit 6520962 (feat(quiz): add question_comments table + flag/comment Server Actions)
- **Files reviewed:** comments.ts (new, 93 lines), flag.ts (new, 96 lines), 20260320000049_question_comments.sql (new, 44 lines), types.ts (regenerated), database.md (updated)
- **CRITICAL:** 0 | **ISSUE:** 2 | **SUGGESTION:** 3 | **GOOD:** 5
- **Issue 1:** `deleteComment` (comments.ts:86) sends DELETE with no application-layer ownership filter. RLS enforces ownership, but a no-op delete (wrong commentId or cross-user attempt) silently returns `{ success: true }`. Caller cannot detect the no-op. Fix: add `.eq('user_id', user.id)` to the query and detect zero-row match.
- **Issue 2:** `toggleFlag` (flag.ts:28-47) uses a read-then-write pattern (SELECT then UPDATE or UPSERT). Rapid toggle-toggle sequence from two tabs can leave the flag in the wrong state. Fix: make the unflag path a single atomic UPDATE with `.is('deleted_at', null)` in the predicate; check row-count to detect concurrent unflag.
- **Suggestion 1:** RLS SELECT policy on `question_comments` uses `EXISTS (SELECT 1 FROM users WHERE id = auth.uid())` as a per-row subquery. Correct but undocumented; should be commented to explain the orphaned-user defense intent.
- **Suggestion 2:** `getComments` returns `{ success: true, comments: [] }` on unauthenticated call (line 20) while all other quiz actions return `{ success: false, error: 'Not authenticated' }`. Inconsistent with established pattern; proxy makes the silent-empty path unreachable in production but it hides auth failures from callers.
- **Suggestion 3:** `createComment` uses `.single()` after insert; if a trigger suppresses the insert without error, `.single()` returns PGRST116 which is logged as a generic "Failed to create comment" with no insert-vs-read distinction.
- **Positive patterns:** UPSERT correctly sets `deleted_at: null` on conflict to reactivate soft-deleted flags. RLS has FORCE ROW LEVEL SECURITY + three discrete policies covering SELECT/INSERT/DELETE. All actions have `'use server'` + Zod validation. `COMMENT_SELECT` constant ensures consistent shape between list and insert returns.

### 2026-03-20 — commit 2d1901af (fix(deps): bump next 16.1.6 → 16.1.7 to resolve 12 security alerts)
- **Files reviewed:** apps/web/package.json, packages/db/package.json, pnpm-lock.yaml
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 0 | **GOOD:** 3
- **All clear.** Pure patch security bump. No application code changed.
- **Consistency verified:** Both consumers (apps/web pinned, packages/db caret) updated. Zero stale 16.1.6 references in lockfile. All @next/swc-* platform binaries updated atomically. No other packages or apps declare next — coverage is complete.
- **Pattern note:** Correct monorepo dep bump pattern: consuming app pins precisely (16.1.7), library package uses caret (^16.1.7), lockfile resolves to single version across both consumers. No code review needed for pure lockfile bumps with no behavior changes.

### 2026-03-20 — commit f846d96 (test: add subject-row tests and return value to ensureLoginTestUser)
- **Files reviewed:** subject-row.test.tsx (new, 288 lines), e2e/helpers/supabase.ts (+2 lines)
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 2 | **GOOD:** 3
- **All clear.** No security gaps, no logic bugs.
- **Suggestion 1:** Collapsible mock in subject-row.test.tsx does not wire `onOpenChange`, so the open/close toggle path is not exercised. `CollapsibleContent` renders children unconditionally. Tests pass but a regression in toggle logic would go undetected. Fix: wire `onOpenChange` in the mock and guard `CollapsibleContent` rendering on the `open` prop.
- **Suggestion 2:** `ensureLoginTestUser` now returns `{ orgId, userId }` symmetrically with `ensureTestUser`, but both current callers (login.spec.ts:8, password-reset.spec.ts:10) still discard the return value. The fix for the asymmetry (Suggestion 1 from 7c5b6ca) has been applied, but the intent of the new return value is not discoverable from callers. Consider a comment on the return statement.
- **Positive patterns:** Full behavioral coverage for both action paths (upsertSubject + upsertTopic) — success, error-return, and thrown-exception all covered. Edit-mode lifecycle complete including "stays in edit mode on failure" negative case. `ensureLoginTestUser` is now fully symmetric with `ensureTestUser` in both shape and error handling.
- **Recurring suggestion resolved:** `ensureLoginTestUser` return value asymmetry (first logged in 7c5b6ca) is now fixed.

### 2026-03-20 — commit 7c5b6ca (fix: resolve 4 maintenance issues #273, #282, #280, #266)
- **Files reviewed:** subject-row.tsx, topic-row.tsx (admin syllabus), topic-row.tsx (quiz), topic-row.test.tsx, quiz-config-form.test.tsx, e2e/helpers/supabase.ts
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 2 | **GOOD:** 4
- **All clear.** No security gaps, no logic bugs.
- **Suggestion 1:** `ensureLoginTestUser` (supabase.ts:93) does not return `{ orgId, userId }` while its counterpart `ensureTestUser` (supabase.ts:22) does. Neither current caller uses the return value, so no break today, but the inconsistency means a future caller cannot discover orgId/userId from `ensureLoginTestUser` without internal refactoring.
- **Suggestion 2:** `subtopic-row.tsx` has no toggle button (subtopics are leaf nodes), so no aria-label gap there — the pattern was applied correctly at subject and topic level only. However, this is worth noting: if subtopics ever get a toggle, the `aria-label="Toggle ${code} ${name}"` pattern established in this commit must be applied there too.
- **Positive patterns:** aria-label improvements applied consistently at both levels (subject-row + topic-row + quiz topic-row). New test for authError=true correctly verifies both the message text AND the button disabled state — two assertions covering two behavioral consequences of the same flag. `ensureLoginTestUser` org-migration branch exactly mirrors the pattern from `ensureTestUser`, including error destructuring. test fixture `buildDefaultConfig()` now includes `authError: false` as an explicit default, preventing future mismatches if the hook's return type grows.
- **Behavioral consistency confirmed:** aria-label pattern is "Toggle {code} {name}" in all three files that have a toggle button. subtopic-row.tsx has no toggle button — correctly omitted.
- **Error-signal-to-UI gap (from d93f924) resolved:** quiz-config-form.tsx now renders authError correctly. Corresponding test added in this commit covers both the true and false states.

### 2026-03-20 — commit 5a68fa3 (fix: extract helpers, render authError, revert CI to Node 22)
- **Files reviewed:** lookup-helpers.ts (new), lookup.ts, quiz-config-form.tsx, use-filtered-count.test.ts, use-quiz-config.test.ts, all 8 CI workflow files, package.json
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 1 | **GOOD:** 5
- **All clear.** ISSUE from d93f924 (authError not rendered) is now fixed in quiz-config-form.tsx. Stale-auth test gap (Suggestion 3 from d93f924) is now covered. CI revert complete across all 8 relevant workflow files.
- **Extraction verified:** buildQuestionQuery and groupCounts extracted to lookup-helpers.ts with identical behavior. Empty-array guard ordering preserved (guard at lookup.ts:53 fires before buildQuestionQuery call at lookup.ts:55).
- **Suggestion:** lookup-helpers.ts has no co-located test file. buildQuestionQuery has four branching paths (OR-logic, topic-only, subtopic-only, passthrough) — tested indirectly via lookup.test.ts but not directly. File is independently importable, gap grows if new callers are added.
- **Pattern confirmed:** @types/node can track a newer major than the runtime (^25 types, Node 22 runtime) — only the runtime and CI NODE_VERSION need to match LTS.

### 2026-03-20 — commit d93f924 (fix: resolve 3 tech-debt issues #305, #304, #250)
- **Files reviewed:** lookup.ts, use-filtered-count.ts, use-quiz-config.ts, quiz-config-form.tsx, all test files, CI workflows, package.json
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 3 | **GOOD:** 5
- **Issue:** authError boolean is correctly threaded from getFilteredCount() → useFilteredCount → useQuizConfig → quiz-config-form.tsx props, but quiz-config-form.tsx never renders it. Student whose session expired sees a silent frozen state (count stays null, no explanation). One-line fix in quiz-config-form.tsx.
- **Suggestion 1:** .catch(() => undefined) in use-filtered-count.ts swallows all non-auth errors silently. Narrow in practice (Server Action doesn't throw on auth), but if Zod parse throws or infrastructure fails, the user sees an unexplained empty state with no error flag set.
- **Suggestion 2:** Node.js engines bumped to ">=25" — Node 25 is a current-release (non-LTS) line. @types/node ^25 is fine as a dev dependency; the engines and NODE_VERSION in CI should stay on the LTS line (22) to match production deployments.
- **Suggestion 3:** Missing test for stale-closure guard interaction with auth error — if superseded fetch returns { error: 'auth' }, the code correctly ignores it via the generation check (line 55 before auth check), but no test covers this ordering. Low risk, cheap insurance test.
- **Positive patterns:** empty spread for error fallback, guard reorder correctness, finally always clears isFilterPending, auth error clearing on all three paths (set / reset / successful refetch), consistent auth error shape across Server Actions.

### 2026-03-18 — PR-level sweep: feat/174-login-redesign (18 commits, full diff)
- **Files reviewed:** proxy.ts, confirm/route.ts, callback/route.ts, reset-password/page.tsx, reset-password/actions.ts, done/route.ts, reset-password-form.tsx, forgot-password-form.tsx, proxy.test.ts, confirm/route.test.ts, callback/route.test.ts, reset-password-form.test.tsx, password-reset.spec.ts
- **CRITICAL:** 0 | **ISSUE:** 1 | **SUGGESTION:** 3 | **GOOD:** 6
- **Issue:** proxy.ts gained two new behaviors (recovery session guard + error-param preservation) with no new tests in proxy.test.ts. New behavior is tested by E2E but not unit-tested.
- **Suggestion 1:** clearRecoveryCookie in actions.ts is exported but never imported or called — dead code. Cookie cleanup is handled by done/route.ts instead.
- **Suggestion 2:** callback/route.test.ts mocks `.single()` returning `{ data: null }` with no error for the "no profile" case, but real Supabase .single() returns `{ data: null, error: { code: 'PGRST116' } }`. The test outcome is correct but the mock doesn't reflect the real Supabase behavior.
- **Suggestion 3:** window.location.origin in forgot-password-form.tsx (pre-existing, still unfixed) — see Recurring Issues.
- **Pre-existing open issues not addressed in this PR:** login audit event missing, window.location.origin in redirectTo.
- **Core security properties confirmed correct:** allowlist-guarded confirm route, proxy recovery guard, page-level cookie gate, 10-minute cookie TTL, signOut after password update.

### 2026-03-18 — commit 610e358 (fix: address remaining CodeRabbit findings on PR #262)
- **Files changed:** reset-password-form.tsx, reset-success.tsx (new), docs/decisions.md
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 1 | **GOOD:** 3
- **Suggestion:** `__recovery_pending` cookie is only cleaned up if the user clicks
  the "Sign in" link in `ResetSuccess`. If the user closes the tab after seeing
  the success message, the cookie persists. Because `signOut()` already ran, the
  cookie strands them on a confusing "session missing" error on their next visit to
  /reset-password. Fix: call `clearRecoveryCookie()` Server Action from `handleSubmit`
  immediately after `setSuccess(true)`.
- **Pattern noted:** Side-effect cleanup split across a user-action link vs. an
  unconditional code path — watch for this in other auth success flows.

---

## Recurring Issues

### Auth route partial-gate bypass — recovery branch skips profile-existence check (1st occurrence)
**First seen:** commit 5cc4109 (2026-03-17) — auth switch to email+password
**File:** `apps/web/app/auth/callback/route.ts`
**Pattern:** A new flow branch (recovery/password-reset) was added to an existing
auth route handler that has a mandatory gate (profile-existence check + signOut on
missing profile). The new branch was inserted after `exchangeCodeForSession` but
before the gate, so it exits the route without running the gate. Any user who exists
in Supabase Auth but has no `public.users` row can obtain a live session via the
recovery flow.
**Rule:** When adding a branch to an auth route, treat every existing early-exit
(signOut + error redirect) as a gate that the new branch must also pass through,
unless there is a documented reason to skip it.
**Status:** FIXED — commit 47df5cf moved the recovery branch after all profile gates. Two regression tests added (one for the happy path with profile, one for the rejection path without profile). Both tests would have been red against the original code. Closed.

### Client-side origin in server-configured redirectTo URL (1st occurrence)
**First seen:** commit 5cc4109 (2026-03-17) — forgot-password-form.tsx
**File:** `apps/web/app/auth/forgot-password/_components/forgot-password-form.tsx`
**Pattern:** `window.location.origin` was used to construct the `redirectTo` URL
passed to Supabase's `resetPasswordForEmail`. The value is correct in production
but fragile — it depends on the browser's current origin being canonical. On
preview deployments or misconfigured environments, Supabase will reject the URL,
causing confusing errors. The pattern should use a server-supplied env var.
**Watch for:** Any `redirectTo`, `callbackUrl`, or similar Supabase-consumed URL
constructed from `window.location.*` in client components. These should use
`process.env.NEXT_PUBLIC_APP_URL` or equivalent.
**Status:** ISSUE — 1st occurrence, fix in progress.

### Required audit event not emitted after auth method switch (1st occurrence)
**First seen:** commit 5cc4109 (2026-03-17) — login flow moved to client-side
**Pattern:** The `student.login` audit event was implicitly emitted via the server-side
`/auth/callback` route (which ran on every magic-link login). After switching to
`signInWithPassword` in a client component, the login flow never hits a server-side
route, so the audit event is never written. The security doc's event table became
stale without the migration being flagged.
**Watch for:** When an auth flow is refactored, explicitly audit which server-side
handlers are no longer in the hot path. Required audit events (security.md §10) must
be emitted from server-authoritative code — client components cannot be trusted to
write to the audit log.
**Status:** ISSUE — 1st occurrence, fix in progress.

### RPC RETURN QUERY missing session_id ownership scope on join table (1st occurrence)
**First seen:** commit 1f76a7b (2026-03-16) — get_report_correct_options migration 034
**File:** `packages/db/migrations/034_report_correct_options_derive_from_session.sql`
**Pattern:** The RETURN QUERY joins `quiz_session_answers` and `questions` but filters
only by `sa.session_id = p_session_id`. The session ownership check happens in a
preceding EXISTS guard. However, because `quiz_session_answers` has RLS with
`USING (session_id IN (SELECT id FROM quiz_sessions WHERE student_id = auth.uid()))`,
a SECURITY DEFINER function bypasses RLS entirely — the RETURN QUERY executes as the
function definer, not as the calling user. The preceding EXISTS guard covers the
session ownership check, so this is NOT a bug in this commit (the guard works correctly).
But the pattern is worth watching: in future SECURITY DEFINER functions that query
join tables, RLS is bypassed and the WHERE clause must carry the ownership filter explicitly.
**Watch for:** Any SECURITY DEFINER RETURN QUERY that joins tables whose RLS relies on
session ownership — the RLS is invisible to the function, the WHERE clause must encode it.
**Status:** SUGGESTION — reviewed 1f76a7b, no bug in current code. Watch for future RPC patterns.

### quiz_session_answers has no deleted_at — SECURITY DEFINER query correctly omits the filter (confirmed GOOD pattern)
**First seen:** commit 1f76a7b (2026-03-16)
**File:** `packages/db/migrations/034_report_correct_options_derive_from_session.sql`
**Pattern:** `quiz_session_answers` is an immutable table with no `deleted_at` column
(schema confirmed in initial_schema.sql). The new RETURN QUERY correctly omits a
`deleted_at IS NULL` filter for `sa`. This is correct — there is no such column.
Only `questions q` carries `AND q.deleted_at IS NULL`, which is also correct.
Do NOT flag missing `deleted_at` filter on quiz_session_answers — the table does not have the column.
**Status:** GOOD — confirmed correct, no action needed. Logged to prevent false-positive re-flagging.

### Error signal propagated through hook chain but not rendered in UI (1st occurrence)
**First seen:** commit d93f924 (2026-03-20) — authError in quiz config form
**File:** `apps/web/app/app/quiz/_components/quiz-config-form.tsx`
**Pattern:** A new error discriminant (authError boolean) was threaded correctly
through three hook layers (getFilteredCount → useFilteredCount → useQuizConfig)
and exposed in the component props, but the component never consumed it in JSX.
The rendering gap leaves users with a silent frozen state instead of an actionable
message. The fix required in lookup.ts (the source) and the hooks was correct; only
the last leg — the render — was missing.
**Watch for:** When a new error/state signal is added to a hook's return type, grep
all consumers of that type for the new field before closing the issue. Especially
when the signal surfaces an auth state change (session expiry) — those are always
user-visible events that must be communicated.
**Status:** ISSUE — 1st occurrence, fix pending.

### Read-then-write race in toggle mutations (1st occurrence)
**First seen:** commit 6520962 (2026-03-20) — flag.ts toggleFlag
**File:** `apps/web/app/app/quiz/actions/flag.ts`
**Pattern:** Toggle logic implemented as SELECT then UPDATE-or-UPSERT across two separate DB round-trips. A rapid double-tap or concurrent tab can read the same initial state before either write lands, causing both requests to take the same branch. The final state is usually correct for simple toggle, but for toggle-toggle (flag then unflag) sequences the second read can see the pre-first-write state and both end up on the wrong branch.
**Watch for:** Any "check then act" pattern for state that can be toggled rapidly from the UI. Collapse to a single atomic UPDATE with a predicate that encodes the current expected state (e.g., `.is('deleted_at', null)` for the unflag path). Use row-count or `.select().single()` to detect the no-match case and return a correct status without a second round-trip.
**Status:** ISSUE — 1st occurrence, fix pending.

### Silent success on no-op deletes (1st occurrence)
**First seen:** commit 6520962 (2026-03-20) — comments.ts deleteComment
**File:** `apps/web/app/app/quiz/actions/comments.ts`
**Pattern:** DELETE via RLS-protected query with no application-layer ownership guard or row-count check. When the RLS policy prevents the delete (non-owner), Supabase returns no error and no affected rows — and the Server Action returns `{ success: true }`. Callers cannot distinguish "deleted" from "nothing matched".
**Watch for:** Any DELETE Server Action that relies purely on RLS for ownership enforcement without also filtering by `user_id = user.id` in the query AND verifying at least one row was affected. The pattern in `deleteDraft` (draft-delete.ts) is the correct reference: explicit `.eq('student_id', user.id)` in the query, error checked, success returned only on confirmed mutation.
**Status:** ISSUE — 1st occurrence, fix pending.

### Suppression rules referencing undefined severity levels (1st occurrence)
**First seen:** commit b32d56a (2026-03-16) — security-auditor suppression rule 9
**File:** `.claude/agents/security-auditor.md`
**Pattern:** A new suppression condition was assigned "WARNING" severity, but the
security-auditor's severity schema only defines CRITICAL, HIGH, and MEDIUM. An
undefined level has no blocking/non-blocking declaration, so the pre-push hook
cannot act on it correctly. The finding will be emitted but never blocked.
**Watch for:** Any agent rule that introduces a severity label not present in that
agent's own severity table. Always cross-check the label against the agent's defined
levels before finalizing the rule.
**Status:** ISSUE — 1st occurrence, watching.

### Agent suppression rules with unverifiable conditions from diff context alone (1st occurrence)
**First seen:** commit b32d56a (2026-03-16) — security-auditor suppression rule 9, condition 3
**File:** `.claude/agents/security-auditor.md`
**Pattern:** A suppression condition required verifying that an RPC "does not return
PII or correct answers." The agent operates on git diffs. When the RPC definition
is in a migration file not included in the diff, the agent cannot verify the condition
and may suppress a CRITICAL finding (correct-answer exposure) incorrectly.
**Watch for:** Suppression rules that require knowledge of code NOT in the diff
(RPC SQL bodies, schema definitions, existing policy text). These rules must either
include an explicit "read the migration file" instruction or fall back to "treat as
unmet" when the referenced artifact is not visible.
**Status:** ISSUE — 1st occurrence, watching.

### Suppression rule numbering collision with main checklist numbering (PARTIALLY RESOLVED — ISSUE open)
**First seen:** commit b32d56a (2026-03-16) — security-auditor.md DO NOT section
**File:** `.claude/agents/security-auditor.md`
**Pattern:** The HIGH section and the DO NOT section both use sequential integers
starting from single digits. After the commit, both sections contain an item
numbered 9. Non-contiguous DO NOT numbering (1,2,3,5,6,8,9) also pre-existed.
After the branch fixes (d6e8224, 0f40bd6), the DO NOT section collision and the
duplicate HIGH block were resolved. However, the MEDIUM section still starts at 11,
overlapping with HIGH items 11-15. A reader or the agent itself sees two independent
items numbered 12 in different severity classes. Flagged as ISSUE in PR-level review
(2026-03-16).
**Watch for:** Agent files where the DO NOT section is numbered and the main
checklist is also numbered — collision is easy to introduce when a new item is
appended to DO NOT without checking the checklist numbering. Applies equally to
severity-section boundaries: renumbering one section without auditing adjacent sections
leaves a collision intact.
**Status:** ISSUE — DO NOT section resolved (d6e8224), HIGH duplicate resolved (0f40bd6),
MEDIUM collision (items 11-15 overlap with HIGH 11-15) still open. Fix: renumber MEDIUM 16-20.

### Partial @ts-expect-error removal after library type improvement (confirmed ISSUE — 2nd occurrence)
**First seen:** commit 225a163 (2026-03-16, PR #211)
**Second seen:** PR #211 full-diff review (2026-03-16) — confirmed ISSUE, not SUGGESTION
**Files:** `apps/web/app/app/admin/syllabus/actions/upsert-subject.ts`,
           `apps/web/app/app/admin/syllabus/actions/upsert-topic.ts`,
           `apps/web/app/app/admin/syllabus/actions/upsert-subtopic.ts`
**Pattern:** When a dependency upgrade improves TypeScript inference depth (removing the
need for `@ts-expect-error`), the removal sweep was applied only to `.update()` calls.
The `.insert()` calls in the same files still carry the suppression. A dangling
`@ts-expect-error` that suppresses no error is itself a TS2578 compile error in TS ≥5.5.
The Turborepo type-check cache masked this — a force re-check is needed.
**Watch for:** Any commit that removes `@ts-expect-error` for one method on a table while
leaving the same suppression on a sibling method on the same table. Verify both remove
cleanly with `pnpm check-types --force` (bypass turbo cache).
**Rule:** When turbo reports "cached" for type-checks in a commit that bumped dependencies,
always force a re-check: `pnpm check-types --force`. The cache cannot reflect the new types.
**Status:** ISSUE — confirmed in PR #211 full-diff review.

### Turbo type-check cache can mask new compile errors after dependency bumps (2nd occurrence — RULE CANDIDATE)
**First seen:** PR #211 review (2026-03-16)
**Second seen:** commit c5025f6 review (2026-03-16) — commitlint 20, jsdom 29, @types/node 22 bump
**Pattern:** `pnpm check-types` showed "3 cached, 3 total" after a batch dependency bump
that changed `@supabase/supabase-js`, `@supabase/ssr`, and `vitest`. Cached results do not
reflect new type definitions introduced by the bumped packages. Any `@ts-expect-error`
removals or new casts made in the same commit on the assumption that types improved could
be silently wrong if the cache serves a pre-bump result. Same concern applies when
`@types/*` packages are bumped — turbo does not invalidate on transitive type-definition changes.
**Watch for:** Any dependency-bump commit where `pnpm check-types` reports cache hits.
Always add `--force` when evaluating type correctness of dep-bump commits.
**Rule (proposed for CLAUDE.md):** After any dep-bump commit, run `pnpm check-types --force`
to bypass turbo cache before treating type-check as green.
**Status:** RULE CANDIDATE — 2 occurrences across different commits; learner memory updated.

### Dependency version bump diverges local cookie options type annotation from library type (RESOLVED)
**First seen:** commit 225a163 (2026-03-16, per-commit review)
**Resolved:** commit 603b36c (2026-03-16, same PR) — CookieOptions imported from @supabase/ssr
**Files:** `packages/db/src/server.ts`, `packages/db/src/middleware.ts`
**Package:** `@supabase/ssr` bumped from 0.5.2 → 0.9.0
**Pattern:** The `setAll` callback annotated `options` as `Record<string, unknown>` (per-commit
review of 225a163), while 0.9.0 defines `CookieOptions = Partial<SerializeOptions>`. This was
fixed in the same PR by commit 603b36c: both files now import `CookieOptions` from `@supabase/ssr`
directly and use it as the parameter type. The `@types/cookie@0.6.0` entry was also removed from
pnpm-lock.yaml; cookie types now come from the `cookie@^1.x` package bundled by ssr.
**Status:** RESOLVED — fixed in commit 603b36c, PR #211.

### Non-redirect responses in proxy.ts missing cookie copy (1st occurrence)
**First seen:** commit 6b49021 (2026-03-15)
**File:** `apps/web/proxy.ts`
**Pattern:** The proxy uses a `redirectWithCookies()` helper to ensure every
redirect copies the refreshed Supabase session cookies from the `response` object.
When a non-redirect response is added (e.g., a `new NextResponse('Forbidden', { status: 403 })`),
it bypasses `redirectWithCookies()` and drops the token refresh silently. The
affected user's next request will see an expired token.
**Root cause:** The pattern is easy to get right for redirects (the helper is
prominent) but easy to forget for non-2xx responses, where the developer's mental
model is "it's an error, no session needed".
**Watch for:** Any `return new NextResponse(...)` in proxy.ts that does NOT go
through `redirectWithCookies()`. The `response.cookies.getAll()` loop must be
applied to EVERY response that leaves the proxy after a `getUser()` call.
**Status:** CRITICAL — flagged in 6b49021.

### RC bundler (rolldown) pulled into production test toolchain via Vite 8 (1st occurrence)
**First seen:** commit d9de1dd (2026-03-17) — vite 7→8 migration
**Files:** `apps/web/package.json`, `packages/db/package.json`
**Pattern:** Vite 8.0.0 replaces rollup with rolldown@1.0.0-rc.9 as its bundler, and
`@vitejs/plugin-react` 6.0.1 drops Babel/react-refresh in favour of rolldown's OXC
transform (via `@oxc-project/runtime`). The RC designation (`rc.9`) is pre-stable.
The concern is whether OXC's JSX transform is byte-for-byte compatible with Babel's
output in all cases (especially import meta, decorators, or edge-case JSX spread patterns).
In practice for a test-only scenario (vitest, not the Next.js build), the risk is
contained: Next.js itself still uses its own Babel/SWC pipeline. However, the OXC
runtime is executing as part of every `pnpm test` run. Any OXC bug that affects
coverage instrumentation or module mocking could silently mis-report coverage or
cause test-pass false positives. Watch for: tests that pass locally but fail
in CI on the OXC code path; coverage drops not explained by code changes.
**Status:** SUGGESTION — 1st occurrence, watching. No current bug visible in diff.

### esbuild promoted from required to optional in Vite 8 (1st occurrence)
**First seen:** commit d9de1dd (2026-03-17) — vite 7→8 migration
**Files:** `pnpm-lock.yaml`
**Pattern:** In Vite 7, `esbuild` was a required (non-optional) dependency; in Vite 8
it is an optional peer (`optional: true` in lockfile). In this project esbuild@0.27.4
is still installed (it is an optional peer that pnpm resolved). The risk is that in
environments where esbuild is absent (e.g., a stripped Docker layer), Vite 8 falls
back to the rolldown/OXC pipeline exclusively. As long as esbuild is pinned in the
lockfile this is not a gap — but it is worth noting if the lockfile is regenerated
on a machine that excludes optional deps.
**Status:** SUGGESTION — 1st occurrence, no current gap. Logged for awareness.

### Turbo type-check cache masks new compile errors after dep bumps (3rd occurrence — RULE ACTIVE)
**Seen again:** commit d9de1dd (2026-03-17) — vite 7→8, @vitejs/plugin-react 5→6
**Pattern:** Same pattern as c5025f6 and PR #211. `@vitejs/plugin-react` 6 changes
its TS export surface (Babel type declarations removed, OXC types added). If
`pnpm check-types` reports cache hits after this bump, the result is unreliable.
`pnpm check-types --force` is mandatory before treating type-check as green on this
commit.
**Status:** RULE ACTIVE — already in CLAUDE.md. Enforce `--force` on this commit.

### Supabase query error silently swallowed in auth helpers (2nd occurrence)
**First seen:** commit 83ae098 (2026-03-14) — getUser error ignored in some Server Actions
**Second seen:** commit 6b49021 (2026-03-15) — requireAdmin() profile lookup ignores error
**File:** `apps/web/lib/auth/require-admin.ts`
**Pattern:** Auth helper functions that make a secondary DB lookup (e.g., fetching
the user's role profile) frequently destructure only `{ data }` and silently ignore
`{ error }`. Because the fallback behavior when error occurs happens to be safe
(access denied), the bug is invisible in production — but it produces no log signal
when the DB has a connectivity problem, making incident diagnosis much harder.
**Rule:** Always destructure `{ data, error }` and log the error before the guard check.
**Status:** ISSUE — flagged twice, should become a code-style rule.

### getUser hardening sweep — easy to miss one file (2nd occurrence)
**First seen:** commit 83ae098 (2026-03-14)
**File:** `apps/web/app/app/quiz/session/page.tsx`
**Pattern:** When a commit claims to harden `getUser()` error handling "across N files",
it is common for one file in the same directory tree to be missed. In this commit,
`quiz/session/page.tsx` still uses `if (!user) redirect('/')` without checking `authError`,
while every other /app/* page and layout was updated. The diff does not include the file,
so it passes the per-file review — only a grep across the whole tree catches it.
**Watch for:** Any commit that describes a "consistent" change across many files — always
grep for the old pattern across the full tree, not just the diff. Command:
  `grep -rn "getUser" apps/web --include="*.ts" --include="*.tsx" | grep -v "authError"`
**Status:** ISSUE — flagged in 83ae098.

### signOut omitted on new error branch in auth callback (1st occurrence)
**First seen:** commit 83ae098 (2026-03-14)
**File:** `apps/web/app/auth/callback/route.ts`
**Pattern:** When a new early-return branch is added to the auth callback after
`exchangeCodeForSession` succeeds, the existing `not_registered` branch's `signOut()` call
is the reference pattern for session cleanup. New branches that redirect away without
calling `signOut()` leave a potentially valid session cookie in the browser.
**Watch for:** Any new redirect branch in `route.ts` that follows `exchangeCodeForSession`
— verify `signOut()` is called before the redirect. Also verify the corresponding test
asserts `expect(mockSignOut).toHaveBeenCalledOnce()` or `.not.toHaveBeenCalled()` to
document intent explicitly.
**Status:** ISSUE — flagged in 83ae098.

### NULL correct_option not guarded in submit_quiz_answer but guarded in batch_submit (1st occurrence)
**First seen:** commit 83ae098 (2026-03-14)
**Files:** `supabase/migrations/20260314000036_submit_answer_softdelete_and_option_validation.sql`,
           `supabase/migrations/20260314000037_batch_submit_option_validation.sql`
**Pattern:** When two RPCs perform equivalent answer-scoring logic, a guard added to one
(batch_submit: `IF v_correct_option IS NULL THEN RAISE...`) should be added to both.
Migration 037 added the NULL-correct-option guard but the same-commit migration 036 did not.
**Watch for:** Any time `submit_quiz_answer` and `batch_submit_quiz` are updated in the same
commit — check both for behavioral parity on: NULL correct option, soft-deleted questions,
session ended check, membership check. They must remain consistent.
**Status:** ISSUE — flagged in 83ae098.

### getUser authError split-guard pattern in discard.ts diverges from all other Server Actions
**First seen:** commit 83ae098 (2026-03-14)
**File:** `apps/web/app/app/quiz/actions/discard.ts`
**Pattern:** `discard.ts` uses two separate guards with two different error strings instead
of the combined `if (authError || !user)` pattern used by every other Server Action.
The pre-existing inconsistency was not caught by the hardening sweep. User-visible error
messages that differ between `authError` and `!user` cases leak Supabase internal state
categorization unnecessarily.
**Standard pattern (use this):**
  `if (authError || !user) return { success: false, error: 'Not authenticated' }`
**Watch for:** Any Server Action that returns different error strings for `authError` vs
`!user`. They should be treated as one case from the caller's perspective.
**Status:** ISSUE — flagged in 83ae098.

### Biome CSS formatting (trailing zeros, quote normalisation) is semantically safe
**First seen:** commit 7216c0e (2026-03-14)
**File:** `apps/web/app/globals.css`
**Pattern:** Biome reformats CSS custom properties by stripping trailing zeros from oklch()
values (`0.1880` → `0.188`, `1.0000` → `1.0`) and normalising string quotes. All these changes
are numerically identical — CSS parsers treat trailing zeros as insignificant. No color shift,
no precision loss, no visual change.
**Watch for:** A future Biome run that changes a non-trailing digit (e.g., rounding `0.6231` to
`0.623`) would be a real color regression. Only trailing zeros are safe to strip.
**Status:** GOOD — correctly identified as formatting-only.

### doc entry attributes multi-migration feature to a single migration
**First seen:** commit d040665 (2026-03-14)
**File:** `docs/decisions.md`
**Pattern:** When a feature is built across two migrations (e.g., migration 15 adds the null-check
guard, migration 16 upgrades the inequality operator), the doc entry for the second migration
described both layers as if that migration introduced them. Readers consulting the doc to understand
migration boundaries will attribute the null-check to the wrong migration.
**Watch for:** Any decisions.md or database.md entry that says a migration "uses" or "implements"
a multi-step behaviour — verify which migration introduced each step.
**Status:** ISSUE — flagged in d040665, fix needed in decisions.md before push.

### comment uses directional word ("above") that contradicts actual line ordering in code
**First seen:** commit d040665 (2026-03-14)
**File:** `apps/web/lib/fsrs/update-card.ts`
**Pattern:** A comment explaining a type cast used the word "above" to describe a call that is
actually positioned below the cast in the file. The explanation was otherwise correct; only the
spatial reference word was wrong.
**Watch for:** Inline comments describing where something is (above/below, earlier/later) — verify
the direction against the actual line order before writing or accepting the comment.
**Status:** SUGGESTION — flagged in d040665, non-blocking.

### catch-all console.error logging ZodErrors as unexpected errors
**First seen:** commit 40ce785 (2026-03-14)
**File:** `apps/web/app/app/quiz/actions/fetch-stats.ts`
**Pattern:** A try/catch added to a Server Action wraps both input validation
(Zod) and internal async calls (DB, auth) under a single `console.error`.
ZodErrors are expected validation rejections for malformed client input — they
are not unexpected internal errors. Logging them at error level alongside real
DB/auth failures pollutes production logs and erodes signal quality.
**Fix pattern:** Discriminate before logging:
```ts
} catch (err) {
  if (!(err instanceof ZodError)) console.error('[fn] Error:', err)
  throw err
}
```
**Watch for:** any new or modified try/catch in a Server Action or Server
Component function where the catch block calls `console.error(err)` without
first checking `err instanceof ZodError`. The pattern is especially risky when
validation and async DB calls share a single try block.
**Status:** ISSUE — flagged in 40ce785, pending fix.

### Turbo type-check cache hits on dep-bump commits require force re-check (2nd occurrence)
**First seen:** PR #211 review (2026-03-16) — @supabase/ssr bump
**Second seen:** commit c5025f6 (2026-03-16) — @types/node 20→22, jsdom 28→29, commitlint 19→20
**Pattern:** `pnpm check-types` reported "3 cached, 3 total" immediately after bumping
@types/node from v20 to v22. The cache cannot reflect new Node.js type definitions.
Any code that happened to use Node 20-only types, or that collided with new v22 types,
would be silently accepted. In this commit the types are clean (manual validation ran
`pnpm check-types --force` equivalent — turbo showed cached but the installed types
matched). This is the second time a dep-bump commit has hit the type-check cache issue.
**Rule:** On any dep-bump commit that changes a `@types/*` package, always run
`pnpm check-types --force` (bypasses turbo cache) to get a true type-check result.
**Status:** SUGGESTION — 2nd occurrence, pattern is confirmed. Add to pre-commit doc or
CLAUDE.md as a note under the dep-bump workflow.

### actions/checkout bumped to a version that does not yet exist on GitHub Marketplace (1st occurrence)
**First seen:** commit 13ce663 (2026-03-16)
**Files:** `.github/workflows/ci.yml`, `e2e.yml`, `codeql.yml`, `redteam.yml`
**Pattern:** `actions/checkout@v6` is a real, published version (v6.0.0, 2025-11-20).
However it is a very new major version — Dependabot proposed v4 (actions/setup-node),
and the manual bump to checkout@v6 skipped v5 entirely. The key risk: v6's main
change is "persist creds to a separate file" (credential isolation). Projects that
relied on the `.git/config` credential helper approach will behave differently.
For a standard checkout-and-build pipeline this is benign, but it should be noted.
**Also note:** upload-artifact@v7 changes the default upload to ESM internally and
adds a new `archive` parameter. No breaking change for existing callers — the default
behaviour (archive=true) is preserved. No action needed.
**Watch for:** If Dependabot later proposes checkout@v5 (which it would if the repo
was pinned to v4), reject it — we are now at v6. Ensure Dependabot's minor/patch group
for github-actions will pick up v6.x patch releases automatically.
**Status:** GOOD — all versions confirmed real. Flagged for awareness only.

### CI action version bump — all four workflow files must be bumped together (1st occurrence)
**First seen:** commit 13ce663 (2026-03-16)
**Files:** `.github/workflows/ci.yml`, `e2e.yml`, `codeql.yml`, `redteam.yml`
**Pattern:** When bumping shared GitHub Actions versions across multiple workflow files,
the commit correctly updates all four files together with no missed occurrence.
Every `actions/checkout@v4` became `@v6`, every `upload-artifact@v4` became `@v7`,
and both `codeql-action` sub-actions (`init` and `analyze`) moved to `@v4` in sync.
**Watch for:** Future bumps — the pattern is 4 files share `checkout` + `setup-node`;
ci.yml is the only file without Supabase setup steps and thus has a simpler dependency
graph for version changes.
**Status:** GOOD — no missed occurrences found.

### awk `found` flag never reset between files in timeout-fallback branch of security auditor (1st occurrence)
**First seen:** commit f2357a0 (2026-03-15)
**File:** `.claude/hooks/run-security-auditor.sh` lines 88-94
**Pattern:** The timeout-fallback branch wraps the awk adminClient check in a
redundant outer `grep` filter and does NOT reset `found` when a new `+++ b/` header
for a non-app/ file is encountered. The inner awk pattern lacks the reset rule
`/^\+\+\+ b\//{if(!/apps\/web\/app\//)found=0}`. If an app/ file header appears earlier
in the diff and a later non-app/ file adds `adminClient`, the inner awk will still match
and produce a false positive. The agent-failure fallback branch (line 119) has the correct
reset rule. The two fallback branches are inconsistent.
**Watch for:** Any edit to the security-auditor fallback awk checks — verify both the
timeout branch (around line 90) and the agent-failure branch (around line 119) have identical
awk logic, specifically the `found=0` reset when a new non-app/ file header is seen.
**Status:** ISSUE — flagged in f2357a0.

### localhost guard in import script does not cover HTTPS URLs pointing to localhost (1st occurrence)
**First seen:** commit f2357a0 (2026-03-15)
**File:** `apps/web/scripts/import-questions.ts` line 86
**Pattern:** The guard checks `url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')`.
HTTPS variants (`https://localhost`, `https://127.0.0.1`) would bypass the guard and
trigger the safety exit with a misleading error message (refusing to run but actually the URL
IS local). This is low-risk in practice because local Supabase only serves HTTP, but the
guard's intent is "is this local?" and the implementation is incomplete.
**Status:** SUGGESTION — flagged in f2357a0.

### seed script subject validation missing: questions array empty check before subjects.size check (1st occurrence)
**First seen:** commit f2357a0 (2026-03-15)
**File:** `apps/web/scripts/import-questions.ts` lines 437-443
**Pattern:** The new subjects-consistency validation calls `questions[0]` in `resolveRefs`
immediately after the set check. If `questions` is an empty array, `subjects.size` is 0
(not > 1), the check passes, and then `questions[0]` is `undefined`, crashing in `resolveRefs`
with a TypeError instead of a meaningful message. The `ImportFileSchema.safeParse` may or
may not enforce `minLength(1)` — needs verification.
**Watch for:** Any array validated by size/diversity checks where the empty-array case
is not separately guarded before the diversity check.
**Status:** ISSUE — flagged in f2357a0.

### SECURITY DEFINER RPC missing session-ownership scope — correct answers exposed to arbitrary authenticated users (1st occurrence)
**First seen:** commit f1f6c32 (2026-03-16)
**File:** `packages/db/migrations/032_get_report_correct_options.sql`
**Pattern:** A new `get_report_correct_options` RPC accepts an arbitrary `p_question_ids uuid[]`
and returns correct option IDs, guarded only by `auth.uid() IS NULL`. Any authenticated student
can call it directly via the Supabase JS client, bypassing the TypeScript completed-session check
in `quiz-report.ts`. The TypeScript caller correctly checks `session.ended_at`, but that check
lives in the caller — a SECURITY DEFINER function is itself the security boundary (it bypasses RLS),
so the ownership and completion check must also be in the RPC.
**Rule:** Any SECURITY DEFINER RPC that returns answer-keyed data must accept a `p_session_id`
parameter and verify: (1) the session is owned by `auth.uid()`, (2) `ended_at IS NOT NULL`,
(3) `deleted_at IS NULL`. The TypeScript caller's guards are defence-in-depth, not the primary gate.
**Watch for:** Any new RPC that takes a list of question IDs and returns correct-answer data
without a session-scoped ownership check. "The caller checks this" is not a sufficient defence —
callers can be bypassed.
**Status:** ISSUE — flagged in f1f6c32.

### explicit `correct`-field strip removed incidentally during refactor, leaking field via hydration payload (1st occurrence)
**First seen:** commit f1f6c32 (2026-03-16)
**File:** `apps/web/lib/queries/quiz-report.ts` line ~133 (buildReportQuestions)
**Pattern:** The pre-refactor code had an explicit `.map((o) => ({ id: o.id, text: o.text }))` to
strip the `correct` boolean from options before returning to the client. The refactor removed this
projection (replacing it with `options,`) because the `QuestionRow` type no longer declares `correct`.
But TypeScript `as` casts are compile-time only — the runtime object still carries `correct: true/false`
from the DB. The field is visible in `__NEXT_DATA__` / RSC flight data.
**Rule:** Stripping sensitive fields from DB objects must happen via explicit property projection
(`{ id, text }` spread), never via TypeScript type narrowing alone. Type narrowing does not mutate
the runtime value. The correct test for "did we strip it?" is `Object.keys(options[0])` not
`options[0].correct === undefined` in TypeScript.
**Watch for:** Any `as SomeType[]` cast on a DB result where the source type has more fields than
the target type. Narrowing to a smaller type does not remove the extra fields at runtime.
**Status:** ISSUE — flagged in f1f6c32.

### seed script topic/subtopic lookup silently ignores Supabase errors (1st occurrence)
**First seen:** commit f2357a0 (2026-03-15)
**File:** `apps/web/scripts/seed-admin-eval.ts` lines 128-133, 148-153
**Pattern:** The topic and subtopic `.single()` queries destructure only `{ data }`,
discarding `{ error }`. If the Supabase query fails (network, RLS, malformed data),
`data` will be `null`, the code falls into the `else` branch and attempts an INSERT.
If the SELECT failed because the row exists but the query errored, the INSERT will
fail with a unique-constraint violation and a confusing error message. The fix is
to destructure `{ data, error }` and rethrow on unexpected error codes (not PGRST116,
which is "row not found").
**Watch for:** Any select-then-insert pattern in scripts where `{ error }` is not
destructured from the SELECT call. The existing org/question-bank lookups in the same
file handle errors correctly — this is an inconsistency within the same script.
**Status:** ISSUE — flagged in f2357a0.

### console.error spy not guarded with try/finally in start.test.ts
**First seen:** commit 15ad393 (2026-03-14)
**File:** `apps/web/app/app/quiz/actions/start.test.ts` line 114
**Pattern:** The test "returns failure and logs when an unexpected error is thrown" creates
a `consoleSpy` and calls `consoleSpy.mockRestore()` at the end. If any assertion between
creation and restore throws, the spy leaks into subsequent tests. `quiz-submit.test.ts`
correctly wraps its equivalent spy in `try/finally`. `check-answer.test.ts` does not use
try/finally either (8 occurrences), making this a common pattern in this codebase.
**Risk:** Test-order sensitivity — a failing assertion mid-test leaves console.error silenced
for every subsequent test in the same file, masking real errors from the test output.
**Fix pattern:** Wrap spy usage in `try { ... } finally { consoleSpy.mockRestore() }`.
**Watch for:** Any test that calls `vi.spyOn(console, ...).mockImplementation(...)` without
a `try/finally` around the assertions.
**Status:** SUGGESTION — non-blocking, flagged in 15ad393.

### test file split: auth-before-Zod test name changed but behavior preserved
**First seen:** commit 15ad393 (2026-03-14)
**Files:** `start.test.ts`, `submit.test.ts`, `complete.test.ts`
**Pattern:** The old monolithic file named the unauthenticated-with-no-input test
"rejects unauthenticated calls before reaching Zod validation". The new files rename this
to "rejects unauthenticated calls before input validation". The assertion is identical;
only the phrase "reaching Zod" was softened to "input validation". This is a correct
behaviour-focused rename with no behavioral regression.
**Status:** GOOD — rename is safe, behavior verified.

### shared generation counter across independent async slots
**First seen:** commit 57af0d6 (2026-03-13)
**File:** `apps/web/app/app/quiz/_hooks/use-quiz-cascade.ts`
**Pattern:** A single `generation` ref was shared between `handleSubjectChange` (which fetches topics)
and `handleTopicChange` (which fetches subtopics). Because both handlers increment the same counter,
a topic-change event can suppress an in-flight subject/topics fetch, and vice versa. The two async
operations target independent state slots and should have independent generation counters.
The reference pattern in `use-question-stats.ts` is 1:1: one counter per async result slot.
**Fix:** Split into `topicGeneration` and `subtopicGeneration`.
**Watch for:** Any hook with multiple independent async operations sharing one generation/abort signal.
**Status:** ISSUE — pending fix.

### refactor: error path behavioral change in handleSubmit / handleNext (1st occurrence)
**First seen:** commit 44f9232 (2026-03-14)
**File:** `apps/web/app/app/_hooks/use-session-state.ts`
**Pattern:** When async operations are extracted from hooks into helper functions,
error-path flow changes must be carefully verified. In this refactor, the old
`try/catch` + `return` pattern was replaced with `executeSubmit` returning a
discriminated union. The behavioral outcome is identical (setSubmitting(false)
and submittingRef.current = false always run), but the structural change from
early-return to if/else requires tracing both branches against existing tests.
**Verification method:** Check that every code path through the new if/else
still reaches `setSubmitting(false)` and `submittingRef.current = false`.
**Status:** GOOD — verified clean. No behavioral regression.

### QuizTabContent 'question' tab rendering — null vs not-rendered (1st occurrence)
**First seen:** commit 44f9232 (2026-03-14)
**File:** `apps/web/app/app/quiz/session/_components/quiz-tab-content.tsx`
**Pattern:** The old `quiz-session.tsx` used `&&` guards — tab components were
never mounted for `activeTab === 'question'`. The new `QuizTabContent` always
mounts but returns `null` for `'question'`. React treats `null` return and
unmounted children identically in terms of DOM output. No behavioral difference.
**Watch for:** Stateful tab components (if added in future) that should be
unmounted when inactive, not just hidden via null render.
**Status:** GOOD — verified clean for current stateless tab implementation.

### QuizState passed as opaque prop `s` (1st occurrence)
**First seen:** commit 44f9232 (2026-03-14)
**File:** `apps/web/app/app/quiz/session/_components/quiz-main-panel.tsx`
**Pattern:** `QuizMainPanel` accepts the full `QuizState` return value as `s: QuizState`.
This is a structural convenience for a refactor commit, but couples the panel
tightly to the full hook surface. Future changes to `useQuizState`'s return shape
will automatically affect this component without a type error unless the shape
changes incompatibly. The `QuizState = ReturnType<typeof useQuizState>` export
is appropriate for the current scope.
**Watch for:** If `QuizMainPanel` is reused in a different context where
`useQuizState` is not the hook, the opaque-props pattern will need to be
replaced with explicit props.
**Status:** SUGGESTION — non-blocking, logged for future awareness.

### auth-before-parse ordering
**First seen:** commit 23a9f10 (2026-03-12)
**Files:** `apps/web/app/app/quiz/actions.ts` — `startQuizSession`; `apps/web/app/app/quiz/actions/batch-submit.ts` — `batchSubmitQuiz` (commit 54e9351)
**Pattern:** Originally parsed Zod input before checking auth, meaning an unauthenticated caller
could leak validation error details (field names, schema shape) before being rejected.
**Fix applied (23a9f10):** auth check moved before `StartQuizInput.parse(raw)`.
**Recurrence (54e9351):** `batchSubmitQuiz` in `batch-submit.ts` correctly continues the pattern — auth check at line 32 before `BatchSubmitInput.parse(raw)` at line 34. Pattern is holding.
**Watch for:** any new Server Action where `.parse(raw)` appears before `getUser()` / `requireAuth()`.

### current_setting('role') vs current_role confusion in trigger functions (1st occurrence)
**First seen:** commit 6595229 (2026-03-16)
**File:** `supabase/migrations/20260316000041_protect_users_sensitive_columns.sql` line 12
**Pattern:** A BEFORE UPDATE trigger used `current_setting('role') = 'service_role'` to detect
whether the caller is the Supabase service role. This is the wrong API:
- `current_setting('role')` reads a GUC (Grand Unified Configuration) parameter named "role".
  This GUC does not exist by default and throws `ERROR: unrecognized configuration parameter "role"`
  unless something has explicitly SET it in the session.
- `current_role` (or `current_user`) is the Postgres built-in that returns the active role name —
  this is what PostgREST sets when it uses the service role key.
The bug means the trigger throws on every UPDATE to the table, including from the service role,
rather than allowing service-role writes through.
**Fix:** Replace `current_setting('role')` with `current_role`.
**Secondary pattern (SECURITY DEFINER interaction):** If a SECURITY DEFINER RPC owned by `postgres`
needs to UPDATE sensitive columns, `current_role` inside the trigger will return `postgres`, not
`service_role`. In that case use a session-level application flag:
  `PERFORM set_config('app.bypass_user_trigger', 'true', true)` before the UPDATE, and check
  `current_setting('app.bypass_user_trigger', true) = 'true'` in the trigger.
**Watch for:** Any trigger function that inspects the caller's identity to make an allow/block
decision. Always use `current_role` for Postgres role checks, not `current_setting('role')`.
Also watch for `SECURITY DEFINER` RPCs that UPDATE tables with column-guarding triggers — the
trigger sees the definer's role, not the original caller's role.
**Status:** ISSUE — flagged in 6595229.

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

### keyboard navigation activates tab on arrow keys instead of moving focus only (1st occurrence)
**First seen:** commit b0de349 (2026-03-15)
**File:** `apps/web/app/app/quiz/_components/quiz-tabs.tsx` line 61-68
**Pattern:** The WAI-ARIA Tabs pattern (APG 3.2.1) defines two keyboard interaction models:
- **Manual activation**: arrow keys move focus only; Enter/Space activates the focused tab.
- **Automatic activation**: arrow keys both move focus AND activate the tab simultaneously.
Both are valid. This implementation uses automatic activation (setTab called inside handleKeyDown).
The risk is that if tab panels trigger expensive operations (data fetches, animations), every
ArrowRight keypress triggers that operation. For this app the tab panels are static content
passed as props so automatic activation is safe. If panels ever trigger async operations, the
activation model should be revisited.
**Watch for:** Any change that makes savedDraftContent or newQuizContent trigger side effects
(data fetches, mutations) — at that point, rethink whether automatic activation is still correct.
**Status:** GOOD — currently safe given static props, logged for future awareness.

### WAI-ARIA: tabpanel `aria-labelledby` points to active tab only — inactive panel not in DOM
**First seen:** commit b0de349 (2026-03-15)
**File:** `apps/web/app/app/quiz/_components/quiz-tabs.tsx` line 101
**Pattern:** The component renders a single `<div role="tabpanel">` whose `id` and
`aria-labelledby` swap dynamically as `tab` state changes. Because only the active panel is
in the DOM at any time (conditional rendering), inactive tabs correctly have no panel in DOM.
This is the correct implementation for a single-panel tab UI. The only correctness concern is
that `aria-controls` on the inactive tab (`tabpanel-saved` when `tab === 'new'`) points to a
DOM element that does not currently exist. This is technically non-conforming — `aria-controls`
is expected to reference an existing ID. It does not cause AT failures in practice today, but
it is a minor spec deviation.
**Status:** SUGGESTION — logged as a known a11y spec deviation, non-blocking for now.

### Dialog.Popup aria-label vs aria-labelledby: label source not dynamic
**First seen:** commit b0de349 (2026-03-15)
**Files:** `apps/web/app/app/_components/mobile-nav.tsx`,
          `apps/web/app/app/_components/zoomable-image.tsx`
**Pattern:** Both dialogs now use `aria-label` (static string). `aria-label` is correct here
because no visible heading element exists inside the dialog to point `aria-labelledby` at.
The zoomable image case is correctly dynamic: `aria-label={Zoomed image: ${alt}}` means screen
readers announce the image being zoomed, which changes per usage. The mobile nav case is a
static string "Navigation menu". Both are valid uses of `aria-label`. The pattern is consistent
across both dialogs.
**Status:** GOOD — consistent and correct for both dialog use cases.

### red-team specs: RPC parameter mismatch across partial fix commits
**First seen:** PR #4 (2026-03-14)
**Files:** `apps/web/e2e/redteam/session-replay.spec.ts`, `session-race-condition.spec.ts`,
`rate-limiting.spec.ts`, `rpc-cross-tenant.spec.ts`, `rpc-question-membership.spec.ts`,
`server-action-unauthenticated.spec.ts`
**Pattern:** A fix commit (7132ea7) corrected table names (`subjects` → `easa_subjects`) and
`complete_quiz_session` params across specs, but missed two other mismatches that are present
in the SAME specs:
  1. `start_quiz_session` called with `{ p_subject_id, p_question_count }` — actual signature
     is `(p_mode, p_subject_id, p_topic_id, p_question_ids)`. Five specs affected.
  2. `get_quiz_questions` called with `{ p_session_id }` — actual signature takes
     `{ p_question_ids: uuid[] }`. Two specs affected.
**Root cause:** The fix commit targeted the issues reported by the per-commit semantic reviewer
but the PR-level sweep caught that the same mismatches persisted in unreviewed call sites.
**Lesson:** When fixing parameter mismatches in test files, grep the full test directory for ALL
calls to the affected RPC before committing — partial fixes are common when specs share the
same erroneous pattern across multiple files.
**Watch for:** Any commit that corrects RPC params in one spec file but touches a family of
related spec files — always scan all files in the directory for the same pattern.
**Status:** ISSUE — flagged in PR #4 sweep, must be fixed before push.

### red-team quiz_drafts INSERT uses non-existent columns
**First seen:** PR #4 (2026-03-14)
**File:** `apps/web/e2e/redteam/quiz-draft-injection.spec.ts`
**Pattern:** The spec inserts into `quiz_drafts` with `{ student_id, subject_id, question_ids,
answered_so_far }`. The actual schema (migration 009) has:
`{ id, student_id, organization_id, session_config, question_ids, answers, current_index, ... }`.
`subject_id` and `answered_so_far` do not exist. `organization_id` is NOT NULL and is missing
from the insert. This means every INSERT in this spec will fail with a schema error, making
the test meaningless — the rejection is not due to RLS but due to schema mismatch.
**Watch for:** E2E test helpers that insert directly into tables without reading the schema first.
Admin-client inserts bypass RLS but not schema constraints. The test gives a false-positive
appearance of security (RLS rejection) when the real failure is a schema error.
**Status:** ISSUE — flagged in PR #4 sweep, must be fixed before push.

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
**Status: RESOLVED in commit 741ae30** — `updateFsrsCards` now uses `new Map(results.map(r => [r.questionId, r.isCorrect]))` and iterates `answers`, looking up each questionId in the map. Order-independent. Pattern resolved.

### getQuizReport missing student_id ownership check (1st occurrence)
**First seen:** commit b46b0bf (2026-03-15)
**File:** `apps/web/lib/queries/quiz-report.ts` line 63-68
**Pattern:** A query against a student-owned resource (quiz_sessions) filtered only by
session id and deleted_at — omitting student_id ownership. The session ID is exposed in
the URL, making the gap exploitable without guessing. This is the second instance of a
missing `.eq('student_id', user.id)` ownership filter (the first was flagged for
quiz_session_answers in PR #4). The pattern: any query that fetches a row "by ID" for
display to the authenticated user must also filter by the user's ID, not rely on the ID
being secret.
**Fix:** Add `.eq('student_id', user.id)` to the quiz_sessions query.
**Watch for:** Any query that takes a resource ID from user input (URL param, search param,
request body) and fetches a row by that ID without also filtering by the authenticated
user's ID. This applies to: quiz_sessions, quiz_drafts, student_responses, fsrs_cards.
**Status:** CRITICAL — flagged in b46b0bf, must fix before merge.

### auth-before-parse divergence in getFilteredCount (1st occurrence in lookup.ts)
**First seen:** commit b46b0bf (2026-03-15)
**File:** `apps/web/app/app/quiz/actions/lookup.ts` line 31-38
**Pattern:** FilteredCountSchema.parse(input) is called before the auth check, reversing
the established codebase pattern (auth first, parse second). The prior instances where
this was flagged and fixed: startQuizSession (commit 23a9f10), batchSubmitQuiz (54e9351).
Both were fixed to auth-first. lookup.ts was introduced after those fixes and does not
follow the corrected pattern.
**Impact:** An unauthenticated caller can observe Zod validation error shapes (field names,
validation rules) before being rejected, leaking schema information.
**Fix:** Move auth check above FilteredCountSchema.parse(input).
**Watch for:** Any new Server Action where .parse(raw) or .parse(input) appears before
supabase.auth.getUser() / requireAuth().
**Status:** SUGGESTION — non-blocking, logged as 2nd pattern occurrence (first was
lookup-type functions; both startQuizSession and batchSubmitQuiz are now clean). If a
third occurrence appears, add a code-style.md rule.

### loadSessionQuestions — 'use server' Server Action missing auth check
**First seen:** commit 97ab4ac (2026-03-12)
**File:** `apps/web/lib/queries/load-session-questions.ts`
**Pattern:** Function is marked `'use server'` and calls `get_quiz_questions()` RPC
(which is SECURITY DEFINER and has its own auth.uid() check). The application-layer auth check
is absent from `loadSessionQuestions` itself. Proxy + AppLayout + RPC-level auth provide
three layers of protection, but the Server Action has no explicit auth guard of its own.
**Status:** ISSUE (defense-in-depth gap). Flag on any new `'use server'` function that touches
question data without its own auth check.

### red-team specs: "discarded session cannot be re-completed" accepts incomplete security coverage
**First seen:** commit a396438 (2026-03-14)
**File:** `apps/web/e2e/redteam/session-race-condition.spec.ts` lines 153-161
**Pattern:** The second test in this spec accepts two distinct outcomes: (a) RPC rejects and
`ended_at` is NULL (ideal), OR (b) RPC succeeds and both `ended_at` and `deleted_at` are set
(labeled "acceptable"). Outcome (b) means a soft-deleted session can be completed by the RPC
because `complete_quiz_session` does not check `deleted_at IS NULL` before setting `ended_at`.
The spec comment says "This is acceptable: the session is still marked deleted." — but a
completed-and-deleted session will record a `quiz_session.batch_submitted` audit event, write
a row to `audit_events` and `student_responses`, and update `score_percentage`. The session
shows up in analytics and CAA audit reports. An attacker who discards a session and then
completes it leaks a spurious scored session into the audit log.
**Risk:** Low (deleted sessions are filtered from instructor views and analytics), but the spec
should assert outcome (a) exclusively — the RPC should check `deleted_at IS NULL` the same way
it checks `ended_at IS NULL`.
**Watch for:** Any spec that uses an `if (completeError) { ... } else { ... }` branch to accept
two contradictory outcomes — this always signals a missing enforcement layer.
**Status:** ISSUE — flagged in a396438.

### CI workflow with schedule-only trigger missing pull_request event (1st occurrence)
**First seen:** commit 58389479 (2026-03-16)
**File:** `.github/workflows/codeql.yml`
**Pattern:** A security workflow (CodeQL) was configured with `schedule` only, no `pull_request`
trigger. The entire value of integrating CodeQL into a PR-gated pipeline is pre-merge feedback.
A schedule-only scan is reactive (post-merge detection) rather than preventive (pre-merge gate).
Every other security-sensitive workflow in this repo (redteam.yml) triggers on `pull_request`.
**Fix:** Add `pull_request: branches: [master]` and `workflow_dispatch` triggers alongside schedule.
**Watch for:** Any new security workflow file that lacks a `pull_request` trigger — check whether
pre-merge feedback is the intent. If it is, the PR trigger is mandatory.
**Status:** ISSUE — flagged in 58389479.

### cancel-in-progress: true on scheduled CodeQL scan corrupts scanning baseline (1st occurrence)
**First seen:** commit 58389479 (2026-03-16)
**File:** `.github/workflows/codeql.yml`
**Pattern:** `concurrency: cancel-in-progress: true` is appropriate for workflows that produce
independent artifacts (test results, coverage reports) — cancelling an old run is safe because
the new run will produce a fresh artifact. CodeQL is different: it uploads SARIF results to GitHub
Advanced Security incrementally. If the scan is cancelled mid-upload, the security baseline in
GHES may be left in a partial state, causing false-positive deltas on the next scan.
**Rule:** CodeQL workflows should use `cancel-in-progress: false` (or no concurrency group).
**Watch for:** Any SARIF-uploading workflow (`github/codeql-action/analyze`) with
`cancel-in-progress: true` — this combination is incorrect.
**Status:** ISSUE — flagged in 58389479.

### autobuild step included in JS/TS CodeQL workflow (1st occurrence)
**First seen:** commit 58389479 (2026-03-16)
**File:** `.github/workflows/codeql.yml`
**Pattern:** `github/codeql-action/autobuild` is only necessary for compiled languages (C++, Java,
C#, Go) where CodeQL must intercept the compiler to trace data flows. For `javascript-typescript`,
CodeQL scans source files directly without a build step. Including autobuild adds CI time with no
benefit.
**Fix:** Remove the `Autobuild` step. Correct minimal workflow: checkout → init → analyze.
**Status:** SUGGESTION — non-blocking, wastes runner time.

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

### doc comments describing partial behavior as full behavior
**First seen:** commit 03b1393 (2026-03-14)
**File:** `docs/decisions.md`
**Pattern:** The `IS DISTINCT FROM` explanation says the check "reliably raises EXCEPTION 'forbidden'
even when `auth.uid()` is NULL." This is literally true (NULL IS DISTINCT FROM uuid raises forbidden),
but the actual migration has a prior `IS NULL` guard that raises `'not authenticated'` first.
The comment describes the behavior of `IS DISTINCT FROM` in isolation rather than the actual two-step
guard. It is not wrong, but it omits the more important first guard and could mislead a reader
into thinking `IS DISTINCT FROM` alone handles unauthenticated callers.
**Watch for:** doc comments that describe a partial mechanism as the complete safety guarantee.
**Status:** SUGGESTION — the comment is not dangerously wrong, but the fuller explanation would
note that the NULL check at line 12 handles the unauthenticated case and `IS DISTINCT FROM`
handles the identity-mismatch case.

### `string & keyof never` cast explanation is inaccurate
**First seen:** commit 03b1393 (2026-03-14)
**File:** `apps/web/lib/fsrs/update-card.ts`
**Pattern:** The comment says "Supabase-generated types resolve fsrs_cards column names to `never`".
The generated `types.ts` shows `fsrs_cards.Row` has `student_id: string` and `question_id: string`
— both properly typed, not `never`. The true cause of the cast is that `.returns<FsrsCardRow[]>()`
changes the query's inferred row type mid-chain, and the `.eq()` method's column parameter is
narrowed against the *original* generated row type before `.returns<>()` overrides it. When the
chain's intermediate type is a custom `FsrsCardRow` (not the Database schema type), TypeScript
cannot resolve the column name against the narrowed type, producing a `never` constraint.
The current comment explanation ("column names resolve to never") is an imprecise shorthand.
**Status:** SUGGESTION — the cast is correct and the workaround is sound; the explanation is
inaccurate at a technical level but unlikely to mislead maintainers in practice.

### useMemo snapshot for "initial value" freezes at first render, not at prop resolution (1st occurrence)
**First seen:** commit 1b38542 (2026-03-14)
**File:** `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts` line 55
**Pattern:** `useMemo(() => initialAnswers ? Object.keys(initialAnswers).length : 0, [])`
is used to snapshot the count of pre-existing answers at mount so the nav-guard
fires only on *new* answers. The pattern is correct as long as the parent component
is always fully mounted after the prop is populated. If the component is ever inside
a Suspense boundary that renders before data is ready, the snapshot is computed at 0
(pre-data) and the fix degrades to the pre-fix behavior.
**Watch for:** Any useMemo or useRef that snapshots a prop "at mount" for comparison
later — verify the parent guarantees the prop is fully resolved before the component
mounts. Suspense boundaries are the most common way this guarantee breaks.
**Related:** useRef is a cleaner signal for "frozen on mount" intent and avoids the
biome-ignore suppression needed for an intentionally empty useMemo dependency array.
**Status:** ISSUE — flagged in 1b38542. Pending confirmation of load-guarantee in
the parent Server Component loader.

### in-flight guard covers complete-session call but not advance-question call in handleNext (1st occurrence)
**First seen:** commit 1b38542 (2026-03-14)
**File:** `apps/web/app/app/_hooks/use-session-state.ts` lines 85-116
**Pattern:** The submittingRef guard in handleNext wraps only the onComplete() path.
The advance-question early return (index < length) runs before the guard. If handleSubmit
is in-flight when handleNext is called, the advance executes anyway. Currently harmless
because the UI disables the Next button while submitting is true. But a future UI
refactor that decouples the Next button from the submitting state will silently introduce
a race condition.
**Watch for:** Any in-flight guard that protects only one branch of a multi-branch
async function. Guards should be placed *before all branches* or each branch must
reason independently about guard applicability.
**Status:** SUGGESTION — non-blocking today due to UI coupling. Noted for future UI refactors.

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

### TabButton badge guard — consistent but subtly changed from parent original
**First seen:** commit 46113bf (2026-03-13)
**File:** `apps/web/app/app/quiz/_components/quiz-tabs.tsx`
**Pattern:** The original QuizTabs checked `draftCount > 0` directly on the QuizTabsProps
(`draftCount: number`, always defined). The extracted TabButton uses `badge != null && badge > 0`,
because `badge` is `number | undefined`. The behavior is identical for the "Saved Quizzes" tab
(badge is always passed as `draftCount`), and the "New Quiz" tab omits the badge prop entirely
(undefined, badge never renders). The guard change is correct and necessary — it is not a behavioral
regression.
**Watch for:** extraction refactors that silently change guard semantics; check that the new guard
covers the same cases as the old one, especially when a required prop becomes optional.
**Status:** POSITIVE — correctly handled.

---

## Commit cb0395c (2026-03-14) — PR 3: tighten assertions, add coverage gaps, split draft tests

### consoleSpy without try/finally — still recurring (3rd occurrence)
**Files:** `draft-delete.test.ts` (4 occurrences), `batch-submit.test.ts` (2 occurrences)
**Pattern:** Multiple tests in this commit create `consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})`,
call the SUT, then call `consoleSpy.mockRestore()` in the flat test body without a try/finally guard.
This pattern was flagged as a SUGGESTION in commit 15ad393 (2 occurrences). It now appears in fresh
test files added in this commit. If any assertion between spy creation and restore throws, the spy
leaks into subsequent tests in the same file, silencing real errors from test output.
**Count:** 3rd commit with this pattern. Consider adding a project-level rule.
**Fix:** `try { ... } finally { consoleSpy.mockRestore() }` in every spy usage.
**Status:** SUGGESTION (non-blocking) — pattern is recurring across 3 commits.

### batchSubmitQuiz — Zod error returns 'Something went wrong', test asserts generic regex
**File:** `apps/web/app/app/quiz/actions/batch-submit.test.ts` lines 119, 131
**Pattern:** The new assertions for invalid-input tests use `.toMatch(/Something went wrong/)`.
This is correct: `batch-submit.ts`'s catch block at line 72 returns `'Something went wrong. Please try again.'`
for ALL uncaught errors including ZodErrors (unlike `start.ts` and `draft.ts` which have a dedicated
`instanceof ZodError` branch that returns `err.errors[0]?.message`). The regex assertion is the right
choice here — `.toBe('Invalid uuid')` would be wrong because Zod errors are not discriminated before
they hit the generic catch.
**Status:** GOOD — assertions correctly match the production code's error-surfacing behavior.

### draft.test.ts — saveDraft Zod error assertions pin to internal Zod message text
**File:** `apps/web/app/app/quiz/actions/draft.test.ts` lines 105-107, 274-276
**Pattern:** Two assertions changed from `expect(result.success).toBe(false)` to
`if (!result.success) expect(result.error).toBe('Invalid uuid')`. This pins the test to Zod's exact
internal error text. `draft.ts` surfaces `err.errors[0]?.message` directly. If Zod ever changes
the message text for uuid validation (e.g. "Expected UUID format" instead of "Invalid uuid"), this
test breaks without any production behavior changing. This is a contract-inversion risk: the test
becomes tighter than the production guarantee.
**Severity:** SUGGESTION — test is correct today, but the assertion is brittle to a Zod library update.
A looser assertion like `.toContain('uuid')` or `.toMatch(/uuid/i)` would be more resilient.
**Status:** SUGGESTION — non-blocking.

### draft-delete.test.ts — mockChain initialises `eq` with `mockReturnThis()` before the test overrides it
**File:** `apps/web/app/app/quiz/actions/draft-delete.test.ts` lines 36-44
**Pattern:** `mockChain()` sets `chain.eq = vi.fn().mockReturnValue(chain)` in the for-loop, then the
happy-path and user-scope tests immediately override `chain.eq` with a different mock via
`(chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(...)`. The initial `mockReturnThis()` binding
from the loop is replaced and has no effect. This is functionally correct — the override wins — but
the loop-based initialisation is misleading: it implies all methods default to `returnThis`, whereas
the `eq` key is always overridden before it matters. Not a bug, but creates a false sense that the
chain's default behavior matters.
**Status:** SUGGESTION — cosmetic, non-blocking.

### analytics.test.ts — 'negative Infinity limit' test is a near-duplicate of existing 'Infinity' test
**File:** `apps/web/lib/queries/analytics.test.ts` lines 209-215
**Pattern:** The new test `'treats negative Infinity limit as the minimum (1)'` asserts `p_limit: 1`.
An identical-behavior test already exists at line 177: `'treats Infinity limit as the minimum (1)'`.
Both exercise the `!Number.isFinite(value)` branch of `boundParam`. They are not duplicates at the
level of the input value, but they cover the same code path and produce the same observable output.
The `NEGATIVE_INFINITY` test adds no new branch coverage — `boundParam` uses a single `!Number.isFinite`
check that covers both. Keeping it is harmless; it does document the behavior for a specific input.
**Status:** SUGGESTION — minor test redundancy, non-blocking.

### POSITIVE — loadDrafts and deleteDraft split into separate test files with correct isolation
`load-draft.test.ts` already existed. `draft-delete.test.ts` is new and correctly re-implements
the same tests that were removed from `draft.test.ts`. The two new files each maintain their own
mock setup (`vi.hoisted`, `vi.mock`, `beforeEach(vi.resetAllMocks)`) without sharing state. No
test pollution risk. Coverage is preserved — all 5 `deleteDraft` test cases are present in the
new file, matching the removed block from `draft.test.ts`.

### POSITIVE — ZodError pinning improves signal quality on validation tests
Changing `.rejects.toThrow()` to `.rejects.toThrow(ZodError)` across `check-answer.test.ts`,
`fetch-explanation.test.ts`, `fetch-stats.test.ts`, `lookup.test.ts`, and `submit.test.ts` is
strictly correct. Before this commit, `.rejects.toThrow()` would pass on ANY thrown value
(including auth errors, network errors, TypeError from a misrouted mock). The new assertion
verifies the error is specifically a Zod validation failure, tightening the contract and
preventing false-passing tests if the error source changes.

### POSITIVE — explanation-tab.test.tsx: fetch call assertion added post-waitFor
The new assertion `expect(mockFetchExplanation).toHaveBeenCalledWith({ questionId: 'q-1', sessionId: 's-1' })`
runs after the `waitFor` that confirms the explanation text rendered. This is the correct sequencing:
the `waitFor` proves the async call completed, and the spy assertion then confirms what parameters
were passed. Placing it before `waitFor` would be a race condition.

---

## Commit 7ae13b6 (2026-03-13) — filteredCount reset + check_quiz_answer session guard

### JSONB containment operator inconsistency vs jsonb_typeof guard pattern
**File:** `packages/db/migrations/029_check_answer_session_guard.sql:38`
**Pattern:** Migration 029 uses the `?` JSONB containment operator to test whether `config->'question_ids'`
contains `p_question_id::text`. Migrations 026, 027, and 028 all use `jsonb_typeof(v_config->'question_ids') <> 'array'`
guard before accessing the field. The `?` operator is correct for well-formed configs but silently returns
FALSE (not an exception) when the JSONB value is not an array. This swallows config corruption into a generic
"not in active session" error, making production diagnosis harder.
**Severity:** ISSUE (behavioral inconsistency, not a security hole — the call is rejected either way).
**Fix:** Add `jsonb_typeof` guard consistent with 026–028 before the session ownership EXISTS check.
**Watch for:** New RPC migrations that touch `config->'question_ids'` without the `jsonb_typeof` guard —
this is an established pattern that must be applied consistently.
**Status:** RESOLVED in commit d1a8b0c — migration 029 now uses the full SELECT INTO + jsonb_typeof + ARRAY/ANY() pattern matching 026-028 exactly.

### setSubtopicId bypass of filteredCount reset
**File:** `apps/web/app/app/quiz/_hooks/use-quiz-config.ts`
**Pattern:** `handleSubjectChange` and `handleTopicChange` are wrapped to call `setFilteredCount(null)` before
delegating. But `setSubtopicId` is passed through raw via `...cascade` spread and called directly from
`quiz-config-form.tsx`. Subtopic change does not reset `filteredCount`, so stale filter-scoped counts
persist until the next filter interaction.
**Severity:** SUGGESTION (stale count corrects itself on next filter interaction; not a data integrity issue).
**Fix:** Wrap `setSubtopicId` in the same pattern, or expose a `handleSubtopicChange` wrapper.
**Status:** RESOLVED in commit d1a8b0c — `setSubtopicId` is now wrapped in `use-quiz-config.ts` return object, overriding the cascade spread version. Tests for subject and topic reset added; subtopic reset is covered by same mechanism.

### Double ownership verification — intentional, load-bearing, documented
**Files:** `check-answer.ts` (Server Action) + `029_check_answer_session_guard.sql` (RPC)
Both layers now verify session ownership. The double-read of `quiz_sessions` per answer check is
intentional per `docs/security.md` section 11a. Not a bug — a latency cost to document for perf review.

## PR-Level Review — feat/post-sprint-3-polish (2026-03-13)

### filteredCount not reset on subject/topic change
**Found in:** PR-level sweep (not caught per-commit)
**Files:** `apps/web/app/app/quiz/_hooks/use-quiz-config.ts`, `apps/web/app/app/quiz/_hooks/use-quiz-cascade.ts`
**Pattern:** `filteredCount` is a derived-state cache that tracks how many questions match the current
filter (unseen/incorrect) for the selected subject/topic/subtopic. It is set by `handleFilterChange`
and reset to `null` only when `handleFilterChange` is called. But when the user changes subject via
`handleSubjectChange` or topic via `handleTopicChange`, `filteredCount` is NOT reset. The stale count
from the prior subject/topic continues to drive `availableCount = filteredCount ?? staticCount` and
therefore `maxQuestions`, until the user re-clicks a filter — which they may never do.
**Severity:** ISSUE — wrong question count drives the `count` slider max, causing "Start Quiz" to
potentially request more questions than actually exist for the new filter+scope combination, which
will cause the `start_quiz_session` RPC to fail or return fewer questions than expected.
**Fix:** Call `setFilteredCount(null)` inside both `handleSubjectChange` and `handleTopicChange` in
`use-quiz-config.ts` (since cascade hook owns the change handlers but not `filteredCount`).
The cascade hook callbacks need to be wrapped in `use-quiz-config.ts` to inject the reset.
**Watch for:** derived cache state that is set by one event but not invalidated by sibling events
that change its inputs. Always trace every input to a derived value and ensure every mutation of
those inputs triggers a cache reset.

### check_quiz_answer RPC — session ownership NOT verified in the RPC itself
**Found in:** PR-level sweep
**Files:** `supabase/migrations/20260313000019_check_answer_rpc.sql`, `apps/web/app/app/quiz/actions/check-answer.ts`
**Pattern:** The `check_quiz_answer` RPC verifies auth (`auth.uid()`) and question existence, but
does NOT verify that the student owns a session containing that question. The session + question
ownership check is done in the Server Action (`check-answer.ts` lines 43-55). If a student calls
the RPC directly (bypassing the Server Action), they can check the correct answer for any
non-deleted question without owning a session for it. The RPC returns the `correct_option_id`.
**Context:** The Server Action does the ownership check, providing defense-in-depth. But RPCs
classified as answer-revealing should be self-defending, per `docs/security.md` rule 7.
**Severity:** ISSUE — the RPC exposes correctness data without session ownership enforcement.
An authenticated student can call `check_quiz_answer` directly via REST API for any question.
**Fix:** Add session ownership check inside the RPC, or accept a `p_session_id` parameter and
validate `EXISTS (SELECT 1 FROM quiz_sessions WHERE ... AND student_id = v_student_id)`.
**Watch for:** SECURITY DEFINER RPCs that return answer-derived data (correctness, correct option IDs)
without validating the caller has an active session containing the question.

### Behavioral inconsistency — disabled prop on AnswerOptions during per-answer check
**Found in:** PR-level sweep
**Files:** `apps/web/app/app/quiz/session/_components/quiz-session.tsx`,
`apps/web/app/app/quiz/session/_hooks/use-answer-handler.ts`,
`apps/web/app/app/quiz/session/_hooks/use-quiz-submit.ts`
**Pattern:** `AnswerOptions` receives `disabled={s.submitting}` where `s.submitting` is the
batch-submit/save/discard `submitting` state from `useQuizSubmit`. It is NOT set to `true` while
a per-question `checkAnswer` RPC is in flight. The `lockedRef` inside `useAnswerHandler` prevents
double-submission at the logic level, but the UI does not visually reflect that an answer check is
in progress. A student can see and click options while waiting for `checkAnswer` — the click is
silently discarded by the guard. No data integrity issue. UX regression relative to before the
immediate-feedback refactor, where `submitting` controlled both scenarios.
**Severity:** SUGGESTION — silent discard with no visual feedback is unexpected UX. Not a bug but
a behavioral regression.
**Watch for:** hooks that split a single submitting signal into two (answer-level vs session-level)
without unifying them at the component boundary.

### POSITIVE — check_quiz_answer RPC returns only derived result, no options array
The new `check_quiz_answer` RPC fetches `(opt->>'id' WHERE opt->>'correct')` and returns only
`correct_option_id` — it never returns the raw options array with the `correct` flag. This is
correct answer-stripping behavior per the security rule. `fetch-explanation.ts` also correctly
uses `SELECT explanation_text, explanation_image_url` with no `options` column.

### POSITIVE — batch_submit_quiz evolution (migrations 024-028) is correct
All seven iterations of `batch_submit_quiz` across `supabase/migrations/` and `packages/db/migrations/`
consistently include: auth.uid() check, deleted_at IS NULL guard, session ownership (student_id),
SECURITY DEFINER + SET search_path = public. No version drops any of these guards. The incremental
hardening (field validation, pre-cast validation, UUID case fix) is additive, not regressive.

### POSITIVE — draftId flows correctly end-to-end
`draftId` is correctly threaded through: `ResumeDraftBanner` / `DraftCard` → `sessionStorage` →
`QuizSessionLoader` → `QuizSession` → `useQuizState` (via `QuizStateOpts`) → `useQuizSubmit` →
`handleSubmitSession` / `handleSaveSession` / `handleDiscardSession` → `deleteDraft` /
`saveDraft` / `discardQuiz`. No leg of the chain drops it.

### lookup.ts — unused import of createServerSupabaseClient in the two thin wrapper functions
**First seen:** commit 028fc09 (2026-03-13)
**File:** `apps/web/app/app/quiz/actions/lookup.ts`
**Pattern:** `createServerSupabaseClient` is imported at line 5. It is used by `getFilteredCount`
(line 30) but NOT by `fetchTopicsForSubject` or `fetchSubtopicsForTopic`, which delegate to
`lib/queries/quiz.ts`. The import is correct and needed — it just appears misleadingly early
relative to the two thin wrappers. Not a bug; noting for context.
**Status:** SUGGESTION — cosmetic, non-blocking.

### lookup.ts — fetchTopicsForSubject / fetchSubtopicsForTopic Zod parse throws on invalid input
**First seen:** commit 028fc09 (2026-03-13)
**File:** `apps/web/app/app/quiz/actions/lookup.ts` lines 10-16
**Pattern:** Both thin wrappers now use `IdSchema.parse(raw)` which throws a `ZodError` on invalid
input. They have no try/catch. Compare with `getFilteredCount` (same file) which also throws on
Zod failure. The pattern is consistent across the file. `ZodError` propagating up to the Next.js
Server Action boundary is acceptable — Next.js converts uncaught errors in Server Actions to a
generic error response. The tests confirm Zod rejection behavior is tested (lookup.test.ts lines
90-120). No inconsistency.
**Status:** GOOD — consistent with sibling functions in the file.

### batch_submit_quiz — duplicate check operates on raw text, not normalised uuid (commit 741ae30)
**First seen:** commit 741ae30 (2026-03-13)
**File:** `supabase/migrations/20260313000025_batch_submit_input_validation.sql` lines 56-62
**Pattern:** The new duplicate check counts `DISTINCT (e->>'question_id')` — raw text — while the
loop casts `(v_answer->>'question_id')::uuid`. A payload with two entries differing only in
UUID case (e.g. upper vs lower hex) passes the text-level dedup check but resolves to the same
uuid in the loop. The second insert no-ops via ON CONFLICT DO NOTHING, silently ignored.
**Fix:** Cast to ::uuid inside the DISTINCT: `count(DISTINCT (e->>'question_id')::uuid)`.
**Status:** ISSUE — filed in commit 741ae30 review. Watch for text-vs-uuid dedup pattern in
any future RPC that checks for uniqueness using `->>'field'` before a `::uuid` cast.

### useRef lock — ordering invariant: setAnswers must precede await (commit 741ae30)
**First seen:** commit 741ae30 (2026-03-13)
**File:** `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts` — `handleSelectAnswer`
**Pattern:** Lock is acquired (line 47) and then `setAnswers` fires (line 49-51) before
`await checkAnswer` (line 52). This ordering is load-bearing: if checkAnswer fails,
the answer is already in state and the lock correctly prevents re-entry matching the
`answers.has(questionId)` semantics. Moving setAnswers after the await would break this
invariant — the lock would fire but no answer would be recorded, leaving a stuck question.
**Status (commit 34a9352):** Lock position preserved after hook split. `lockedQuestionsRef`
still declared before `handleSelectAnswer` in `use-quiz-state.ts`. Ordering invariant intact.
**Watch for:** any refactor to `handleSelectAnswer` that moves `setAnswers` after the await.

### hook-split scalar vs ref — stale closure when child hook receives a scalar prop (commit 34a9352)
**First seen:** commit 34a9352 (2026-03-13)
**File:** `apps/web/app/app/quiz/session/_hooks/use-quiz-submit.ts` — `handleSave`
**Pattern:** When a hook is split and the child receives a changing value (e.g., `currentIndex`)
as a plain number in opts, functions inside the child close over the opts object from the render
where the child hook was last called. This is safe only if the parent re-renders on every change
(which it does here via React state). The gap: if renders are batched or skipped, the child
function reads a stale value. Compare with `answersRef` — the parent hook uses a ref to ensure
freshness across async boundaries.
**Rule:** When splitting hooks, any value that (1) changes after mount and (2) is read inside an
async function or a function that fires after a state update must be forwarded as a ref, not a
scalar. Scalars are acceptable only for values used synchronously at render time.
**Fix applied (commit df5d354):** `currentIndexRef` ref introduced in `use-quiz-state.ts` (lines 24-25).
Parent keeps `currentIndexRef.current = nav.currentIndex` in sync on every render. Child hook
receives the ref and reads `.current` inside `handleSave` — same freshness guarantee as `answersRef`.
Fix is structurally correct: both mutable values that are consumed inside async handlers now
travel as refs, not scalars. ISSUE resolved.
**Watch for:** any future hook split where a changing scalar (index, count, timestamp) is
forwarded as a plain number to a child hook that uses it inside a handler function.

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

## Commit d057128 (2026-03-14) — batch_submit_quiz idempotent retry + soft-deleted question scoring

### Misleading error message after endpoint behavior change
**File:** `supabase/migrations/20260314000031_batch_submit_idempotent_softdelete.sql` line 53–54
**Pattern:** When a function's control flow changes (here: `ended_at IS NULL` guard moved from
WHERE clause to a later if-block), the error messages that previously corresponded to the removed
condition become inaccurate. The error `'session not found or already completed'` is no longer
accurate — completed sessions are now handled by the idempotent replay block, not this error.
**Fix:** Update to `'session not found or not accessible'`.
**Watch for:** any commit that removes a WHERE clause condition without also auditing the error
message that previously described that condition as a failure case.
**Status:** RESOLVED in commit ce35a31 — error message updated to 'session not found or not accessible'; batch-submit.ts string match updated to match.

### FOR UPDATE lock held unnecessarily in read-only replay path
**File:** `supabase/migrations/20260314000031_batch_submit_idempotent_softdelete.sql` line 51, 57–84
**Pattern:** The FOR UPDATE lock on quiz_sessions is acquired before the idempotent replay
check (v_ended_at IS NOT NULL). When the session is already completed, the replay path only
reads from quiz_session_answers but holds the lock for the duration of those reads and the
RETURN. This creates unnecessary contention under concurrent retry: two simultaneous retries
will serialize on the lock even though both are read-only.
**Watch for:** RPCs that acquire a write lock at the top and then branch into a read-only
early-return path. Consider a two-phase check (read without lock, then re-acquire only for
the write path) or document the trade-off.
**Status:** RESOLVED in commit ce35a31 — trade-off documented in migration comment and docs/database.md. Intentional design decision: lock serializes concurrent retries, preventing TOCTOU; read-only replay holds lock briefly (two SELECTs). Accepted and documented.

### Replay path explanations reflect live DB state, not original submission state
**File:** `supabase/migrations/20260314000031_batch_submit_idempotent_softdelete.sql` line 62–75
**Pattern:** The normal processing path captures explanation_text and explanation_image_url at
submit time (in-memory v_results). The idempotent replay path fetches these fields live from
the questions table at replay time. If a question's explanation was edited after the original
session completed, the replay returns the new explanation, not the one shown at completion.
**Status:** SUGGESTION — should be a documented decision. The live read is the only option
without storing explanation text in quiz_session_answers.

### POSITIVE — idempotent replay correctly checks session ownership before returning results
The `v_ended_at IS NOT NULL` branch can only be reached after the WHERE clause at line 48-51
has verified `qs.student_id = v_student_id`. A student cannot trigger replay for another
student's completed session. Ownership is not bypassed by the early return.

### POSITIVE — soft-delete removal correctly scoped to answer-scoring lookup only
The `deleted_at IS NULL` filter is preserved on `quiz_sessions` (line 50). Only the `questions`
lookup (the correctness-scoring sub-query) has the filter removed. This is the minimal correct
change — a soft-deleted session cannot be replayed, but a question soft-deleted after session
start can still be scored.

### POSITIVE — FOR UPDATE race condition handling is correct for the normal submit path
A double-submission race (two concurrent calls for the same active session) will serialize
on the FOR UPDATE lock. The second caller acquires the lock, finds v_ended_at IS NOT NULL,
and returns the idempotent replay result. This is exactly the intended behavior: no double
writes, no errors on retry.

---

## Session 2026-03-16 (commit b41ffa8) — refactor: remove FSRS remnants from codebase

### POSITIVE — FSRS last_was_correct tracking correctly moved into RPC (migration 040)
Migration 040 adds the same `INSERT INTO fsrs_cards ... ON CONFLICT DO UPDATE SET last_was_correct`
block to `submit_quiz_answer` that has been in `batch_submit_quiz` since migration 022. The
ON CONFLICT key `(student_id, question_id)` matches the table's UNIQUE constraint. The write
is atomic within the same transaction as the answer insert. This is the correct move: previously
`last_was_correct` was only tracked via TypeScript after the RPC returned (best-effort, lossy
on connection drops). Now both submission paths — single (`submit_quiz_answer`) and batch
(`batch_submit_quiz`) — are consistent in their `fsrs_cards` update behavior.

### POSITIVE — consecutive_correct_count intentionally not tracked in migration 040
The old TypeScript `updateFsrsCard` maintained `consecutive_correct_count` (incrementing on correct,
resetting on incorrect). Migration 040 does NOT carry this forward. The column still exists in the
schema but is no longer written by any RPC. Since `consecutive_correct_count` is not read anywhere
in the current TypeScript codebase (confirmed by grep), this is a clean silent deprecation of an
unused column, not a behavioral regression.

### POSITIVE — `last_was_correct` consumer code (lookup.ts, quiz.ts) still correct after migration 040
The `getFilteredCount` action and `lib/queries/quiz.ts` both query `fsrs_cards.last_was_correct = false`
for the 'incorrect' filter mode. Migration 040 ensures this column is now written atomically by
`submit_quiz_answer`, so single-question practice mode correctly feeds the incorrect-answer filter.
Previously only batch-mode answers updated the column; single-answer practice mode left `last_was_correct`
as NULL (never triggered incorrect filter). Migration 040 closes this gap.

### NOTE — submit_quiz_answer is still marked DEPRECATED in docs/database.md
`docs/database.md` line 433 labels `submit_quiz_answer` as `DEPRECATED — use batch_submit_quiz`.
Migration 040 effectively rehabilitates this RPC to parity with batch_submit_quiz in terms of
`last_was_correct` tracking. The DEPRECATED label should be revisited: if single-answer practice
mode still uses this RPC (confirmed — quiz-submit.ts uses batchSubmitQuiz, but submit.ts exists
and is tested), the deprecation comment is misleading. Doc update needed.

### NOTE — packages/db/migrations/ does not include migration 040
`packages/db/migrations/` (numbered, claimed as source of truth in MEMORY.md) stops at 031.
`supabase/migrations/` (timestamped) has migrations up to 040. This gap has existed since migration
032 and is not introduced by this commit, but worth tracking. The two directories are diverged.

## Positive Patterns

### POSITIVE — FSRS scheduling atomicity restored at DB layer
With `updateFsrsCard` removed, `last_was_correct` is now written transactionally by the RPC itself.
A connection drop after the RPC commits can no longer produce a state where the answer is recorded
but `last_was_correct` is not updated. This is strictly safer than the previous TypeScript best-effort
try/catch approach.

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

---

## Session 2026-03-13 (commit 81c1428) — quiz UX polish

### fetchExplanation — direct SELECT on questions in active-session context (ISSUE, open)
**First seen:** commit 81c1428 (2026-03-13)
**File:** `apps/web/app/app/quiz/actions/fetch-explanation.ts`
**Pattern:** New Server Action queries `questions` table directly (not via `get_quiz_questions()` RPC)
to fetch `explanation_text` and `explanation_image_url`. While `options[].correct` is not in the
SELECT list, the query has no session-state validation — no check that a session exists, that it
belongs to the authenticated student, or that the student is enrolled in a session containing this
`questionId`. Any authenticated student in the org can call this with an arbitrary UUID and receive
the explanation before answering. This violates the active-session rule in `docs/security.md §4`.
**Fix:** Add `sessionId` parameter; verify the question belongs to an active session for this student
before returning the explanation — or remove `PreAnswerExplanation` and restore the "answer to see"
gating.
**Watch for:** any new Server Action that SELECTs from `questions` without RPC or session-state check.

### stale-fetch race condition in useEffect async pattern (ISSUE, open)
**First seen:** commit 81c1428 (2026-03-13)
**File:** `apps/web/app/app/quiz/_components/explanation-tab.tsx` — `PreAnswerExplanation`
**Pattern:** `useEffect` fires an async `fetchExplanation` call. When `questionId` changes before
the previous fetch resolves, both in-flight requests race to set state. The later-resolving (stale)
fetch overwrites the current question's explanation. The fix pattern already exists in
`statistics-tab.tsx` and `use-question-stats.ts` (a `cancelled` flag or request-ID guard in the
cleanup function).
**Watch for:** any new `useEffect` with an async Server Action call that does NOT return a cleanup
function cancelling the in-flight request on re-render/unmount.

### saveDraft update path — silent no-op on stale draftId (ISSUE, open)
**First seen:** commit 81c1428 (2026-03-13)
**File:** `apps/web/app/app/quiz/actions/draft.ts` lines 46-66
**Pattern:** Supabase `.update()` with a WHERE clause that matches no rows returns `error: null` and
silently affects zero rows. The function returns `{ success: true }` even if nothing was written,
so the caller displays a success toast for a failed save. This is a data loss path when a user's
draft has been deleted out-of-band (another tab, admin action) and they subsequently save.
**Fix:** Chain `.select('id')` after the update and verify `data` is non-empty, or use upsert.
**Watch for:** any Supabase `.update()` + `.eq()` pattern that does not verify affected row count.

---

## Session 2026-03-13 (commit 7c2d7c5) — refactor: split long functions, add tests for eval round 2 fixes

### Three open ISSUEs from 81c1428 persist — refactor did not fix them (ISSUE, still open)
**Confirmed still open:** commit 7c2d7c5 (2026-03-13)
- `fetchExplanation` session-state gate: still no sessionId parameter or ownership check
- `PreAnswerExplanation` stale-fetch race: `useEffect` still lacks cancellation flag
- `updateExistingDraft` zero-row silent success: `.select('id')` row-count check still absent
All three were flagged in 81c1428 and carried forward here unmodified in the production code.

### Refactor of saveDraft into helpers is structurally correct (POSITIVE)
The extraction of `updateExistingDraft` and `insertNewDraft` from `saveDraft` correctly passes
already-validated input and already-verified userId to the helpers. Auth and Zod ordering is
preserved in the orchestrator. JSDoc on the 4-param function documents the code-style exception.

### fetchExplanation tests cover happy/error paths but not the authorization boundary (NOTE)
The new test file (`fetch-explanation.test.ts`) does not include a test asserting that a student
cannot fetch an explanation for a question outside their active session. Until the session-gate fix
is applied, this test gap is secondary — but once the fix lands, a test for the authorization
rejection must accompany it.

### Server Action Zod-throw vs structured-error inconsistency (NOTE)
`fetchExplanation` throws `ZodError` on invalid input; `saveDraft` returns `{ success: false }`.
`PreAnswerExplanation` does not catch errors from `fetchExplanation`, making an unhandled rejection
possible on invalid input. Low-probability given session-derived questionIds, but should be aligned.

### `answersRef` pattern for async callbacks in React hooks (POSITIVE)
**File:** `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts`
`answersRef.current = answers` in the render body (not useEffect) keeps the ref in sync with
the latest state without creating stale closures in `handleSubmit` / `handleSave`. This is the
correct pattern for reading current state inside async callbacks where adding the state to
dependency arrays would cause unintended re-subscriptions.

### ReportCard is 'use client' but receives only safe data
`ReportCard` is a client component that receives `QuizReportData` (already stripped of `correct`
flags on options). The data boundary between server and client is clean.

## High-Scrutiny Files
- `apps/web/proxy.ts` — auth flow, cookie handling, redirects
- `apps/web/app/auth/callback/route.ts` — PKCE code exchange, session creation
- `apps/web/app/app/quiz/actions/batch-submit.ts` — single atomic batch RPC
- `apps/web/app/app/quiz/actions/submit.ts` — individual submit, no try/catch wrapper (ZodError propagates); submit_quiz_answer RPC now tracks last_was_correct atomically (migration 040)
- `apps/web/app/app/quiz/actions/complete.ts` — completeQuiz, no try/catch wrapper (ZodError propagates)
- `apps/web/lib/queries/load-session-questions.ts` — Server Action serving questions; verify auth check is present
- `apps/web/lib/queries/quiz-report.ts` — direct questions SELECT post-session; verify correct stripping stays in buildReportQuestions
- `apps/web/app/app/_components/app-shell.tsx` — fullscreen detection via pathname string matching; could false-positive on future routes
- `packages/db/src/admin.ts` — service role key usage
- `supabase/migrations/20260312000011_batch_submit_rpc.sql` — score query counts all session answers; watch if submission paths diverge
- `apps/web/app/app/_hooks/use-session-state.ts` — answeredCount now a dedicated counter (4798fdb); prior off-by-one resolved; new risk: no submittingRef guard — concurrent handleSubmit calls can double-increment before React re-render disables the button (ISSUE filed 4798fdb)

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

### E2E race: last-answer state vs. immediate "Finish Test" click (first seen commit 9b624ff)
**First seen:** commit 9b624ff (2026-03-12)
**Files:** `apps/web/e2e/progress.spec.ts` lines 33-47
**Pattern:** The `for` loop calls `page.getByRole('button', { name: 'Submit Answer' }).click()`
on the final question, then immediately calls `page.getByRole('button', { name: 'Finish Test' }).click()`
without waiting for React state to propagate. "Submit Answer" fires `handleSelectAnswer` which
calls `setAnswers(prev => new Map(prev).set(...))`. React batches setState and flushes
asynchronously. If "Finish Test" is clicked before the flush, `answers.size` is one short and
`handleSubmit` submits an incomplete batch — the last question is scored as unanswered.
**Fix pattern:** Assert progress bar reaches 100% before clicking "Finish Test":
`await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute('style', /100%/)`
**Severity:** ISSUE — real test reliability gap and mirrors a real-world fast-click race.
**Watch for:** any E2E test that clicks "Finish Test" or "Submit Quiz" immediately after
a state-modifying button click with no intermediate assertion.

### E2E race: last-answer state vs. immediate "Finish Test" click — RESOLVED in commit 7f7eed8
**First seen:** commit 9b624ff (2026-03-12)
**Status: RESOLVED in commit 7f7eed8** — Both `quiz-flow.spec.ts` and `progress.spec.ts` now
wait for `[data-testid="progress-bar"]` to reach `style` matching `/100%/` before clicking
"Finish Test". Because the progress bar width is derived from `answers.size / totalQuestions * 100`,
Playwright's DOM assertion serializes correctly against the React setState flush. The last
question's answer is guaranteed to be in the Map before `handleSubmit` reads it.
**Additional fixes in same commit:**
- Dialog selector changed from fragile `getByText('Finish Quiz')` (matched h2 text) to
  `getByRole('dialog', { name: 'Finish quiz' })` (targets the `<dialog aria-label="Finish quiz">` element).
- Score regex changed from literal `'%'` (false-positive substring match) to `/\d+%/`
  (precise match for the `{rounded}%` render output).
**Watch for:** E2E tests that click "Finish Test" or "Submit Quiz" immediately after a
state-modifying button click without an intermediate assertion that the state update landed.

### SECURITY DEFINER RPC WHERE-clause identity guard vs. RAISE EXCEPTION guard (commit 86c8da4)
**First seen:** commit 86c8da4 (2026-03-12)
**Files:** `supabase/migrations/20260312000014_analytics_rpcs_plpgsql.sql` — `get_daily_activity`, `get_subject_scores`
**Pattern:** Both RPCs correctly raise for `auth.uid() IS NULL`. However, the cross-tenant
identity check (`auth.uid() = p_student_id`) is enforced only as a WHERE predicate in the
data query, not as a second explicit RAISE guard. An authenticated user passing another
student's UUID gets zero rows (silent rejection) rather than a raised exception. This does
not leak data, but it violates the defense-in-depth model: the intent of plpgsql conversion
was to add RAISE EXCEPTION guards for all unauthorized access, not just anonymous access.
**Correct pattern:**
```sql
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
IF auth.uid() != p_student_id THEN RAISE EXCEPTION 'forbidden'; END IF;
```
**Watch for:** any SECURITY DEFINER function where `auth.uid() = p_student_id` appears
only in a WHERE clause without a corresponding RAISE guard for the mismatch case.

### null-data swallow after Supabase error guard (commit 86c8da4)
**First seen:** commit 86c8da4 (2026-03-12)
**File:** `apps/web/lib/queries/reports.ts` — `getAllSessions` subjects fetch
**Pattern:** `if (subjectsError) throw ...` guards the explicit error case, but the
`subjectMap` is built with `(subjects ?? [])`. If Supabase returns `{ data: null, error: null }`
(valid in edge RLS cases), `subjects` is null, the map is empty, and all session rows lose
their subject names with no error thrown. The fix in this commit correctly destructures
`subjectsError` and guards it, but `subjects ?? []` is still a silent data-loss path.
**Correct pattern:** After the error guard, add `if (!subjects) throw new Error(...)`,
then use `subjects` directly (not `subjects ?? []`).
**Watch for:** any query result that uses `?? []` or `?? {}` as a fallback after a separate
`if (error) throw` guard — the fallback can swallow null data that should also be an error.
Also watch for future test scenarios testing partial submission — the 100% flush gate would
deadlock; use a count-based style assertion (`/66%/`) or explicit partial-count wait instead.

### batch_submit_quiz — score denominator/numerator mismatch on partial batch (commit b312922)
**First seen:** commit b312922 (2026-03-12)
**File:** `supabase/migrations/20260312000011_batch_submit_rpc.sql` lines 103-109
**Pattern:** `v_total` is now read from `quiz_sessions.total_questions` (session scope), but
`v_correct_count` is counted from all rows in `quiz_session_answers` for the session. If the
batch submitted is smaller than `total_questions` (no server-side guard enforces equality), the
denominator is the full session count while the numerator reflects only submitted answers.
Skipped questions inflate the denominator without contributing to the numerator, under-scoring.
**Fix:** Guard `jsonb_array_length(p_answers) != v_total` and raise exception if mismatch.
This enforces the deferred-write contract that the batch is always complete.
**Watch for:** any future path where `batch_submit_quiz` is called with a partial answer list.
**Status:** ISSUE — filed in review of commit b312922.

### type declaration between import statements (commit b312922)
**First seen:** commit b312922 (2026-03-12)
**File:** `apps/web/app/app/quiz/session/_hooks/quiz-submit.ts` lines 1-4
**Pattern:** A `type` alias is declared between two `import` blocks. Cosmetically unusual;
Biome may not flag it. Correct placement is after all imports.
**Watch for:** type declarations interspersed in import sections after future import refactors.

### count state not clamped on maxQuestions decrease (commit b312922)
**First seen:** commit b312922 (2026-03-12)
**File:** `apps/web/app/app/quiz/_hooks/use-quiz-config.ts` / `quiz-config-form.tsx`
**Pattern:** Label and range input clamp via `Math.min(count, maxQuestions || 1)` at render time,
but `count` state is not reset when `maxQuestions` drops. If the user switches to a smaller subject,
the displayed value clamps correctly, but the state holds the old value. If `maxQuestions` rises
again before clicking Start, the count jumps back to the stale value unexpectedly.
Protected at server boundary by `Math.min(count, maxQuestions || 1)` in `handleStart`.
**Watch for:** any new subject-change path that needs to reset dependent state.

### finally-block clearing loading state — correct for non-navigation actions (commit b312922)
**Status: PATTERN CONFIRMED** — `resume-draft-banner.tsx` `handleDiscard` correctly uses `finally`
to clear `setDiscarding(false)` because discard does not trigger navigation. This is the safe case.
Contrast with the documented anti-pattern where `setLoading(false)` in `finally` re-enables a
button during an in-flight `router.push`. The key distinction: navigation handlers must not clear
loading in `finally`; non-navigation handlers should use `finally` for correct cleanup.

### fetchQuestionStats — Server Action missing Zod validation on questionId (commit 845923b)
**First seen:** commit 845923b (2026-03-12)
**File:** `apps/web/app/app/quiz/actions/fetch-stats.ts`
**Pattern:** `fetchQuestionStats(questionId: string)` is a `'use server'` Server Action that
accepts a raw string without Zod validation. All sibling actions (`start.ts`, `submit.ts`,
`batch-submit.ts`) validate with Zod before any DB access. A non-UUID string would cause Postgres
to return empty results silently instead of failing fast with a validation error.
**Fix:** Add `z.object({ questionId: z.string().uuid() }).parse({ questionId })` at the top of the action.
**Watch for:** thin one-liner Server Action wrappers that pass-through to lib/queries without Zod validation.

### SECURITY DEFINER RPCs using LANGUAGE sql return empty rows on null auth.uid() (commit 845923b)
**First seen:** commit 845923b (2026-03-12)
**File:** `supabase/migrations/20260312000013_analytics_rpcs.sql`
**Pattern:** `get_daily_activity` and `get_subject_scores` use `LANGUAGE sql STABLE SECURITY DEFINER`
with `WHERE auth.uid() = p_student_id` as the auth guard. The established project pattern
(002_rpc_functions.sql) uses `LANGUAGE plpgsql` with `IF v_student_id IS NULL THEN RAISE EXCEPTION`.
The `LANGUAGE sql` approach silently returns zero rows when called unauthenticated rather than raising.
Not an access-control gap (data is still not returned for wrong students), but diverges from the
defensive pattern and produces no error log entry.
**Watch for:** new SECURITY DEFINER RPCs that use LANGUAGE sql with WHERE-based auth instead of plpgsql RAISE.

### Supabase query errors silently dropped without { error } destructuring (commit 845923b)
**First seen:** commit 845923b (2026-03-12)
**Files:** `apps/web/lib/queries/question-stats.ts`, `apps/web/lib/queries/reports.ts`
**Pattern:** Multiple `.from(...)` queries await without destructuring `{ error }`. Supabase never
throws — errors are in `result.error`. DB failures silently return as "0 count" or "empty array".
This is now a second occurrence (first: `deleteDraft` in commit a269284).
**Pattern count:** 2 occurrences — rule already documented in code-style.md. Enforce in review.
**Watch for:** `const { count } = await supabase.from(...)` or `const { data } = await supabase.from(...)`
without a paired `error` check in any new lib/queries file.

### startTransition wrapping a .then() chain — loading state set inside microtask (commit 845923b)
**First seen:** commit 845923b (2026-03-12)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.tsx` lines 21-31
**Pattern:** `startTransition(() => { fetchQuestionStats(...).then(...setStats...).catch(...) })`.
`startTransition` marks the work as non-urgent for React scheduling but the `.then/.catch` callbacks
run as microtasks, outside the transition batch. `setLoading(false)` inside `.then` is not
part of the transition and may cause an extra render cycle. The correct pattern for Server Action
calls that update loading state is `useTransition()` hook: `const [isPending, startTransition] = useTransition()`.
`isPending` reflects the transition status correctly. Minor — not a user-visible bug in practice.
**Watch for:** `startTransition(() => { asyncFn().then(...setState...) })` — the promise callbacks
execute outside the transition boundary.

### getQuestionStats — two sequential COUNT queries on same table scope (commit 845923b..385017a)
**First seen:** commit range 845923b..385017a (2026-03-12)
**File:** `apps/web/lib/queries/question-stats.ts` — `getResponseCounts`
**Pattern:** `getResponseCounts` issues two `await supabase.from('student_responses').count()`
calls sequentially — one for `total`, one for `correct`. Between the two counts a new response
row could be appended. `incorrectCount = total - correct` would then undercount or even go
negative in theory. The three higher-level helpers in the same file (`getResponseCounts`,
`getFsrsCard`, `getLastResponse`) are called via `Promise.all`, but the two internal counts
inside `getResponseCounts` are sequential and not isolated by a transaction.
**Fix:** Collapse into a single query (via RPC or `.select('is_correct')` with client aggregation)
to guarantee a consistent snapshot.
**Watch for:** Any function that counts the same row set twice in two sequential queries without
a transaction, where the target table is mutable or append-only.

### `as string & keyof never` cast on direct .from() queries (commit 845923b..385017a)
**First seen:** commit range 845923b..385017a (2026-03-12)
**File:** `apps/web/lib/queries/question-stats.ts` — `getResponseCounts`
**Pattern:** `as string & keyof never` suppresses TypeScript's column-name check on `.eq()` and
`.order()` calls. This is the correct workaround only for RPC calls via `supabase-rpc.ts` where
the generated type resolves to `never`. For direct `.from()` queries, use `.returns<RowType[]>()`
instead — it overrides the return type without silencing the column-name narrowing.
The two other helpers in the same file (`getFsrsCard`, `getLastResponse`) correctly use
`.returns<>()`. `getResponseCounts` is the outlier.
**Watch for:** `as string & keyof never` on `.eq()`, `.order()`, `.not()` inside direct `.from()`
queries in any new `lib/queries/*.ts` file.

### StatisticsTab — loaded stats not reset on questionId change (commit 845923b..385017a)
**First seen:** commit range 845923b..385017a (2026-03-12)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.tsx`
**Pattern:** `stats` state is set once on "Load Statistics" click and never cleared when the
`questionId` prop changes. Users navigating to a different question see the previous question's
stats until they reload.
**Fix:** `useEffect(() => { setStats(null); setError(null) }, [questionId])`
**Watch for:** any client component that holds fetched data in local state keyed by a prop that
can change without triggering a remount (i.e., the component is not re-keyed on prop change).

### getUser authError not checked in sibling query files (commit 2190dd5 → RESOLVED commit 3a0d1e6)
**First seen:** commit 2190dd5 (2026-03-12)
**Files fixed:** `apps/web/lib/queries/analytics.ts` — `getDailyActivity`, `getSubjectScores`
**Pattern:** `supabase.auth.getUser()` returns `{ data: { user }, error }`. Network failures or
expired refresh tokens set `error` non-null while `user` is null. Before this fix, the code
checked only `if (!user)` — both a missing-user case and an auth network error collapsed to
the same generic "Not authenticated" message, and the distinction was lost. The fix correctly
destructures `error: authError` and throws a specific message when `authError` is non-null,
then checks `!user` separately for the clean unauthenticated case.
**Behavioral note:** The order is important — `authError` checked first, `!user` second. An auth
error implies user is null but the reverse is not true (user can be null without an error on a
clean unauthenticated request). Correct ordering confirmed in all functions.
**RESOLVED in commit 3a0d1e6:** All six remaining sibling files now destructure and check
`authError`. The fix is applied uniformly across the entire `lib/queries/` family.
**FULLY RESOLVED in commit 78cb130:** `quiz-report.ts` and `load-session-questions.ts` now also
log auth failures before their early returns. Every `lib/queries/*.ts` file now has both
`authError` destructuring + a log entry on failure.
**Watch for:** any new `lib/queries/*.ts` file that calls `supabase.auth.getUser()` — require
`error: authError` destructure, a server-side log on authError, and a guard before the `!user` check.

### quiz-report.ts authError silent swallow (RESOLVED commit 78cb130)
**First seen:** commit 3a0d1e6 (2026-03-12)
**Status: RESOLVED in commit 78cb130** — `console.error('[getQuizReport] Auth error:', authError.message)`
added before `return null`. Auth failures now produce a server log entry. The null-return contract
is preserved. Fix matches the pattern used by sibling null-return functions.

### load-session-questions.ts authError message exposed in client UI (RESOLVED commit 78cb130)
**First seen:** commit 3a0d1e6 (2026-03-12)
**Status: RESOLVED in commit 78cb130** — authError branch now logs the specific message server-side
and returns the generic `'Not authenticated'` string. Matches the `!user` branch below it.
Raw Supabase error strings no longer reach the student UI.

### authError test coverage gap — new branches not tested (RESOLVED commit 78cb130)
**First seen:** commit 3a0d1e6 (2026-03-12)
**Status: RESOLVED in commit 78cb130** — All seven query files with authError branches now have
a paired test case. `quiz-report.test.ts`, `load-session-questions.test.ts`,
`dashboard.test.ts`, `progress.test.ts`, `review.test.ts` (x2), `question-stats.test.ts`,
and `reports.test.ts` all test the authError path. The `quiz-report` test uses
`mockResolvedValueOnce` and asserts `result === null` — a genuine regression guard.
**Residual watch:** the existing "returns null when user is not authenticated" test in
`quiz-report.test.ts` uses a persistent `mockResolvedValue` mock (not `Once`). A future test
inserted before the next mock reset could silently inherit null-user state. Non-blocking.
**Watch for:** any commit adding `if (authError)` branches without a paired test case.

### setIsLoading(false) called unconditionally in render body — spurious re-render on question switch (commit 53efbdd)
**First seen:** commit 53efbdd (2026-03-13)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.tsx` lines 20-26
**Pattern:** The question-switch guard calls `setIsLoading(false)` during the render body
unconditionally, even when `isLoading` is already `false`. React schedules a state update on
every question switch regardless, triggering an extra re-render cycle. When a fetch is in progress
and the user navigates rapidly, this produces a render storm (one extra render per question switch).
The generation counter correctly prevents stale state from landing in the UI, so there is no
user-visible artifact — but the wasted renders are real.
**Fix:** Guard the call: `if (isLoading) setIsLoading(false)`.
**Root cause:** Replacing `isPending` (a read during render, no state write) with `setIsLoading(false)`
(a state write during render) changed a zero-cost derived read into a scheduled update. The
generation-counter approach is correct but this particular line needs the guard.
**Watch for:** any `setState(false)` call inside a "derive during render" guard block (the
`prevProp.current !== currentProp` pattern). Always guard with the current value check.

### useTransition + manual useState loading — hybrid creates theoretical scheduler mismatch (commit 53efbdd)
**First seen:** commit 53efbdd (2026-03-13)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.tsx` line 14
**Pattern:** `startTransition` is retained for wrapping the async fetch, but `isPending` is
discarded in favor of manual `isLoading` state. In React 19's concurrent scheduler, a
transition can be interrupted and restarted. If that happens, `setIsLoading(true)` (called
before `startTransition`) and the transition callback (called inside) may be associated with
different batches. The `isLoading` state could become `true` with no running transition to
clear it. In practice the generation-counter would cover a subsequent question switch, but
within the same question the user could see a stuck skeleton.
**Recommended pattern:** Either use `isPending` exclusively (derive loading from the
transition — solve the original stale-pending bug via `key={questionId}` remount), or drop
`startTransition` entirely and use a plain `async` function with manual state only.
**Watch for:** any component that mixes `startTransition` with a separate `useState` for the
same loading concept — the two can desync under concurrent rendering.

### boundParam NaN guard fallback is silent — no server log on invalid input (commit 53efbdd)
**First seen:** commit 53efbdd (2026-03-13)
**File:** `apps/web/lib/queries/analytics.ts` — `boundParam`
**Pattern:** Non-finite input is correctly clamped to `min`, but the non-finite branch has no
`console.warn`. A caller passing `NaN` (e.g., `parseInt('')`) silently gets a 1-item result
with no server log. The security behavior is correct; the observability is not.
**Fix:** Add `console.warn('[boundParam] Non-finite value, clamping to min:', { value, min, max })`
in the non-finite branch.
**Watch for:** silent clamping/fallback functions for numeric RPC parameters — always log when
the fallback fires so the cause is visible in server logs.

### setIsLoading(false) guard — RESOLVED in commit b555b50
**First seen:** commit 53efbdd (2026-03-13)
**Status: RESOLVED in commit b555b50** — `if (isLoading) setIsLoading(false)` replaces the
unconditional call. The guard eliminates the spurious re-render on every question switch when
`isLoading` is already `false`. The render-body pattern is now correct.
**Verified:** New test "shows load button immediately when questionId changes during an in-flight fetch"
directly exercises the guard path — it asserts the load button reappears before the stale fetch
resolves. Coverage is complete.

### isLoading guard in render body — test coverage confirms fix (commit b555b50)
**New test added:** `statistics-tab.test.tsx` — "shows load button immediately when questionId
changes during an in-flight fetch" blocks the q-1 fetch with a deferred promise, then rerenders
with `questionId="q-2"`. Asserts the load button appears before `resolveQ1()` is called, and
that stale q-1 data never lands. This is a strong regression test for the render-body guard.

### useTransition + manual isLoading hybrid — still unresolved after hook extraction (commit f0f8d0e)
**First seen:** commit 53efbdd (2026-03-13)
**Status:** SUGGESTION — 2nd occurrence. The extraction of `useQuestionStats` in commit f0f8d0e
did not resolve the `startTransition` + `isLoading` hybrid. The design debt is now isolated
in the hook body, which makes it easier to fix, but it is not fixed.
**Occurrence count:** 2 (53efbdd, f0f8d0e). No user-visible bug has been reported.
**Pattern:** `startTransition` wraps the async fetch but `isPending` is unused; `isLoading`
state is managed manually. In React 19 concurrent mode, the two can desync if a transition
is interrupted. Fix: either use `isPending` as the sole loading signal, or drop `startTransition`
entirely and use a plain async function with manual state only.
**Watch for:** any refactor of `useQuestionStats` — the hybrid is the remaining design debt.

### waitFor wrapping .not.toBeInTheDocument — correct but masks fast-failure (commit f0f8d0e)
**First seen:** commit f0f8d0e (2026-03-13)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.test.tsx` line 193
**Pattern:** `await waitFor(() => expect(x).not.toBeInTheDocument())` is the right fix for
a race against a microtask flush, but it delays test failure by the full `waitFor` timeout
(1000ms default) when the element IS present. Prefer asserting the positive expected state
first (`expect(loadButton).toBeInTheDocument()`), then asserting absence synchronously after.
This gives a fast failure signal when the generation guard breaks.
**Severity:** SUGGESTION — test is correct and catches regressions. Improvement is for
failure-diagnosis speed only.

### hook extraction without JSDoc on non-obvious render-body pattern (commit f0f8d0e)
**First seen:** commit f0f8d0e (2026-03-13)
**File:** `apps/web/app/app/quiz/_components/statistics-tab.tsx` — `useQuestionStats`
**Pattern:** When extracting logic into a hook, render-body `setState` calls (the
`prevProp.current !== currentProp` pattern) should be documented. Future reviewers
encountering `setState` during a hook's render body may flag it as a violation before
understanding the React-sanctioned derived-state-from-props pattern. A single JSDoc
comment prevents this false-positive review cycle.
**Watch for:** hooks containing render-body `setState` that lack an explanatory comment.

### ActivityChart three-layer split — positive pattern (commit f0f8d0e)
**File:** `apps/web/app/app/dashboard/_components/activity-chart.tsx`
**Pattern:** Pure data formatter (`formatActivityData`) → pure renderer (`ChartBody`) →
orchestrator with side effects (`ActivityChart` — hydration guard + empty state).
Hydration guard remains at the outermost layer; recharts DOM reads are protected.
All three functions are under 30 lines. This is the reference pattern for splitting
client components that mix hydration concerns with data rendering.

### Module-level capture variable for test assertions — requires beforeEach reset (commit 8863926)
**First seen:** commit 8863926 (2026-03-13)
**File:** `apps/web/app/app/dashboard/_components/activity-chart.test.tsx`
**Pattern:** When a test uses a module-level variable to capture props passed to a mocked child
(here `capturedBarChartData` captures the `data` prop given to the mocked `BarChart`), the
variable must be reset in `beforeEach`. Without the reset, a test that never reaches the mocked
component (e.g., the empty-state test path that returns before rendering `BarChart`) leaves the
variable populated with data from the previous test. Subsequent tests that read the variable
would assert on stale data, producing false passes.
**Fix applied:** `beforeEach(() => { capturedBarChartData = [] })` added in commit 8863926.
**Positive pattern:** The reset is placed at the top of the describe block so it guards all
current and future tests uniformly.
**Watch for:** any test file that uses a module-level variable to capture call arguments or
rendered props from a mocked component. The variable must be reset in `beforeEach`, not just
initialized at module load time.

### ActivityBars extract — four-layer component split is still clean (commit 8863926)
**File:** `apps/web/app/app/dashboard/_components/activity-chart.tsx`
**Pattern:** Refactor now has four layers:
1. `formatActivityData` — pure data transform (no JSX)
2. `ActivityBars` — pure JSX renderer (no formatting, no state)
3. `ChartBody` — composes 1 + 2 with layout wrapper
4. `ActivityChart` — hydration guard + empty state + calls ChartBody
All four are under 30 lines. The test mock correctly captures data at the `BarChart` level,
which receives pre-formatted data from `ActivityBars`. The test assertions remain valid after
the refactor because the mock's capture point (`BarChart` props) is unchanged.
**Positive signal:** Extracting `ActivityBars` removed the last over-30-line function in this
file while keeping the test mock wiring intact. This is the correct approach — component
splits that don't require changing test infrastructure confirm the abstraction boundary is right.

### env path fix in seed-test-user.ts — path made consistent with sibling scripts (commit 27c201f)
**First seen:** commit 27c201f (2026-03-13)
**File:** `apps/web/scripts/seed-test-user.ts` line 14
**Change:** `resolve(__dirname, '../../../.env.local')` → `resolve(__dirname, '../.env.local')`
**Assessment:** The fix is correct. `__dirname` for this file is `apps/web/scripts/`, so `../`
resolves to `apps/web/` where `.env.local` actually lives. The old path (`../../../`) would have
resolved to the repo root, where no `.env.local` exists. The fix aligns `seed-test-user.ts` with
`dev-login.ts` (which also uses `../`) and with `import-questions.ts` (which tries `../` first).
**Positive signal:** The comment in the file still says "Load .env.local from repo root" — this
comment is now stale and incorrect. Not a semantic bug, but a misleading comment.
**Watch for:** stale or incorrect comments in script files after path changes. Comment drifts
cause the next developer to either ignore or over-trust it.

### checkAnswer — direct questions SELECT returns correct flags to student-facing code (branch feat/post-sprint-3-polish)
**First seen:** feat/post-sprint-3-polish (2026-03-13)
**File:** `apps/web/app/app/quiz/actions/check-answer.ts` lines 27-32
**Pattern:** New `checkAnswer` Server Action queries `questions.options` directly (which contains
`correct: boolean` per option) instead of using a SECURITY DEFINER RPC. Also returns `correctOptionId`
without verifying the question belongs to an active session the student owns, allowing a student to
probe any question's correct answer via a direct Server Action call.
**Severity:** CRITICAL. The security rule "correct answers must be stripped via get_quiz_questions() RPC"
applies to any direct SELECT returning the options JSONB column, not only to SELECT *.
**Fix:** Move correctness check into a SECURITY DEFINER RPC that accepts question_id + selected_option_id,
checks the question belongs to an active session owned by auth.uid(), and returns only
{ is_correct, explanation_text, explanation_image_url }.
**Watch for:** any new Server Action that queries `questions.options` directly with `.select('options, ...')`.

### student_responses ON CONFLICT DO NOTHING with no unique constraint (pre-existing, repeated in migration 017)
**First seen:** initial schema (2026-03-11), repeated in commits 6120e3f, b312922, feat/post-sprint-3-polish
**Files:** `supabase/migrations/20260311000002_rpc_functions.sql` line 133,
`supabase/migrations/20260312000011_batch_submit_rpc.sql` line 91,
`supabase/migrations/20260313000017_batch_submit_allow_partial.sql` line 92
**Pattern:** `student_responses` has no UNIQUE constraint. All three RPC migrations insert with
`ON CONFLICT DO NOTHING` but there is no unique constraint to trigger a conflict, so the clause
is dead code. A network retry or double-submit appends duplicate rows to the immutable response log,
corrupting analytics and FSRS inputs.
**Severity:** CRITICAL. The fix requires a migration: add `UNIQUE (session_id, question_id)` to
`student_responses` (with a cleanup step for any pre-existing duplicates), then change all three
conflict clauses to `ON CONFLICT (session_id, question_id) DO NOTHING`.
**Watch for:** any new RPC inserting into `student_responses` — verify the conflict clause references
an actual unique constraint before accepting.

### TOCTOU race on draft count check (feat/post-sprint-3-polish)
**First seen:** feat/post-sprint-3-polish (2026-03-13)
**File:** `apps/web/app/app/quiz/actions/draft.ts` lines 46-56
**Pattern:** App-level count check + separate INSERT with no transaction/lock allows concurrent
saves to both pass the 20-draft guard and create 21+ drafts. The DB constraint that previously
enforced uniqueness was dropped in migration 018.
**Severity:** ISSUE. Fix: Postgres trigger `BEFORE INSERT ON quiz_drafts` to enforce the limit
atomically, or use `pg_advisory_xact_lock` to serialize per-student inserts.
**Watch for:** any "count then insert" pattern without a DB-level constraint or transaction lock.

### Unbounded student_responses fetch in getFilteredCount unseen filter (feat/post-sprint-3-polish)
**First seen:** feat/post-sprint-3-polish (2026-03-13)
**File:** `apps/web/app/app/quiz/actions/lookup.ts` lines 50-57
**Pattern:** `student_responses` query has no `.in('question_id', ...)` filter and no `.limit()`.
Supabase's default row limit is 1000. A student with >1000 responses gets a truncated result,
causing the unseen count to be wrong (questions answered appear as unseen).
**Severity:** ISSUE. Fix: add `.in('question_id', data.map(q => q.id))` to scope the query to the
current subject, eliminating the pagination risk and improving performance.
**Watch for:** any Supabase query on `student_responses` or `fsrs_cards` that fetches all rows for
a student without filtering to the relevant question set.

### handleSelectAnswer no re-entry guard (feat/post-sprint-3-polish)
**First seen:** feat/post-sprint-3-polish (2026-03-13)
**File:** `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts` lines 40-58
**Pattern:** `handleSelectAnswer` is async. No guard prevents a second call before the in-flight
`checkAnswer` resolves. A fast user can cause the feedback Map to be overwritten with results for
a different selection than the one recorded in the answers Map. Feedback and recorded answer become
inconsistent. The Submit button is hidden once `showResult` is true (once the answers Map has
the questionId), but `showResult` depends on a render cycle following `setAnswers` — a narrow window.
**Severity:** ISSUE. Fix: add `if (answers.has(questionId)) return` at the top of `handleSelectAnswer`.
**Watch for:** any async event handler that fires on user interaction without a guard against
duplicate calls before the first await resolves.

### RPC error message forwarded verbatim to student UI (feat/post-sprint-3-polish)
**First seen:** feat/post-sprint-3-polish (2026-03-13)
**File:** `apps/web/app/app/quiz/actions/batch-submit.ts` lines 45-48
**Pattern:** `Failed to submit quiz: ${rpcMessage}` forwards raw Postgres exception text to the client.
SECURITY DEFINER functions can include schema-level detail in exception messages. Low-severity
information disclosure but inconsistent with all other error paths in the codebase.
**Severity:** SUGGESTION. Log rpcMessage server-side, return generic user message.
**Watch for:** any error branch that formats a user-facing string using a raw error.message from
a Supabase RPC or DB query result.

### batch_submit_allow_partial — score denominator/numerator mismatch RESOLVED (migration 017)
**First seen:** commit b312922 (2026-03-12) — tracked as ISSUE
**Status: RESOLVED in migration 20260313000017** — `v_score` now uses `v_answered` (count of
submitted answers) as denominator rather than `v_total` (all questions in session). Unanswered
questions are correctly excluded from the score. The guard enforcing full batch submission was
removed to explicitly allow partial submissions, and the score formula was updated to match.

## CodeRabbit Findings to Learn From
- Cookie forwarding consistency across redirect branches (PR #23)
- Query param forwarding to auth endpoints (PR #23)
- auth-before-parse ordering in Server Actions (PR #26, round 4)
- Partial-write failure disclosure in batch Server Actions (commit 54e9351)
- `finally` clearing loading state during navigation (commit 9d9e898)
- E2E race between client state update and immediate next action (commit 9b624ff)
- Progress-bar DOM attribute as flush gate for React setState (commit 7f7eed8)
- Score denominator/numerator mismatch when sourcing total from session vs. counting from batch (commit b312922)
- Thin Server Action pass-throughs skipping Zod validation (commit 845923b)
- LANGUAGE sql SECURITY DEFINER silent-empty vs. RAISE EXCEPTION pattern (commit 845923b)
- Partial auth-error handling across query family — fix applied to subset only (commit 2190dd5)
- Unconditional setState call in render-body guard triggers spurious re-renders (commit 53efbdd)
- useTransition + manual useState hybrid — theoretical scheduler mismatch in concurrent mode (commit 53efbdd)
- Hook extraction moves design debt but does not resolve it — review hooks for inherited issues (commit f0f8d0e)
- Direct questions SELECT in student-facing Server Action bypasses RPC answer-stripping rule (feat/post-sprint-3-polish)
- ON CONFLICT DO NOTHING on table with no unique constraint is dead code — duplicates silently inserted (repeated pattern)
- Count-then-insert without DB lock/trigger allows TOCTOU race on app-enforced limits (feat/post-sprint-3-polish)
- Unbounded Supabase fetch on append-only table truncated at 1000 rows by default (feat/post-sprint-3-polish)
- Partial cancellation guard in useEffect: `if (cancelled) return` placed before state updates but `setIsLoading(false)` left unguarded — caught in commit 6d274fa

---

## Session 2026-03-13 (commit 6d274fa) — fix: stale-fetch race, draft update silent no-op, split draft.ts

### Three fixes from previous review — assessment

**Fix 1 (stale-fetch race in explanation-tab.tsx): PARTIALLY CORRECT — ISSUE remains**
The `cancelled` flag and cleanup function are correctly added. However, `setIsLoading(false)` on
line 70 is not inside the `if (!cancelled)` guard — it is only skipped because `if (cancelled) return`
exits before reaching it. This means: (a) the cleanup is correct for the active case, (b) but the
pattern is inconsistent with `statistics-tab.tsx` and `use-question-stats.ts` which wrap all setState
calls inside a single `if (!cancelled)` block. The missing guard also leaves the unmount case
implicit — if the component unmounts mid-fetch, no cleanup of loading state occurs because the
component is gone, but the pattern does not make this intent visible.
**Fix:** Wrap both `setExplanation` and `setIsLoading(false)` inside `if (!cancelled) { ... }`.

**Fix 2 (draft update silent no-op): CORRECT**
`.select('id')` chained after `.eq('student_id', userId)` and `(data as unknown[]).length === 0`
check correctly closes the gap. The `data as unknown[]` cast is justified given the `quiz_drafts as
'users'` workaround. Distinct error message `'Draft not found or already deleted'` is actionable.

**Fix 3 (split draft.ts): CORRECT**
`deleteDraft` correctly moved to `draft-delete.ts`. Auth-before-parse order preserved in new file.
All six import sites (3 production, 3 test) updated consistently. `draft.ts` at 114 lines is within
the 100-line Server Action limit after the extraction.

### insertNewDraft — getOrganizationId inlining is a minor behavioural change (NOTE)
The previous `getOrganizationId` helper was a named function with its own error path. The inline
version in `saveDraft` (lines 47-52) is functionally equivalent but removes the named abstraction.
No behavioral gap — the error return on `!u?.organization_id` is identical.

### sessionConfig helper — positive extraction (POSITIVE)
Eliminates duplication between `updateExistingDraft` and `insertNewDraft`. Inferred return type is
appropriate since it feeds directly into a DB payload. Not external input — no Zod concern.

---

## Session: commit 157f421 (2026-03-13) — eval feedback UX fixes

### answeredCount fallback uses wrong sentinel value (NEW ISSUE)
**File:** `apps/web/lib/queries/reports.ts:96`
**Pattern:** `answeredCountMap.get(s.id) ?? s.correct_count` — falls back to `correct_count` when
no rows exist in `quiz_session_answers` for a session (e.g., legacy sessions). `correct_count` is
not a valid proxy for `answeredCount`. The correct fallback is `s.total_questions`.
**Status:** ISSUE. Fix: `?? s.total_questions`.
**Watch for:** any new field that is derived from a secondary query and needs a fallback — always
reason about what the fallback value semantically means, not just what is numerically similar.

### hard DELETE on quiz_drafts in discard.ts (NEW ISSUE — soft-delete rule violation)
**File:** `apps/web/app/app/quiz/actions/discard.ts:43-47`
**Pattern:** New `discardQuiz` Server Action uses `.delete()` on `quiz_drafts` table, violating the
project-wide soft-delete rule. The rule is in `docs/security.md` §14 and `CLAUDE.md`.
**Status:** ISSUE. Fix: replace `.delete()` with `.update({ deleted_at: ... })`.
**Recurrence note:** This is the first hard DELETE on `quiz_drafts` — watch for same mistake if
more discard/cleanup paths are added.

### auth error swallowing in new Server Actions (SUGGESTION — watch pattern)
**File:** `apps/web/app/app/quiz/actions/discard.ts:15-19`
**Pattern:** `const { data: { user } } = await supabase.auth.getUser()` discards the `error` field.
The established pattern in this codebase is to destructure `error: authError` and return early with
a distinct error message if set. `discard.ts` conflates a transient auth error with "not authenticated".
**Status:** SUGGESTION. Not a security gap (user IS null on auth error), but gives misleading UX.
**Watch for:** any new Server Action that destructures only `data: { user }` without `error: authError`.

### upsert() now throws on DB error (POSITIVE — fixed silent failure)
**File:** `apps/web/lib/supabase-rpc.ts`
**Pattern:** Return type tightened to `Promise<{ data: unknown; error: ... | null }>` and `throw` added
on error. All existing callers use try/catch (FSRS best-effort), so they continue to work correctly.
This closes a silent-failure gap where RLS denials or write failures on `fsrs_cards` were swallowed.

### AnswerOptions key={s.question.id} prevents stale option selection (POSITIVE)
**File:** `apps/web/app/app/quiz/session/_components/quiz-session.tsx:81`
Adding `key={s.question.id}` to `AnswerOptions` forces React to fully unmount and remount the
component when the question changes. This prevents stale selectedOptionId from one question appearing
visually selected on the next question during rapid navigation.

### FOR UPDATE lock on quiz_sessions in batch_submit_quiz (POSITIVE — concurrency guard)
**File:** `supabase/migrations/20260313000022_batch_submit_update_last_was_correct.sql`
The session verification SELECT now uses `FOR UPDATE`, preventing two concurrent batch submits from
both passing the `ended_at IS NULL` check and double-completing the same session. Correct pattern
for session completion atomicity.

---

## Session 2026-03-13 Part 10 — commit df5d354

### Commit: df5d354 (fix: stale currentIndex in handleSave + hook under 80-line limit)
- Status: **CLEAN**
- Files changed: 5 source files + 3 agent memory files
- Summary: Ref fix resolves previously-filed ISSUE. Type move is clean. 6 new tests pass.

**Ref fix — `currentIndexRef` (ISSUE resolved):**
The stale-closure bug filed against commit 34a9352 is correctly fixed. `use-quiz-state.ts` now
declares `currentIndexRef` at lines 24-25 and keeps `.current` synced on every render, mirroring
the existing `answersRef` pattern on lines 22-23. `use-quiz-submit.ts` receives the ref and reads
`.current` at the call site inside `handleSave` (line 41). Both mutable values consumed inside
async handlers now travel as refs. Structurally correct and consistent with the established pattern.

**Type move — `QuizStateOpts` to `types.ts` (CLEAN):**
Type removed from `use-quiz-state.ts` and added to `types.ts` (lines 101-109). The type now lives
alongside all other quiz domain types. The inline `import()` form for `SessionQuestion` is syntactically
valid TypeScript and type-checks clean. No callers import `QuizStateOpts` directly (only `useQuizState`
consumes it), so no breakage. The one external consumer, `quiz-session.tsx`, defines its own
`QuizSessionProps` that is structurally identical — this is intentional separation of the component's
public API from the hook's internal options type.

**No issues found in this commit.**

**Positive patterns:**
- Ref pattern applied consistently: both `answersRef` and `currentIndexRef` are kept in sync on
  every render, ensuring all async handlers always read the latest values.
- Comment on lock ordering was removed from source (it was in patterns.md already) — clean.
- 6 new tests cover `handleDiscard` delegation, `draftId` forwarding, error state propagation,
  and `showFinishDialog` toggle — good behavioral coverage of the new hook's surface.

---

## Session 2026-03-13 — commit 306f44a (fix: session ownership checks + answer error recovery + SQL field validation)

### Three-part commit: session ownership gates, error recovery in useAnswerHandler, SQL hardening

#### ISSUE: JSONB config cast unsafe — potential TypeError on malformed session config (check-answer.ts, fetch-explanation.ts)

**Files:** `apps/web/app/app/quiz/actions/check-answer.ts`:40–42, `apps/web/app/app/quiz/actions/fetch-explanation.ts`:35–36
**Pattern:** Both actions cast the session row to `{ config: { question_ids: string[] } }` via `as unknown as`, then call `.includes(questionId)` with optional chaining (`config?.question_ids?.includes(...)`). If `question_ids` is present in the DB but is a JSON number, object, or malformed value (not an array), `Array.prototype.includes` is called on a non-array, producing a runtime TypeError — not a structured error return.
The SQL migration (026) guards `jsonb_typeof(v_config->'question_ids') <> 'array'` before any array expansion. The TypeScript layer has no equivalent guard, making the two layers inconsistent in defensive posture.
**Fix:** Replace `.includes()` call with:
```ts
const qIds = config?.question_ids
if (!Array.isArray(qIds) || !qIds.includes(questionId)) {
  return { success: false, error: 'Question not in session' }
}
```
**Status:** ISSUE (same fix needed in both files).
**Watch for:** any TypeScript code that calls `Array.prototype` methods on a value obtained via `as unknown as SomeType` from a JSONB column — always add `Array.isArray()` guard before calling array methods.

#### ISSUE: Error recovery in useAnswerHandler clears lock before setAnswers state settles — narrow re-entry window

**File:** `apps/web/app/app/quiz/session/_hooks/use-answer-handler.ts`:39–47
**Pattern:** The catch block calls `lockedRef.current.delete(questionId)` before `setAnswers` state update propagates. Until the next React render lands, `answers.has(questionId)` still reads the pre-removal Map (the prop was captured from the previous render). A fast second tap on the same question falls through the `lockedRef.current.has(questionId)` check (lock is gone) AND through the `answers.has(questionId)` check (stale prop still has the question). The duplicate protection has a brief window where neither guard is active.
The documented invariant (patterns.md: "useRef lock — ordering invariant") specifies the lock is the in-flight guard. This commit removes the lock during the error path before the state update settles, temporarily breaking the invariant.
**Fix options:**
1. Keep `lockedRef.current` populated after the catch, and only delete from it inside a `useEffect` that fires after `answers` no longer includes `questionId`.
2. Simpler: at the top of `handleSelectAnswer`, guard on `lockedRef.current.has(questionId)` alone (not `answers.has(questionId)`), and only delete from the lock after the `setAnswers` updater confirms the deletion.
**Status:** ISSUE. Narrow window in practice given React's fast render cycle, but the correctness invariant is violated.
**Watch for:** any error recovery path that clears a `useRef` lock before its corresponding `useState` update has propagated to the same render cycle.

#### SUGGESTION: answerError persists after submit action clears submitError — stale error visible post-success

**File:** `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts`:71
**Pattern:** `error: answerError ?? submitError`. `answerError` is only cleared on a successful `checkAnswer` call. If a student gets an answer-check error and then clicks Submit successfully, `submitError` is null-cleared by `handleSubmitSession` at the start, but `answerError` from the previous failure remains non-null. The component renders the stale answer error even after a successful submission. The `??` operator ensures `submitError` is never seen when `answerError` is present.
**Fix:** Expose a `clearError` function from `useAnswerHandler` and call it at the start of `handleSubmit`, `handleSave`, and `handleDiscard`.
**Status:** SUGGESTION.

#### SUGGESTION: batch_submit_quiz config element cast to uuid[] — opaque error on malformed element (migration 026)

**File:** `packages/db/migrations/026_batch_submit_field_validation.sql`:64
**Pattern:** `v_session_question_ids := ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[]`. The `jsonb_typeof` guard on line 59 confirms the value is a JSON array, but not that the elements are valid UUID strings. A non-UUID element produces `invalid_text_representation` (Postgres internal exception) rather than the structured `RAISE EXCEPTION` the function uses everywhere else. The failure surface is limited to manually-inserted session rows with malformed config, not normal application flow.
**Fix:** Wrap the cast in a BEGIN/EXCEPTION block or validate element format in a loop before casting.
**Status:** SUGGESTION — low-priority, application flow always writes valid UUIDs.

#### POSITIVE: Session ownership validation consistent between check-answer.ts and fetch-explanation.ts

Both actions apply identical four-constraint ownership checks: `id = sessionId`, `student_id = user.id`, `ended_at IS NULL`, `deleted_at IS NULL`. The question membership check is also identical. No branch divergence on the ownership path. The two functions previously tracked as open ISSUEs for lacking session gates (commits 81c1428, 7c2d7c5) are now resolved.

#### POSITIVE: Error recovery in useAnswerHandler correctly unwinds both lock and optimistic answer state

The catch block removes the question from `lockedRef` AND removes the optimistic answer from the `answers` Map via functional updater. The student is returned to a clean re-answerable state. This is an improvement over the pre-refactor behavior where `checkAnswer` failure left the question locked with no feedback.

#### POSITIVE: OptionalUuid preprocess in lookup.ts — correct normalization pattern

`z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional())` correctly handles the common case where a `<select>` resets to `''` on no-selection. The fix is scoped to the two optional fields only (`topicId`, `subtopicId`), leaving `subjectId` as required. Closes the previous open ISSUE for empty-string UUID validation.

#### POSITIVE: batch_submit_quiz duplicate check now casts to ::uuid inside DISTINCT (migration 026)

`count(DISTINCT (e->>'question_id')::uuid)` correctly normalises UUID case before deduplication. This was the text-vs-uuid dedup bug tracked in patterns.md under commit 741ae30. Now resolved.

#### POSITIVE: split-SELECT pattern in migration 026 correctly fixes config guard ordering

Two-step approach (fetch config row, then guard `jsonb_typeof`, then expand) correctly prevents the evaluation-order bug where `jsonb_array_elements_text` could throw before the guard ran. Fix is structurally sound and the comment accurately explains the motivation.

#### Status update: fetchExplanation session-state gate — RESOLVED in 306f44a

The open ISSUE tracking absence of session ownership validation in `fetchExplanation` (filed commit 81c1428, confirmed open through commits 7c2d7c5 and the post-sprint-3 branch) is now resolved. `sessionId` is a required parameter, and the ownership + question-membership check is performed before the DB query. Mark as resolved.

Same resolution applies to `checkAnswer` session-state gate (filed as a CRITICAL in the post-sprint-3 branch review — the `check_quiz_answer` RPC had its own auth check, but the Server Action lacked session-scoped validation).

---

## Session 2026-03-13 — commit a0d9973 (fix: add array guard on config cast + reactive lock clearing)

### Array guard fix in check-answer.ts and fetch-explanation.ts — RESOLVED (GOOD)

Both files now cast `question_ids` to `unknown` before extraction, then apply `Array.isArray(qIds)` before `.includes()`. The guard is in the same position in both files — correct consistency. The containing cast was also tightened from `{ question_ids: string[] }` to `{ question_ids: unknown }`, which is more honest about what JSONB actually delivers at runtime. The ISSUE filed in commit 306f44a is fully resolved.

**Watch for:** the pattern is now established — any future TypeScript code calling array methods on a JSONB-derived value must have `Array.isArray()` guard before the call.

### Reactive lock clearing in useAnswerHandler — ISSUE remains (new form)

**File:** `apps/web/app/app/quiz/session/_hooks/use-answer-handler.ts`:50–54
**Pattern:** The previous fix (commit 306f44a) deleted `lockedRef.current.delete(questionId)` from the catch block, which was filed as correct but introduced a new window where the lock persisted until the next render. This commit replaces the synchronous delete with a `useEffect` that iterates `lockedRef.current` and removes entries absent from `answers`, keyed on the `answers` prop.

The `useEffect` runs after React flushes the state updates from the catch block (the `setAnswers` deletion and the `setError` call). This is correct in the steady-state: by the time the effect fires, `answers` no longer contains `questionId`, so the lock is cleared.

However, a retryability gap exists in real browsers: between the catch block returning and the effect firing (i.e., between the `setAnswers` call being queued and React completing its next flush + commit + effect phase), `lockedRef.current` still holds `questionId`. If the user taps the same option again within that window — which is shorter than a human reaction time but not zero — `lockedRef.current.has(questionId)` fires and silently drops the retry.

The jsdom test suite does not catch this because `act()` flushes effects synchronously. The test `'releases the ref lock after a failed call so the question can be answered again'` passes because the effect fires between the two `act()` calls, not because it fires before a concurrent re-tap could land.

**Correct fix:** Restore the synchronous `lockedRef.current.delete(questionId)` in the catch block AND keep the `useEffect` as a safety drain for any edge-case ref leaks. The two mechanisms are complementary, not alternatives.

**Status:** RESOLVED in commit 5b2864f. Synchronous `lockedRef.current.delete(questionId)` restored as first statement in the catch block, before `setAnswers` is enqueued. The `useEffect` is retained as a safety drain. Two-layer approach is correct and intentional. The retryability gap is closed.

**Occurrence count:** 2 (306f44a / a0d9973). Both forms of the race have now been identified and resolved. Pattern is stable.

---

## Session 2026-03-13 — commit 5b2864f (fix: restore synchronous lock clear + add Array.isArray test coverage)

### Reactive lock clearing ISSUE — FULLY RESOLVED

**File:** `apps/web/app/app/quiz/session/_hooks/use-answer-handler.ts`:39-40
**Resolution:** `lockedRef.current.delete(questionId)` restored as the first statement in the catch block (synchronous, before `setAnswers` enqueue). The `useEffect` safety drain kept. The two mechanisms are complementary: synchronous delete opens the retry gate immediately in the same microtask; the effect cleans up any ref leaks that don't go through the catch path.
**Ordering verified:** ref mutation (line 40) → `setAnswers` enqueue (line 41) → `setError` enqueue (line 46). Retry gate opens before any re-render. When a re-render does fire, `answers.has(questionId)` returns false (state rolled back), so neither guard on line 21 blocks the retry.
**Success path verified:** On success, `lockedRef` retains the entry permanently because `answers.has(questionId)` is true — the `useEffect` correctly leaves it intact. The `answers.has()` check on line 21 is the primary re-answer guard for the success path; `lockedRef` serves as the in-flight guard only.
**Status:** CLOSED. No further tracking needed.

#### POSITIVE: 6 Array.isArray guard tests close the coverage gap

Three guard paths (null `question_ids`, string `question_ids`, null `config`) tested in both `check-answer.test.ts` and `fetch-explanation.test.ts`. Tests follow the established discriminated union narrowing pattern (`if (result.success) return` before accessing `.error`). Mock setups mirror existing test scaffolding exactly. No new patterns introduced.

**Rule reinforced:** Tests for `Array.isArray` guards should cover: null, wrong type (string/number), and null containing object — these are the three failure modes for JSONB-derived arrays.

### jsdom act() flushes effects synchronously — masks render-gap bugs in lock tests

**Pattern confirmed:** Tests for lock-release-after-failure work in jsdom because `act()` flushes `useEffect` before the next line of test code runs. Any hook property that depends on an effect having fired will appear correct in jsdom even if the effect fires too late for a real-browser interaction.

**Rule:** When testing hooks where the lock-release window matters (lock is cleared by effect, not synchronously in the handler), the test is exercising the steady-state (after flush), not the concurrent-tap scenario (before flush). If a real-browser race condition is the concern, the test must use a deferred promise + multiple concurrent calls, not sequential `act()` blocks.

**Watch for:** any `useRef` lock or guard that is cleared in `useEffect` rather than in the handler — the jsdom tests for it will all pass even if the real-browser race window is non-zero.

### useEffect iterates all locked entries on every answers change — acceptable at current scale (SUGGESTION)

On every successful answer (which adds to the `answers` map), the effect iterates all currently-locked question IDs and checks whether they are still in `answers`. For a successful answer, `questionId` is present in both `lockedRef.current` and `answers`, so no deletion occurs — the loop is a no-op. This is correct but wastes a linear scan on every successful answer. At quiz sizes of 20 questions this is negligible. Noted for awareness if session sizes grow significantly.

---

## Session 2026-03-13 — commit 274821b (fix: runtime type guard + pre-cast validation for CodeRabbit PR #74)

### response_time_ms regex does not bound digit count — integer overflow bypasses controlled error path (ISSUE)

**File:** `packages/db/migrations/027_batch_submit_precast_validation.sql`:96
**Pattern:** The validation guard is:
```sql
IF v_rt_text IS NULL OR v_rt_text !~ '^\d+$' OR v_rt_text::int < 0 THEN
  RAISE EXCEPTION 'answer for question % has invalid response_time_ms', v_qid_text;
END IF;
```
`'^\d+$'` accepts any number of digits. A value like `'99999999999'` (11 digits) passes the regex check but throws a raw Postgres numeric overflow exception when `v_rt_text::int` executes, bypassing the controlled RAISE EXCEPTION message. The intent of the pre-cast validation pattern is precisely to replace raw Postgres cast errors with informative RAISE messages — the UUID regex works because UUIDs are fixed-length, but the unbounded digit regex does not provide the same guarantee for integers.
**Fix:** Bound the digit count: `'^\d{1,10}$'` admits all values up to 9 999 999 999 ms (~115 days) while staying within `int` range.
**Status:** ISSUE.
**Watch for:** any `regex_check THEN cast` pattern for integer fields — the regex must bound the digit count to prevent overflow on the cast line.

### Text-level dedup and per-answer UUID regex now consistently close the case-sensitivity gap (RESOLVED from patterns)

**Pattern update (commit 741ae30 ISSUE → commit 274821b):** The prior ISSUE noted that text-level dedup could miss case-variant UUID duplicates. This commit's per-answer UUID regex `'^[0-9a-f]{8}-...$'` (lowercase-only) means any uppercase UUID fails the per-answer regex before the loop can produce a silent duplicate write. The two mechanisms together cover the case-sensitivity attack surface. The prior ISSUE is resolved for the current codebase.
The cleaner single-mechanism fix (`DISTINCT lower(e->>'question_id')` in the dedup check) remains a SUGGESTION but is non-blocking.
**Status:** Prior ISSUE closed.

### isCheckAnswerRpcResult runtime guard has no test coverage for the malformed-shape code path (SUGGESTION)

**File:** `apps/web/app/app/quiz/actions/check-answer.ts`:62
**Pattern:** The new guard `!isCheckAnswerRpcResult(data)` replaces `!data`. The code path where `data` is non-null but structurally invalid (`error === null`, `data.is_correct` is missing or wrong type) returns `{ success: false, error: 'Question not found' }`. No existing test exercises this path — the test suite covers correct/incorrect answers, RPC errors, and explanation fields, but not a malformed-shape response.
**Fix:** Add a test case: `mockRpc.mockResolvedValue({ data: { is_correct: 'yes' }, error: null })`, assert `result.success === false`.
**Status:** SUGGESTION.

### batch_submit_quiz three-step ordered validation is correct and complete (POSITIVE)

Step 1 (fetch session with FOR UPDATE), Step 2 (guard `jsonb_typeof` before extraction), Step 3 (extract question_ids) is the exact fix pattern documented in security.md and decisions.md. The guard fires before the `ARRAY(SELECT jsonb_array_elements_text(...))::uuid[]` extraction that could throw on NULL or non-array config. Ordering is load-bearing and correctly preserved.

### UPDATE quiz_sessions without student_id WHERE clause is safe given FOR UPDATE lock (POSITIVE)

`UPDATE quiz_sessions SET ... WHERE id = p_session_id` does not repeat `AND student_id = v_student_id`. Safe because the session row was locked in Step 1 (FOR UPDATE) after verifying ownership. The lock is held for the duration of the transaction, preventing another session from using the same `p_session_id`. Single-column WHERE is intentional and correct.

### Per-answer text-extract-then-validate-then-cast is correct and complete (POSITIVE, with one gap above)

All three value extractions (`v_qid_text`, `v_selected_option`, `v_rt_text`) follow extract-as-text, validate-format, then cast. UUID cast occurs only after the lowercase-only regex passes. `selected_option` non-empty check prevents silent "no match, graded incorrect" path. Only the unbounded digit regex on `v_rt_text` is a gap (see ISSUE above).

### docs/database.md quiz_sessions deleted_at correction is accurate (POSITIVE)

Schema comment now correctly documents `deleted_at TIMESTAMPTZ NULL` added in migration 023. The batch_submit_quiz RPC (migrations 025 and 027) already filters `AND qs.deleted_at IS NULL` in Step 1, consistent with the updated schema documentation.

---

## Session 2026-03-13 (commit 675104e) — fix: address 8 CodeRabbit PR #74 findings

### answeredCount derivation: currentIndex + 1 is off-by-one at the complete state (ISSUE)
**File:** `apps/web/app/app/_hooks/use-session-state.ts` line 101
**Pattern:** `answeredCount: currentIndex + 1` is computed from the current navigation index.
When the session transitions to `complete`, `handleNext` has just called `onComplete()` without
incrementing `currentIndex`. At that point `currentIndex` still points to the LAST question
(index N-1 for a 10-question quiz), so `answeredCount = N-1+1 = N = questions.length`. For a
full quiz this is correct. However, `handleNext` is the ONLY path to `complete` — there is no
skip/abort path, and the hook does not expose a partial-complete state — so in the current flow
the value is always `questions.length` at the summary screen.
The semantically correct derivation would be to track answers submitted as state, not derive from
the navigation index. Using the index makes the value stale if `handleNext` is ever called after
a failed submission (an error branch early-returns, `currentIndex` does not advance, so if a
retry succeeds it would still report the same index).
The previous code hardcoded `questions.length`, which was identically wrong for the same reason
but was flagged by CodeRabbit. The new value is equivalent in the current flow but wrong in concept.
**Watch for:** any path where `onComplete` succeeds while `currentIndex` is not at the last position
(e.g., admin-triggered session termination, future "finish early" flow that doesn't traverse every question).

### reports.ts answeredCount fallback changed from total_questions to 0 (GOOD)
**File:** `apps/web/lib/queries/reports.ts` line 97
**Change:** `answeredCountMap.get(s.id) ?? s.total_questions` → `answeredCountMap.get(s.id) ?? 0`
**Analysis:** The previous fallback was misleading: a session with no answer rows in
`quiz_session_answers` (e.g., an empty or corrupted session) was reported as having answered
all questions, which would show "0 skipped" and inflate the score display. Falling back to 0
is semantically correct — if there are no answer rows, we don't know how many were answered.
The test name was correctly updated from "falls back to total_questions" to "falls back to 0".
**Positive signal:** test and production code updated atomically in this commit.

### load-draft.ts runtime guard is correct and well-structured (GOOD)
**File:** `apps/web/app/app/quiz/actions/load-draft.ts`
**Change:** `isSessionConfig` type predicate added before the cast from `row.session_config`.
**Analysis:** The guard checks `typeof v === 'object' && v !== null && typeof sessionId === 'string'`,
which exactly matches the `SessionConfig` type definition. The fallback on malformed config returns
a `DraftData` with `sessionId: ''` — the caller can detect this as an invalid draft and reject it.
This is the correct runtime-guard-before-cast pattern documented in `code-style.md` Section 5.

### row.answers cast in load-draft.ts fallback path is still unguarded (SUGGESTION)
**File:** `apps/web/app/app/quiz/actions/load-draft.ts` line 26 and line 38
**Pattern:** Both code paths (fallback and normal) cast `row.answers` to
`Record<string, { selectedOptionId: string; responseTimeMs: number }>` with a plain `as` cast.
`row.answers` is typed as `Json | null` from the DB schema. This is not guarded the way
`session_config` is now guarded. If a draft was saved with a malformed `answers` blob, the cast
succeeds at compile time and the malformed shape reaches callers silently.
**Context:** This is a weaker target than `session_config` (answers are written by Zod-validated
`SaveDraftInput`, so schema drift is unlikely), and the fallback path already handled the main
CodeRabbit finding. Not blocking, but the gap is consistent with the pre-fix `session_config` pattern.

### draft.ts removal of draftId guard is correct (GOOD)
**File:** `apps/web/app/app/quiz/actions/draft.ts` line 64 (guard removed)
**Change:** `if (!input.draftId) return { success: false, error: 'Missing draft ID' }` removed;
`.eq('id', input.draftId as string)` added.
**Analysis:** `updateExistingDraft` is only called when `input.draftId` is truthy (line 45:
`if (input.draftId) return updateExistingDraft(...)`). The guard was redundant — removing it
is correct. The `as string` cast is safe given the call-site invariant.
**Watch for:** any future refactor that adds a second call site to `updateExistingDraft` that does
not have the same `if (input.draftId)` guard upstream.

### lookup.ts DB error logging is consistent across all three query paths (GOOD)
**File:** `apps/web/app/app/quiz/actions/lookup.ts`
**Change:** All three Supabase queries (`questions`, `student_responses`, `fsrs_cards`) now
destructure `error` and log on failure.
**Behavioral note on `unseen` and `incorrect` paths:** These two paths log the error but do NOT
return early — they continue with `answered ?? []` / `incorrectCards ?? []` and return a count.
This means a DB error silently produces a count of 0 (for `unseen`: all questions appear unseen;
for `incorrect`: all questions appear correct). This is the pre-existing behavior — the logging
addition is an improvement, but callers should be aware the returned count is unreliable when
a secondary query fails. The primary `questions` query does return early on error. The asymmetry
is minor and consistent with best-effort filter counts.

### seed-eval.ts .maybeSingle() is correct for lookup-or-insert pattern (GOOD)
**File:** `apps/web/scripts/seed-eval.ts`
**Change:** `.single()` → `.maybeSingle()` on both topic and subtopic lookup queries.
**Analysis:** These queries look up an existing row that MAY OR MAY NOT exist. `.single()` throws
on zero rows; `.maybeSingle()` returns null. The calling code already handles both cases
(`if (alwTopicRow) { use it } else { insert it }`). The `.single()` call was always wrong here —
it would throw on the first run when the row doesn't exist yet. The fix is correct.
**Note:** The upstream `.upsert().select('id').single()` on `easa_subjects` is correct because
the upsert guarantees exactly one row is returned.

---

## Session 2026-03-13 — commit 4798fdb (fix: dedicated answeredCount counter + test coverage)

### Mutable counter without ref guard introduces re-entry window the derivation did not have (ISSUE)

**File:** `apps/web/app/app/_hooks/use-session-state.ts` line 68
**Pattern:** Replacing `answeredCount: currentIndex + 1` (derived, naturally idempotent) with a
dedicated `useState(0)` counter incremented in `handleSubmit` is the correct semantic change.
However, the new counter relies on React state for re-entry protection: `setSubmitting(true)` fires
at line 44, but the re-render that disables the submit button is asynchronous. A second invocation
of `handleSubmit` can enter before the re-render fires, and if both calls succeed, `answeredCount`
is incremented twice for the same question while `currentIndex` advances only once.
The prior derivation was immune to this race because `currentIndex` is a single integer
governed by `handleNext`, not by `handleSubmit`. The new counter is now the writeable state
that must be protected.
**Fix:** Add a `submittingRef = useRef(false)` synchronous guard at the top of `handleSubmit`,
mirroring the `lockedRef` pattern in `use-answer-handler.ts`. The React `submitting` state
remains for UI purposes. The ref provides synchronous re-entry prevention.
**Status:** ISSUE — same class as the lockedRef problem solved in use-answer-handler.

### Watch entry updated — answeredCount derivation risk resolved, re-entry risk added

**High-scrutiny entry update for `use-session-state.ts`:** The prior watch entry noted
`currentIndex + 1` as an off-by-one risk. That derivation is now replaced. The new risk
is the ref-guard gap described above. The watch entry has been updated accordingly.

### Dedicated counter is correct for all normal-path and initial-state cases (GOOD)

The prior derivation returned 1 before any question was submitted (currentIndex 0 → 0+1=1).
The new counter starts at 0, which is semantically correct and fixes the `SessionSummary`
`skippedCount = totalQuestions - answeredCount` display for the initial render.
All normal-path cases (no failures, no concurrent calls) produce the correct count.
The fix is a clear semantic improvement over the derived value.

### No behavioral test for answeredCount increment (SUGGESTION — missing test)

The commit ships no test asserting the counter increments correctly on success and does not
increment on failure. The existing `session-runner.test.tsx` does not assert on `answeredCount`
at all. Two cases worth adding: (1) count is 1 after first successful submit; (2) count stays 0
after a failed submit and becomes 1 after a successful retry — not 2.

---

## Session 2026-03-13 — commit 33c1fa8 (fix: address 4 CodeRabbit PR #74 findings)

### reports.ts answeredCount fallback to total_questions is semantically correct for legacy but masks partial-submission data loss (ISSUE)

**File:** `apps/web/lib/queries/reports.ts` line 97
**Pattern:** The fallback `?? s.total_questions` correctly handles sessions that pre-date the
`quiz_session_answers` table (which has always existed) and the `batch_submit_quiz` RPC. These
sessions were completed via the old per-answer `submit_quiz_answer` RPC which does write answer
rows. The only real case of zero answer rows for a completed session is pre-migration legacy data.
However, the fallback also fires for any future scenario where answer rows are missing for a
completed session — e.g., a race condition, partial DB failure, or data issue. In those cases
the UI will silently show `answeredCount = totalQuestions` (100% answered) when the actual
number is unknown. This is a silent data degradation rather than a visible error.
**Severity at time of review:** SUGGESTION — the fallback is correct for the stated legacy case
and the test validates that path. The risk is that the fallback masks genuine data integrity gaps
in future scenarios. Logging when the fallback fires (zero answer rows for a completed session)
would make those cases visible without changing behavior.

### draft.ts userError handling order is correct — PGRST116 overlap is benign (GOOD)

**File:** `apps/web/app/app/quiz/actions/draft.ts` lines 52-56
**Pattern:** The new `userError` check fires before the `!u?.organization_id` null check. When
Supabase `.single()` finds no row, it returns `error.code === 'PGRST116'` AND `data === null`.
The new error branch fires first with "Failed to look up user". The existing null check on line 56
would also have caught this case (data is null → `!u?.organization_id` is true). The ordering is
correct: hard DB errors (network, permissions) are separated from the business logic case
(user has no organization). Both return `{ success: false }` so there is no behavioral regression.
The distinction matters for observability: PGRST116 (user not in DB) is now logged as an error
rather than silently returning "User organization not found". That is correct triage behavior.

### Migration 027 — removal of v_rt_text::int < 0 is safe (GOOD)

**File:** `packages/db/migrations/027_batch_submit_precast_validation.sql` line 96
**Pattern:** The regex `^\d{1,9}$` already ensures the string contains only digits (no sign
character). A digit-only string cannot represent a negative number, making `::int < 0` unreachable
dead code. The removal does not change runtime behavior and eliminates a misleading dead-code branch.
The regex bound of 9 digits (max 999,999,999) also prevents int4 overflow (max 2,147,483,647).

### database.md soft-delete matrix quiz_sessions correction is accurate (GOOD)

**File:** `docs/database.md` line 391
**Pattern:** The prior "No" entry for quiz_sessions was incorrect — `deleted_at` was added in
migration 023, and `discard.ts` performs a soft-delete update. The correction to "Yes" now
accurately reflects the schema and matches the discard flow. The matrix entry includes the
correct reason and mechanism reference.

### High-scrutiny file list updated

`apps/web/lib/queries/reports.ts` — added to watch list. The answeredCount fallback to
`total_questions` is a silent degradation pattern. Any future changes to this file that add
new fallbacks or change how `answeredCountMap` is built should be reviewed for silent data masking.

---

## Session 2026-03-13 — commit 9257ccb (chore: add shift-left plan validation protocol to workflow)

### Documentation-only commit — no production code changed

**Files changed:** `CLAUDE.md`, `.claude/rules/agent-workflow.md`, three agent memory files.

**Scope of change:** Added a Plan Validation Pipeline section to `agent-workflow.md` (pre-execution checklist: impact analysis, contract check, pattern scan, doc/schema check, security surface) and expanded `CLAUDE.md`'s workflow from 7 steps to 9 steps to insert Validate (step 3) and Approve (step 4) between Plan and Execute.

**Consistency check (CLAUDE.md vs agent-workflow.md):**
- The 5 validation checks in `CLAUDE.md` ("Plan Validation" section) match the 5 rows in the `agent-workflow.md` table exactly. No terminology drift.
- The CLAUDE.md workflow step numbering (step 5 = Execute, step 3 = Validate) is referenced correctly in the Gate sentence: "Do not proceed to step 5 (Execute) until validation is complete."
- The `agent-workflow.md` section heading "Post-Implementation Pipeline Order" correctly contrasts with the new "Plan Validation Pipeline" heading. No ambiguity about which pipeline is which.

**Behavioral gap found — Pre-Push PR Sweep not cross-referenced:**
`agent-workflow.md` contains a "Pre-Push PR Sweep (MANDATORY for multi-commit PRs)" section (lines 105-119) that is not mentioned anywhere in `CLAUDE.md`. The CLAUDE.md Workflow section (lines 137-141) lists only 4 steps (read plan.md, Plan Mode, /project:review, /project:insights), and the Post-commit review section does not reference the PR sweep. A developer reading only `CLAUDE.md` would not know the PR sweep exists. This is a documentation consistency gap — not a security or logic bug. SUGGESTION-level.

**Short-form Workflow section in CLAUDE.md not updated:**
Lines 137-141 of `CLAUDE.md` are a brief 4-step Workflow section ("Start each session: read docs/plan.md", "Plan Mode for any multi-file change", etc.). These 4 steps predate the new 9-step workflow block above them and do not reflect the new Validate and Approve steps. Two workflow descriptions exist in `CLAUDE.md` — the detailed 9-step block (lines 22-32) and the short 4-step block (lines 137-141). They do not contradict each other but the short block is now incomplete. SUGGESTION-level.

---

## Session 2026-03-13 — commit d70c660 (fix: add missing error logging, case-insensitive UUID regex, and doc corrections)

### Changes reviewed

**Files changed:** `apps/web/app/app/quiz/actions/draft.ts`, `apps/web/app/app/quiz/actions/draft.test.ts`, `packages/db/migrations/028_batch_submit_uuid_case_fix.sql`, `supabase/migrations/20260313000028_batch_submit_uuid_case_fix.sql`, `docs/database.md`, two agent memory files.

### docs/database.md response_time_ms guard diverges from migration 028 (SUGGESTION)

**File:** `docs/database.md` line 697
**Pattern:** The `docs/database.md` snapshot of the `batch_submit_quiz` RPC body shows:
`IF v_rt_text IS NULL OR v_rt_text !~ '^\d{1,9}$' OR v_rt_text::int < 0 THEN`
Migration 028 (and migration 027 before it) do NOT include the `OR v_rt_text::int < 0` clause. The semantic-reviewer patterns file (from a prior session) explicitly documents why that clause was removed: the `^\d{1,9}$` regex already excludes any sign character, so `::int < 0` is unreachable dead code. The docs were updated to match the UUID regex change (`!~*`) but the stale `OR v_rt_text::int < 0` clause was not removed from the docs snapshot. The doc no longer reflects the deployed RPC.
**Not a runtime issue** — the deployed function is correct. The gap is docs-only.
**Fix:** Remove `OR v_rt_text::int < 0` from the `docs/database.md` snapshot at line 697.
**Status:** SUGGESTION — docs drift, no behavioral impact.

### draft.ts error logging is consistent across all failure paths (GOOD)

**File:** `apps/web/app/app/quiz/actions/draft.ts`
All four failure modes in `insertNewDraft` now log before returning: count query error (`[saveDraft] Draft count query error:`), insert error (`[saveDraft] Insert error:`). Both the `saveDraft` outer function and `updateExistingDraft` already had logging. The addition makes error visibility consistent across all branches. The log prefix format `[saveDraft]` is used uniformly throughout the file.

### New test correctly covers the count error path (GOOD)

**File:** `apps/web/app/app/quiz/actions/draft.test.ts`
The new `logs error when draft count query fails` test correctly simulates the org-lookup call succeeding (callIndex === 1) and the count query returning an error (callIndex === 2). The mock structure mirrors the production code's DB call sequence. The `consoleSpy` is created before the action call and restored after assertion — correct placement. The assertion checks both the return value and the console.error call message.

### Test comment fix is accurate (GOOD)

**File:** `apps/web/app/app/quiz/actions/draft.test.ts` line 147
The corrected comment (`// First call: users table for orgId; second call: count query returns 20`) now matches the actual call sequence in `saveDraft` (org lookup first, then count query). The original comment had the order reversed.

### Migration 028 UUID regex change is correct and safe (GOOD)

**File:** `packages/db/migrations/028_batch_submit_uuid_case_fix.sql` line 86
The change from `!~` to `!~*` makes the UUID format check case-insensitive. RFC 4122 permits uppercase hex digits in UUIDs. The prior lowercase-only regex would reject valid uppercase UUIDs from non-standard generators. The `lower()` applied in the dedup check (line 72) already handles case normalisation for deduplication — the regex change aligns the per-answer validation guard with the same defense-in-depth approach. No behavioral regression: valid lowercase UUIDs continue to pass; valid uppercase UUIDs now correctly pass instead of being incorrectly rejected.

### response_time_ms regex bound is consistent with migration 027 (GOOD)

**File:** `packages/db/migrations/028_batch_submit_uuid_case_fix.sql` line 92
Migration 028 uses `^\d{1,9}$` (max 999,999,999 ms), consistent with migration 027. The learner memory entry from a prior session recorded the overflow fix as `^\d{1,10}$`, but the semantic-reviewer patterns file from that same session confirms the deployed value was `^\d{1,9}$`. The `\d{1,9}` bound caps at 999,999,999, which is safely below INT4_MAX (2,147,483,647). No regression.

---

## Commit e41807f (2026-03-13) — filteredCount re-fetch on scope change + batch_submit null guards

### filteredCount re-fetch on scope change — RESOLVED (carryover ISSUE from PR-level sweep)
**Issue tracked since:** PR-level sweep (patterns.md section "filteredCount not reset on subject/topic change")
**Fix:** `use-quiz-config.ts` extracts `refetchFilteredCount` helper that sets `filteredCount(null)`
unconditionally, then re-fetches if `sId` is non-empty and filter is non-'all'. All four entry
points (subject, topic, subtopic, filter) share the same helper. Empty-string `sId` (deselect)
triggers the early return after the null-set, correctly clearing filteredCount without a spurious fetch.
**Status:** RESOLVED. Tests added for re-fetch on non-'all' filter + no-fetch on 'all' filter.

### refetchFilteredCount generation counter — shared counter is correct (non-issue)
**Noted in review of commit e41807f (2026-03-13)**
The single `filterGeneration` counter is shared across all four entry points. This is correct:
all four paths update the *same* state slot (`filteredCount`), so "latest call wins" semantics
are exactly what is wanted. This is distinct from the `use-quiz-cascade.ts` bug where independent
slots (topics vs subtopics) share a counter and cause cross-cancellation.
**Watch for:** distinguish "one counter for one slot" (correct) vs "one counter for independent
slots" (cross-cancellation risk, the known bug in use-quiz-cascade.ts).

### batch_submit_quiz migration 030 — IS NULL guard before jsonb_typeof (RESOLVED carryover)
Migration 029 had the `jsonb_typeof` guard but lacked an explicit IS NULL check on the
`question_ids` key. Migration 030 adds the full three-part guard matching migrations 026-028.

### batch_submit_quiz — score counts all session answers (STILL OPEN — pre-existing)
Migration 030 preserves the pre-existing carryover: score query counts ALL rows in
`quiz_session_answers` for the session, not just the current batch. Safe in current UI flow
(no prior answers exist). Remains an open future-hardening item from commit 6120e3f review.

### undici override — defensive range pattern
Changing `">=7.24.0"` to `">=7.24.0 <8"` is the correct pattern for security overrides:
minimum version for the fix, maximum version to stay within a tested major. Apply this to
all future `pnpm.overrides` security entries.

### startTransition async without try/finally — stuck isLoading state
**First seen:** PR-level sweep 2026-03-14
**File:** `apps/web/app/app/quiz/_components/explanation-tab.tsx` (`PreAnswerExplanation`)
**Pattern:** `setIsLoading(true)` is called before `startTransition(async () => { ... })`.
`setIsLoading(false)` is only called inside the callback body — no `finally` block. If the
Server Action throws (any reason: network, uncaught exception), `startTransition` silently
swallows the error, `setIsLoading` is never called, and the component renders the skeleton
permanently.
**Fix pattern:** Always wrap async Server Action calls in `try/finally` inside `startTransition`:
```ts
startTransition(async () => {
  try {
    const result = await someServerAction(...)
    if (!cancelled) { /* update state */ }
  } catch {
    // action threw — handle gracefully
  } finally {
    if (!cancelled) setIsLoading(false)
  }
})
```
**Watch for:** Any `useEffect` or `startTransition` that calls a Server Action and sets loading
state before the call. Check that `setIsLoading(false)` (or equivalent) is in a `finally` block,
not only in the success body.
**Status:** ISSUE — found in PR-level sweep 2026-03-14, pending fix.

### check_quiz_answer vs batch_submit_quiz deleted_at inconsistency
**First seen:** PR-level sweep 2026-03-14
**Files:** `supabase/migrations/20260313000029_check_answer_session_guard.sql` (line 68),
`supabase/migrations/20260314000031_batch_submit_idempotent_softdelete.sql` (line 143)
**Pattern:** Two RPCs called in sequence for the same question have different `deleted_at`
filtering. `check_quiz_answer` requires `q.deleted_at IS NULL`. `batch_submit_quiz` (031)
intentionally removes this filter to allow scoring soft-deleted questions. When a question is
soft-deleted between session start and the student's answer attempt, `checkAnswer` fails with
"question not found", preventing the answer from being recorded. The permissive 031 path never
fires for this question because the answer never reaches the answers Map.
**Fix:** Remove `AND q.deleted_at IS NULL` from `check_quiz_answer` to match the 031 reasoning.
Any question in the session config at session start should be answerable regardless of later
soft-deletion.
**Watch for:** When one RPC is hardened or loosened (e.g., deleted_at filter removed), search
for sibling RPCs that operate on the same resource in the same flow and verify they are
consistently updated.
**Status:** ISSUE — found in PR-level sweep 2026-03-14, pending fix.

---

## Red Team Suite Review — commit f278d5c (2026-03-14)

### complete_quiz_session called with p_answers in test specs (wrong RPC)
**First seen:** commit f278d5c (2026-03-14)
**Files:** `apps/web/e2e/redteam/session-replay.spec.ts` (line ~70),
`apps/web/e2e/redteam/session-race-condition.spec.ts` (lines ~63, ~130)
**Pattern:** Both specs call `attackerClient.rpc('complete_quiz_session', { p_session_id, p_answers })`.
The actual `complete_quiz_session` RPC signature (migration 002) takes only `p_session_id`.
The `p_answers` parameter is the signature of `batch_submit_quiz`, not `complete_quiz_session`.
Postgres silently ignores unknown named parameters — the call succeeds but `p_answers` is
never used. The test is not exercising the code path it believes it is: the answers array
is discarded and completion happens from pre-existing `quiz_session_answers` rows, not from
the submitted answers.
**Impact:** Tests pass but may give false confidence. The session-replay spec's step 4 ("complete
the session") does not test what it documents.
**Watch for:** Any new red-team spec that calls an RPC with parameters not in the generated
types — always cross-reference `packages/db/src/types.ts` before writing spec calls.
**Status:** ISSUE — flagged in f278d5c.

### upsertUser calls listUsers() on every invocation — O(N*users) at scale
**First seen:** commit f278d5c (2026-03-14)
**File:** `apps/web/e2e/redteam/helpers/seed.ts` (line 105)
**Pattern:** `upsertUser()` fetches the full auth user list via `admin.auth.admin.listUsers()`
every time it needs to check if a user exists. With many users in the DB this scans the full
list in memory. Called three times in `seedRedTeamUsers()` (attacker, victim) and once in
`createCrossOrgUser()`. Not a correctness bug — works fine on small DBs — but will slow as the
auth user table grows.
**Alternative:** Use `admin.auth.admin.getUserByEmail(email)` to avoid the full scan.
**Status:** SUGGESTION — flagged in f278d5c. Low priority for test-only code.

### redteam project missing setup dependency in playwright.config.ts
**First seen:** commit f278d5c (2026-03-14)
**File:** `apps/web/playwright.config.ts` (line 32-35)
**Pattern:** The `redteam` project has no `dependencies: ['setup']`, while the regular `e2e`
project correctly declares `dependencies: ['setup']`. The `setup` project runs `auth.setup.ts`
which creates the base authenticated state. Red team specs do their own seeding but they may
run before base seeding completes if the runner decides to parallelize. In practice the
`redteam` project does its own seeding in `beforeAll`, so the omission is likely intentional —
but it should be documented in a comment to avoid future confusion.
**Status:** SUGGESTION — flagged in f278d5c.

### rpc-question-membership spec selects topic_id from subjects table (nonexistent column)
**First seen:** commit f278d5c (2026-03-14)
**File:** `apps/web/e2e/redteam/rpc-question-membership.spec.ts` (line 37)
**Pattern:** The spec queries `.from('subjects').select('id, name, topic_id')`. The `subjects`
table in the Supabase schema is actually `easa_subjects` (see generated types and migrations).
`easa_subjects` has columns: `code`, `id`, `name`, `short`, `sort_order` — no `topic_id`.
The topics-to-subjects relationship goes through `easa_topics.subject_id`, not the reverse.
Since this entire test is inside `test.fixme()`, the bad column reference is dormant — it will
cause a Supabase error when the fixme is removed. This must be corrected before unfixme-ing.
**Watch for:** Any spec querying `.from('subjects')` — verify the actual table name and columns
against `packages/db/src/types.ts` before writing the SELECT clause.
**Status:** ISSUE — flagged in f278d5c. Dormant under test.fixme but will break on activation.

### CI workflow uses ANON_KEY from supabase status env without API_URL for SUPABASE_URL
**First seen:** commit f278d5c (2026-03-14)
**File:** `.github/workflows/redteam.yml` (line 58)
**Pattern:** The redteam CI step exports:
  `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321` (hardcoded)
The existing e2e.yml uses:
  `NEXT_PUBLIC_SUPABASE_URL=${API_URL}` (from `supabase status -o env`)
The redteam workflow hardcodes port 54321 rather than reading `API_URL` from `supabase status`.
If Supabase's default port is ever changed (e.g., conflict), the redteam workflow breaks while
e2e continues working. Minor inconsistency but worth aligning.
**Status:** SUGGESTION — flagged in f278d5c.

### quiz-draft-injection cleanup uses hard DELETE via admin client
**First seen:** commit f278d5c (2026-03-14)
**File:** `apps/web/e2e/redteam/quiz-draft-injection.spec.ts` (line ~135)
**Pattern:** After the injected-draft test inserts a draft for cleanup purposes, it calls:
`adminClient.from('quiz_drafts').delete().eq('id', draftId)`
This is a hard DELETE, which is the same operation the test is checking RLS prevents for
regular students. In test/seed code the rule is typically relaxed, but the project's
`docs/security.md` only exempts hard deletes for immutable tables (audit_events, etc.).
`quiz_drafts` is a mutable table and should use soft-delete (`deleted_at`) consistently.
**Note:** All other admin cleanup in the codebase uses soft-delete patterns on mutable tables.
This breaks the project pattern even if functionally harmless in test code.
**Status:** SUGGESTION — flagged in f278d5c. Consistent application of soft-delete even in tests.

---

## PR-level review — fix/pr3-test-coverage (2026-03-14) — commit a1335ff

### migration 033 uses weaker null guard than migration 030 established as the hardened pattern
**Files:** `supabase/migrations/20260314000033_submit_answer_membership_check.sql` line 56
**Pattern:** Migration 030 (`batch_submit_null_guards.sql`) explicitly hardened the guard to
`v_config IS NULL OR v_config->'question_ids' IS NULL OR jsonb_typeof(...)`. The comment in
that migration explains why: "handles SQL NULL vs missing key". Migration 033 reverts to the
two-condition form (`v_config IS NULL OR jsonb_typeof(v_config->'question_ids') <> 'array'`),
which the codebase deliberately upgraded away from. The `v_config->'question_ids' IS NULL`
middle check guards the case where `v_config` is a non-null JSONB object but the key is absent
(operator returns SQL NULL, which makes `jsonb_typeof(NULL)` return NULL, which `<> 'array'`
evaluates to NULL — falsy in PL/pgSQL IF conditions). This means a session with `config = '{}'`
(no question_ids key) could slip past the guard before raising.
**Severity:** ISSUE — the pattern was deliberately hardened; 033 regresses it.
**Fix:** Add the middle guard: `v_config IS NULL OR v_config->'question_ids' IS NULL OR jsonb_typeof(v_config->'question_ids') <> 'array'`

### rate-limiting spec sets a non-existent `status` column on quiz_sessions
**Files:** `apps/web/e2e/redteam/rate-limiting.spec.ts` line 119
**Pattern:** The cleanup block at the end of the observation test runs:
`admin.from('quiz_sessions').update({ status: 'discarded', deleted_at: ... })`
`quiz_sessions` has no `status` column — the table DDL (migration 001) defines only
`id, organization_id, student_id, mode, subject_id, topic_id, config, started_at, ended_at,
total_questions, correct_count, score_percentage, created_at, deleted_at`.
The UPDATE will silently be rejected by PostgREST (schema mismatch), meaning the 50 test
sessions created by the observation test are never cleaned up.
**Severity:** ISSUE — sessions accumulate in the DB on every test run; the cleanup the spec
comments about never happens. The `deleted_at` half of the update also silently fails because
the whole UPDATE is rejected when any column is unknown.
**Fix:** Remove `status: 'discarded'` from the update; only set `deleted_at`.

### audit-event-forgery spec inserts without required NOT NULL columns — false positive
**Files:** `apps/web/e2e/redteam/audit-event-forgery.spec.ts` lines 40-44, 54-60
**Pattern:** The `audit_events` INSERT attack omits required NOT NULL columns: `organization_id`,
`actor_role`, `resource_type`. The `audit_events` table schema requires all three as NOT NULL.
The inserts will fail with a DB constraint violation, not an RLS rejection. This means the test
passes (error !== null) even if the Vector F RLS fix (`WITH CHECK (false)`) were never applied.
The test cannot distinguish between "RLS blocked it" and "schema constraint rejected it".
After migration 034, the RLS policy does block these inserts, but the test gives no confidence
that the constraint *vs* policy ordering is correct, and would pass even if migration 034 were
rolled back.
**Severity:** SUGGESTION — the test intent is correct but the attack vector is incomplete.
**Fix:** Either (a) include all required columns so the only rejection reason is RLS, or
(b) add a comment explaining that the constraint error is the expected early-exit and that
the RLS policy provides defense-in-depth regardless.

### PR contains an "observation test" that asserts absence of a security control
**Files:** `apps/web/e2e/redteam/rate-limiting.spec.ts` lines 85-122
**Pattern:** The test named "observation: all 50 rapid-fire RPC calls succeed (no rate limiting)"
asserts `expect(successes).toBe(50)` — it passes only when rate limiting is absent. This means
the test will fail the moment rate limiting is added without human intervention to remove/update it.
More importantly, it documents a known gap (Vector K) without a tracking issue or GitHub Issue
reference. The `test.skip` on the actual assertion and the observation test as a pair are a
reasonable design, but the documentation of the gap exists only in the spec file comment, not
in the issue tracker.
**Severity:** SUGGESTION — the design is acceptable; the gap should be tracked in GitHub Issues
for visibility. The observation test assertion (expect 50 successes) will also fail if Supabase's
built-in connection pooler applies back-pressure under load, making the test flaky in CI.

### PR-level cross-file consistency: migration 033 doc note references wrong migration numbering
**Files:** `docs/database.md` line ~525, `docs/security.md` (updated in ce63876)
**Pattern:** `docs/database.md` line ~525 notes "Validates p_question_id is in the session's
config.question_ids (migration 033)". The migration file is named
`20260314000033_submit_answer_membership_check.sql`. The short number reference is fine but
`docs/security.md` was also updated in this PR without a corresponding note about Vector A
being the membership check fix. The security.md update added the red-team testing section but
did not update the "Correct Answer Stripping" section to mention that session membership is
now enforced at the RPC level in migration 033.
**Severity:** SUGGESTION — minor doc gap; security.md Section 4 would benefit from a note that
`submit_quiz_answer` now validates session membership in addition to stripping answers.

### GOOD: audit_events Vector F fix is correctly scoped
The `WITH CHECK (false)` policy on `audit_events` INSERT is the correct, minimal approach.
SECURITY DEFINER RPCs bypass RLS by design, so the fix correctly blocks all direct client
inserts while leaving RPC-level inserts (start_quiz_session, complete_quiz_session) intact.
The migration comment explains the bypass mechanism clearly.

### GOOD: migration 033 membership check is consistent with check_quiz_answer (migration 032)
The comment in migration 033 correctly cites that the pattern matches check_quiz_answer.
Both RPCs fetch `v_config`, guard against malformed config, extract `question_ids`, and reject
unknown questions. The error messages are consistent ("question does not belong to this session").

### GOOD: redteam project isolation in playwright.config.ts
The `testIgnore: '**/redteam/**'` on the e2e project and the separate `redteam` project with
`testDir: './e2e/redteam'` is the correct pattern. Red-team specs are isolated from the main
E2E suite and require separate explicit invocation.

### GOOD: seed.ts uses listUsers() + upsert pattern for idempotency
`seedRedTeamUsers()` checks `auth.admin.listUsers()` before creating users, making the seed
fully idempotent. Repeated test runs don't accumulate duplicate users. The public.users row
is also checked independently, guarding against half-created state.
**Status:** Positive pattern — log and reinforce.

---

## PR #9 Learnings (2026-03-15)

### Suspense refactor silently drops a badge / count feature (1st occurrence)
**First seen:** PR #9 — commits bc5984e + quiz/page.tsx
**Pattern:** When a `Promise.all([fetchA(), fetchB()])` is split into separate Suspense-wrapped
async server components for streaming, any derived value that was computed from the combined
result (e.g., `drafts.length` for a badge count) is silently lost. Each Suspense slot is
self-contained and cannot pass data back up to the parent page (which is now synchronous).
The type change (`draftCount: number` → `draftCount?: number | null`) makes this compile
without error, and the default-to-null means no crash — the badge just disappears silently.
**Watch for:** Any Suspense refactor that changes a page from `async` to sync and splits
`Promise.all` — enumerate every derived value that was computed from the combined result set
and verify each one still reaches its consumer.
**Status:** ISSUE — flagged in PR #9. Fix required before merge.

### SELECT all rows vs COUNT for aggregation: unbounded payload risk (1st occurrence)
**First seen:** PR #9 — apps/web/lib/queries/question-stats.ts
**Pattern:** Replacing `COUNT(*)` with `head: true` (zero data transfer) with a full row
fetch + JS `.filter()` is a correct functional change but introduces an unbounded payload.
For a student with 500+ responses to the same question, this transfers 500 rows where before
it transferred 0. The JS aggregation is simple and correct, but the data volume scales with
user activity and history.
**Rule:** When replacing COUNT queries with row-fetch aggregation, always add a `.limit(N)`
where N is a documented ceiling (e.g., `MAX_RESPONSE_HISTORY = 500`). Document why with a
comment. The limit should be defensively large but finite.
**Watch for:** Any migration from `select('*', { count: 'exact', head: true })` to
`select('field1, field2')` with JS aggregation — check if a LIMIT is present.
**Status:** ISSUE — flagged in PR #9. Fix required before merge.

### Supabase .single() error shape: { data: null, error: { code: 'PGRST116' } } not { data: null, error: null }
**First seen:** PR #9 — apps/web/e2e/helpers/supabase.test.ts
**Pattern:** When mocking Supabase `.single()` for the "no row found" case, the correct
mock shape is `{ data: null, error: { message: '...', code: 'PGRST116' } }`. Mocking as
`{ data: null, error: null }` is inaccurate: real Supabase returns a non-null error for
`.single()` with 0 results. Tests that use `{ data: null, error: null }` to represent
"not found" are testing a code path that will never actually be reached in production.
**Fix pattern:** Always use `{ data: null, error: { message: 'no rows found', code: 'PGRST116' } }`
for `.single()` no-row mocks.
**Watch for:** Any test mock for `.single()` that uses `{ data: null, error: null }` to mean "not found".
**Status:** GOOD — PR #9 correctly fixed these mocks. Log as a pattern to check in future test reviews.

### GOOD: explanation data moved from client-fetch to RPC prop — clean elimination of useEffect
**First seen:** PR #9 — explanation-tab.tsx refactor (#75)
**Pattern:** `ExplanationTab` previously used `useEffect` + `fetchExplanation` Server Action
to load explanation data after mount (one extra round-trip per question navigation). The refactor
moves `explanation_text` and `explanation_image_url` into `get_quiz_questions()` RPC return, so
the data arrives with the questions at session start. The component becomes a pure render function
with props. This is the correct direction: RSC/RPC fetches data, client components render it.
No security concern: explanation fields contain no `correct` markers.
**Positive pattern to reinforce:** When a `useEffect`-based fetch pattern is found in a client
component, the correct fix is to move the data into the upstream RPC/Server Component, not to
refactor the fetch mechanism.

### profileError silently masking as "Forbidden" in auth helpers (2nd occurrence of DB-error-masking)
**First seen:** commit 6b49021 / PR #10 (2026-03-15) — requireAdmin()
**File:** `apps/web/lib/auth/require-admin.ts`
**Pattern:** The function logs `profileError` but then falls through to the role-guard check.
When `profileError` is non-null, `profile` is null, so `profile?.role !== 'admin'` is true and
the function throws "Forbidden: admin role required". A DB connectivity failure presents to the
caller — and to logs — as a legitimate access-denied, not as a service error. The admin user is
denied with no signal that it was a transient failure.
**Fix pattern:**
```ts
if (profileError) {
  console.error('[requireAdmin] Profile query error:', profileError.message)
  throw new Error('Service error: could not verify admin role')
}
```
**Related:** The Supabase-query-error-silently-swallowed pattern (first occurrence above) is the
same root cause — only destructuring `{ data }` and ignoring `{ error }`. Second occurrence
confirms this is a recurring pattern across auth helpers.
**Watch for:** Any auth helper that makes a secondary DB lookup after the initial `getUser()`.
Always ensure `error` is checked with an early return/throw, not merely logged before the guard.
**Status:** ISSUE — flagged in PR #10 sweep.

### hard DELETE in admin Server Actions violates soft-delete rule (1st occurrence in admin context)
**First seen:** PR #10 (2026-03-15)
**File:** `apps/web/app/app/admin/syllabus/actions/delete-item.ts`
**Pattern:** The `deleteItem` Server Action issues a literal `DELETE` against EASA syllabus tables.
The feature was built this way because the three tables do not have `deleted_at` columns. However,
the absence of a `deleted_at` column is itself the violation — the column should have been added in
the migration (031) that added write access to these tables.
**Root cause:** The migration added RLS policies for admin INSERT/UPDATE/DELETE but did not add
soft-delete infrastructure, and the Server Action author did not check the soft-delete rule.
**Pattern to flag:** Any new table receiving DELETE RLS policies that lacks `deleted_at TIMESTAMPTZ NULL`.
**Fix requires two steps:**
1. New migration adding `deleted_at` to `easa_subjects`, `easa_topics`, `easa_subtopics`
2. Update `deleteItem` to `UPDATE SET deleted_at = now()`
3. Update `getSyllabusTree` queries to filter `.is('deleted_at', null)`
**Status:** ISSUE — flagged in PR #10 sweep, must fix before push.

### sort_order schema requires field that insert path recomputes server-side (1st occurrence)
**First seen:** PR #10 (2026-03-15)
**Files:** `packages/db/src/schema.ts`, `apps/web/app/app/admin/syllabus/actions/upsert-*.ts`,
           `apps/web/app/app/admin/syllabus/_components/subject-row.tsx`
**Pattern:** `UpsertSubjectSchema` (and Topic/Subtopic variants) require `sort_order: z.number().int().min(0)`.
On the insert path, the Server Action overwrites the client-supplied value with a server-computed MAX+1.
On the update path, the client-supplied value is used directly (preserved from the existing row).
This creates an ambiguous contract: `sort_order` is required by the schema but meaningless on insert.
The client components compute their own `sortOrder` values (from local state) before calling insert,
even though the server will discard them.
**This is not a bug today** (single-admin, server always recomputes), but the schema makes the
insert path's behavior non-obvious to future readers.
**Fix:** Either make `sort_order` optional in the Zod schema (insert path ignores it) or document
clearly in the action that it is intentionally overridden on insert.
**Status:** SUGGESTION — logged for pattern awareness.

---

## Session 2026-03-16 — commit 8eeeff9 (docs: soften last_was_correct wording to best-effort)

### Commit: 8eeeff9 — STATUS: CLEAN
- Files changed: 1 (docs/database.md only)
- Nature: Documentation-only wording correction. No code, no migrations, no tests.

**Summary:** Two wording instances in `docs/database.md` changed "always accurate" to "best-effort
tracking" for `fsrs_cards.last_was_correct`. The change is technically correct: the upsert is
atomic within the transaction but the column is a tracking convenience, not a strict guaranteed-correct
invariant (ON CONFLICT DO NOTHING on quiz_session_answers means retries skip re-inserting the answer
but still re-upsert last_was_correct — harmless but confirms best-effort nature).

**SUGGESTION — docs/decisions.md:417 inconsistency (non-blocking):**
`docs/decisions.md` line 417 still reads "fully atomic in migration 040" without the new "best-effort"
qualifier. The phrase "fully atomic" describes the transactional scope (still true) but the overall
tone does not reflect the softened guarantee introduced in this commit. No reader will be misled about
security or correctness, but the two docs use different framings for the same column. Fix when
decisions.md is next touched.

**POSITIVE — both instances updated consistently:**
The wording change was applied to both the prose key-behavior list (line 650) and the inline SQL
comment block (lines 827-828). Partial updates — changing prose but leaving the SQL comment, or vice
versa — would leave stale inline documentation. Both were updated. Correct scope.

**No issues found in this commit.**

---

## Session: commit 559bf9e — chore: migrate zod 3 to 4 (2026-03-16)

### Zod 4 UUID tightening breaks test fixtures that use non-RFC-4122 UUIDs (1st occurrence)
**File:** Multiple test files (unit tests only — NOT production code)
**Pattern:** Zod 3 accepted any 8-4-4-4-12 hex string as a "UUID". Zod 4 enforces RFC 4122
compliance: the version nibble (position 13) must be 1-5 (or all-zeros nil UUID), and the
variant bits (position 17) must be 8-b for RFC variant (or nil). The old test fixture pattern
`00000000-0000-0000-0000-000000000001` has version nibble = 0 and is NOT a valid RFC 4122 UUID.
The migration correctly updated all test fixtures to `00000000-0000-4000-a000-000000000NNN`
(version=4, variant=a). This was a thorough sweep.
**Risk if missed:** Any fixture still using the old pattern that flows through a Zod schema with
`.uuid()` will cause the test to fail with "Invalid UUID" rather than exercising the intended path.
**Watch for:** In future test additions, always use v4-format UUIDs: `00000000-0000-4000-a000-000000000NNN`.
**Status:** RESOLVED — all unit test fixtures updated correctly in this commit.

### Redteam E2E tests retain old-format UUIDs — safe because they bypass Zod (1st observation)
**Files:** `apps/web/e2e/redteam/quiz-draft-injection.spec.ts`,
           `apps/web/e2e/redteam/server-action-unauthenticated.spec.ts`,
           `apps/web/e2e/redteam/pkce-state.spec.ts`
**Pattern:** These specs use `00000000-0000-0000-0000-00000000000X` as sentinel/fallback values.
They were NOT updated in this commit. This is correct: these values are passed directly to
Supabase RPCs or as URL parameters, bypassing Server Action Zod validation entirely. They are
safe because: (a) the real test paths resolve live IDs from the DB first; (b) the fallback
UUIDs are for "no real data found" branches where the DB will simply return empty results; and
(c) none flow through the Server Action validation layer.
**Watch for:** If a future change routes E2E test inputs through Server Actions that validate
with Zod, these fallback sentinels will silently fail UUID validation.

### ZodError.errors removed in Zod 4 — migration required .issues instead (confirmed pattern)
**Pattern:** Zod 4 removed the `.errors` alias on ZodError (it was a deprecated alias for `.issues`
in Zod 3). The migration correctly replaced `err.errors[0]?.message` with `err.issues[0]?.message`
in both production files that used it: `start.ts` and `draft.ts`. A grep confirmed no `.errors[`
accessor remains in any production file. The test assertions for error messages were also updated
to reflect the changed Zod 4 error message wording (e.g., "Invalid uuid" → "Invalid UUID",
"Required" → "Invalid input: expected string, received undefined").
**Watch for:** Any new ZodError handling that accidentally uses `.errors` — it will be `undefined`
at runtime in Zod 4 and the fallback message will always be returned, masking the real error.
**Rule:** In Zod 4, always use `.issues[0]?.message` not `.errors[0]?.message`.

### z.ZodIssueCode.custom still works in Zod 4 (positive signal)
**Pattern:** The `draft.ts` `superRefine` uses `z.ZodIssueCode.custom` for custom issue codes.
This API was preserved in Zod 4 — no change required. The `.superRefine()` API also works
identically.

### zod-to-json-schema 3.25.1 is compatible with Zod 4 (positive signal)
**Pattern:** `zod-to-json-schema@3.25.1` declares `peerDependencies: { "zod": "^3.25 || ^4" }`.
The pnpm-lock shows the `zod@4.3.6` variant is installed. Verified at runtime: zod-to-json-schema
generates JSON schema from Zod 4 schemas without error.

### Turbo type-check cache risk applies here too (watch item)
**Pattern:** Recorded in previous session — always run `pnpm check-types --force` after a dep
bump to bypass the turbo cache. This applies to this Zod 3→4 migration.

---

## Session: commit a9930ac — chore: migrate Biome 1 to 2 (2026-03-16)

### Migration is a clean tool-config-only change (positive signal)
**Summary:** Biome 1.9.4 → 2.4.7. Changes are: `files.ignore[]` → `files.includes[]` with negation
prefixes, `files.overrides[].include[]` → `.includes[]` with glob prefixes, `noVar` moved from
`style` to `suspicious` group, CSS parser config added for Tailwind directives. The migration
produced zero lint errors and zero warnings (`biome lint` exits clean). No production logic changed.

### Import/export sort reordering — no behavioral effect (positive signal)
**Pattern:** 30+ files had import order changed (third-party before path-aliased, `type` imports
interleaved). Named ES module exports in `card.tsx`, `collapsible.tsx`, `progress.tsx` reordered
alphabetically. None of these changes affect runtime behavior — named imports are order-independent
and named exports are resolved by name not position.

### biome-ignore suppressions introduced — all valid (positive signal)
Three new `biome-ignore` comments added for rules that Biome 2 now checks:
1. `lint/performance/noImgElement` × 3 (zoomable-image.tsx × 2, explanation-tab.test.tsx × 1) —
   raw `<img>` is intentional here because Next.js Image requires known dimensions. Valid.
2. `lint/a11y/noStaticElementInteractions` × 1 (finish-quiz-dialog.tsx) — backdrop `<div>` with
   click-outside dismiss. The suppression is accurate; the `<dialog>` child is the semantic element.

### Spurious suppression removed from seed.ts (positive signal)
`// biome-ignore lint/suspicious/noExplicitAny: admin client from getAdminClient()` was removed.
The parameter type was already `ReturnType<typeof getAdminClient>` — no `any` present. The comment
was incorrect from the start and Biome 2 no longer accepts suppressions that don't match an actual
violation. Correct removal.

### forEach → for...of in use-answer-handler.test.ts (positive signal, no behavior change)
Biome 2's `noForEach` rule prefers `for...of` over `.forEach()`. The replacement in the test mock
(`next.forEach((v, k) => answers.set(k, v))` → `for (const [k, v] of next) answers.set(k, v)`)
preserves identical semantics. Note: the original destructured `(v, k)` — value first, key second —
which is the correct Map.forEach signature. The `for...of` version destructures `[k, v]` from
entries — also correct. No logic change.

### CSS value normalisation in globals.css — no visual change (positive signal)
`oklch(1.0 0 0)` → `oklch(1 0 0)` and `hsl(... / 0.0)` → `hsl(... / 0)`. These are identical
CSS values. Biome's CSS formatter normalised trailing zeros.

### Backdrop Escape key handler unreachable (minor observation, not an issue)
**File:** `apps/web/app/app/quiz/_components/finish-quiz-dialog.tsx`
The backdrop `<div>` has `onKeyDown` that handles Escape. However, the inner `<dialog>` has
`onKeyDown={(e) => e.stopPropagation()}` which blocks all keyboard events from bubbling to the
backdrop. The Escape handler on the backdrop is therefore unreachable in normal usage since focus
always sits inside the `<dialog>`. This is a dead code path but not a security or data issue.
The `<dialog>` element itself does not natively handle Escape for `open` (non-modal) usage, so
Escape dismiss only works if focus is on a focusable element inside the dialog that doesn't have
stopPropagation. Not flagged as an ISSUE — the dialog is dismissible by Return to Quiz / click
outside, and this is a UX edge case not a correctness bug.

---

## Session: 2026-03-16 — commit d743cb8 (chore: migrate lefthook 1 to 2)

### Lefthook v1→v2 major bump — config syntax validated (positive signal)
**Files changed:** `package.json`, `pnpm-lock.yaml`
**Pattern:** This is a pure version bump: `lefthook ^1.10.0 → ^2.1.4` (resolved 1.13.6 → 2.1.4).
No changes to `lefthook.yml`, `.claude/hooks/`, or any hook scripts.
`npx lefthook validate` reports "All good" under v2, confirming no breaking YAML syntax changes
for this config (parallel, commands, glob, run, stage_fixed keys all remain valid in v2).
The QA pipeline gates (pre-commit biome + type-check + test, commit-msg commitlint, pre-push
security-auditor + audit) are all intact and firing.
**Watch for:** If lefthook ever jumps to v3+, re-validate the config immediately — the v1→v2
jump had no breaking changes for this config, but that is not guaranteed for future majors.
**Status:** GOOD — no findings. Version bump is safe.

---

## Session: 2026-03-17 — commit 7fe8eb69 (fix: N+1 batch_submit_quiz bulk-fetch + missing indexes)

### PL/pgSQL CREATE TEMP TABLE without preceding DROP IF EXISTS — not idempotent under connection reuse (1st occurrence)
**First seen:** commit 7fe8eb69 (2026-03-17) — migration 041
**File:** `supabase/migrations/20260317000041_batch_submit_bulk_fetch.sql`
**Pattern:** `CREATE TEMP TABLE _batch_questions ON COMMIT DROP AS SELECT ...` is created
inside a SECURITY DEFINER function without a preceding `DROP TABLE IF EXISTS _batch_questions`.
Under Supabase's default transaction-mode pooling, each DB transaction gets a separate session,
so ON COMMIT DROP is sufficient. However, under session-mode pooling (or when callers wrap
multiple RPC calls in an explicit transaction), two invocations can share a session. The second
call hits `ERROR: relation "_batch_questions" already exists` because the first call's ON COMMIT
DROP has not yet fired (the first transaction is still open when the second starts).
**Fix:** Add `DROP TABLE IF EXISTS _batch_questions;` immediately before the CREATE TEMP TABLE
statement. This is idempotent: if no prior run's table exists, the DROP is a no-op; if a
prior run left the table (exception path, session reuse), the DROP cleans it up before re-creation.
**Watch for:** Any PL/pgSQL function that contains `CREATE TEMP TABLE` without an immediately
preceding `DROP ... IF EXISTS`. The pattern is valid only when the function can guarantee a
single invocation per session, which is not possible for SECURITY DEFINER RPCs callable by
any authenticated user.
**Status:** ISSUE — flagged in 7fe8eb69, must fix before merge.

### Nullable FK column indexed without partial WHERE clause — inconsistent with project partial-index pattern (1st occurrence)
**First seen:** commit 7fe8eb69 (2026-03-17) — migration 042
**File:** `supabase/migrations/20260317000042_add_missing_indexes.sql`
**Pattern:** `idx_quiz_sessions_subject` is created as a full index on `quiz_sessions(subject_id)`
even though `subject_id` is declared `UUID ... NULL` in the schema. Every other nullable-FK
index in the project uses `WHERE <column> IS NOT NULL` (initial schema: idx_questions_subject,
idx_questions_topic, idx_questions_bank; migration 042 itself: idx_questions_subtopic,
idx_users_org, idx_courses_org). The full index includes null rows, which have no selectivity
for join queries. A partial index `WHERE subject_id IS NOT NULL` would be smaller and consistent
with the project pattern.
**Watch for:** Any new `CREATE INDEX` on a nullable column that does not carry
`WHERE <col> IS NOT NULL`. Compare against the project's established index naming and partial
index conventions before committing.
**Status:** SUGGESTION — query correctness is not affected, only index efficiency and consistency.

### /auth/* pages not in proxy matcher — client-side session defence only (1st occurrence)
**First seen:** commit 47df5cf (2026-03-17) — reset-password page review
**File:** `apps/web/app/auth/reset-password/page.tsx`, `apps/web/proxy.ts`
**Pattern:** The proxy matcher covers only `'/'` and `'/app/:path*'`. Auth sub-pages
(`/auth/reset-password`, `/auth/forgot-password`, `/auth/callback`) are not in the matcher.
`/auth/reset-password` renders a client component that calls `supabase.auth.updateUser()`;
Supabase rejects the call if no session exists, so there is no security hole. But the
user sees the form before the rejection, and the guard is implicit rather than explicit.
A server-side redirect from the page component or an expanded proxy matcher would make
the session requirement visible and consistent with the `/app/*` pattern.
**Watch for:** Any new `/auth/*` page whose functionality requires a valid session should
either add a server-side `getUser()` check in the page or expand the proxy matcher.
**Status:** SUGGESTION — 1st occurrence, not a security gap. Watch for repeat pattern.

---

### 2026-03-28 — commit d99a13b (test(gdpr): boost collect-user-data coverage with error and null-data tests)
- **Files reviewed:** `apps/web/lib/gdpr/collect-user-data.test.ts`, `.claude/agent-memory/learner/patterns.md`, `.claude/agent-memory/red-team/attack-surface.md`
- **CRITICAL:** 0 | **ISSUE:** 0 | **SUGGESTION:** 2 | **GOOD:** 4

**Suggestion 1 — `collect-user-data.test.ts` line 364 — null-data test does not exercise `quiz_answers ?? []` fallback**
`buildSupabaseClientWithNulls` sets `quiz_sessions.data = null`. Production code at line 91 derives `sessionIds` as `(sessionsResult.data ?? []).map(...)` — with null data this gives `[]`, so the phase-2 `quiz_session_answers` query is short-circuited entirely (`sessionIds.length > 0` is false). The `answersResult` is set to `{ data: [] as never[] }` (line 101), not via a Supabase call. The `??` fallback at line 114 (`answersResult.data ?? []`) is never triggered because `data` is already `[]` from the short-circuit path. The test asserts `result.quiz_answers.toEqual([])` — passes — but does NOT cover the production path where the phase-2 query fires, returns `data: null`, and falls back to `[]`. To exercise that branch, a null-data test for `quiz_answers` would need `quiz_sessions.data = [MOCK_SESSION]` (non-null, non-empty) and `quiz_session_answers.data = null`. Non-blocking — the existing tests pass and the fallback is still covered incidentally by `buildSupabaseClientWithErrors` (where `answers.data = []` from the mock). But the null-data test's stated goal of covering `?? []` fallbacks does not fully deliver on `quiz_answers`.

**Suggestion 2 — `buildSupabaseClientWithErrors` mock diverges from real Supabase error shape**
When a Supabase query errors, the real client returns `{ data: null, error: <PostgrestError> }`. `buildSupabaseClientWithErrors` returns `{ data: [], error: errors.sessionsError }` for erroring tables — `data` is `[]`, not `null`. The production `?? []` fallback at line 113 is therefore not exercised for the error path (the fallback fires on `null`, not `[]`). Both paths produce the same output (`[]`), so tests pass. But the mock inaccuracy means the test does not actually verify that the `?? []` guard handles `null` data on an error response — it only verifies the empty-array-pass-through. This is a low-severity gap: all 14 tests pass, and the null case IS exercised by `buildSupabaseClientWithNulls`. But a future developer adding a table to the error-path test might not realize the mock shape is wrong. Non-blocking.

**Good 1 — `quiz_session_answers` error path is correctly separated into its own test**
The phase-2 answers query has a distinct code path (not in the `queryResults` loop at lines 75-88, but in a separate `if` block at lines 103-108). The test at line 347 correctly targets this path with its own dedicated `answersError` injection. If the two paths were merged into a single test, a regression in one would mask the other. Clean test isolation.

**Good 2 — `consoleSpy.mockRestore()` called correctly in every test that spies on console.error**
Both error-logging tests (lines 324 and 347) call `consoleSpy.mockRestore()` at the end — not just `mockClear()`. `mockRestore()` removes the spy entirely, preventing console suppression from leaking into subsequent tests. Correct cleanup pattern.

**Good 3 — agent memory updates are accurate and consistent with the code**
The learner patterns.md update correctly increments the "utility without test" counter to 7, documents the false positive (quiz_sessions deleted_at), and adds the new RLS SELECT policy gap pattern. All three entries are accurate against the actual commits. The red-team attack-surface.md correctly identifies Vector AA (cross-user SELECT after the new RLS policy) as a gap and correctly assesses Vector AB as low risk (admin-authored events don't reach students via the new policy). The security analysis of the OR-combination of `audit_read_own` and `audit_read_instructors` is correct — additive, not conflicting.

**Good 4 — `beforeEach(() => { vi.resetAllMocks() })` applies to the new tests**
The global `beforeEach` at line 193 covers all new `describe` blocks added in this commit. The new tests do not need their own `beforeEach`. The `consoleSpy` is created and restored within each test — correct pattern. No mock state can leak between tests.

**No new security patterns found. No production code changed.**
