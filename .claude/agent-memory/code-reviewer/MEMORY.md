# Code Reviewer — Memory

> Native subagent memory index. Tracker first, durable knowledge second, topic pointers last.
> Update rows/bullets IN PLACE. No session logs — git holds history (`git log -p`).

## Recurring Issues Tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---------|-----------|-------|-----------|---------------------|
| Function > 30 lines in Server Action | 2026-03-20 (d93f924) | 2 | 2026-03-20 (6520962) | PROMOTED → code-style.md §3 (getFilteredCount 58L; toggleFlag 52L — both 2-branch toggle/conditional shape, fixed by extracting named helpers) |
| New hook/utility file shipped without co-located test | 2026-03-21 (8771aa2) | 4 | 2026-03-23 (b104ae4) | PROMOTED → code-style.md §7 (use-comments.ts, use-flagged-questions.ts, score-color.ts, reports-utils.ts) |
| Hook file > 80-line limit | 2026-03-21 (8771aa2) | 4 | 2026-04-27 (c656868) | PROMOTED → code-style.md §1 (use-comments 84L; use-quiz-config 110L; use-quiz-state 121L; use-session-bootstrap 99L). Fix = extract orchestration/derivation helper |
| React component > 150-line limit | 2026-03-21 (8771aa2) | 4 | 2026-04-13 (exam PR2) | PROMOTED → code-style.md §1 (comments-tab 155L; finish-quiz-dialog 243L; quiz-session 176/204L; quiz-controls 152L). Fix = extract sub-component/helper component |
| Feature modes (study/exam, draft/live) conditionally wired into one hook/component | 2026-04-13 (exam PR2) | 2 | 2026-04-26 (34194aa) | RULE CANDIDATE — extract mode-specific logic to its own hook/component once a file passes 120L (hook) or trends toward 200L (component). Single component switching render on an `isExam` prop is acceptable at small scale |
| Server Action file > 100-line limit | 2026-03-20 (d93f924) | 1 | 2026-03-20 | WATCHING (lookup.ts 112L — extract `buildQuestionQuery` helper). Note: flag.ts 118L is the documented 3+-focused-functions exception, not a hit |
| Utility function > 30 lines (single query RPC) | 2026-05-31 (c879a259) | 1 | 2026-05-31 | WATCHING (getSessionReports 47→64L, out-of-range probe logic added 17 lines, grew from under-30 to over-30). Fix = extract probe helper into separate function |
| Component deep nesting > 3 levels | 2026-03-27 (75ffa51) | 1 | 2026-03-27 | WATCHING (ConsentForm: form→div→div→Checkbox+span→a, repeated 3×; fix = extract ConsentCheckbox sub-component) |
| Utility file > 200-line limit | 2026-04-27 (c656868) | 1 | 2026-04-27 | WATCHING (quiz-session-storage.ts 226→251L; split tracked in issue #552) |
| E2E Playwright hermiticity (hard-delete without restoration) | 2026-04-30 (from §7 testing rule) | 2 | 2026-04-30 (admin-students, admin-questions pre-mig 083) | RESOLVED — distributions-rls.spec + report.spec + admin-dashboard.spec (all 2026-06-04, ad19626) apply hard-delete cascade correctly with `.beforeEach/.afterEach + createdIds.clear()` pattern; no recurrence since rule promotion. session-race-condition.spec (PR-4, 2026-06-06) newly hermetic with afterEach soft-delete + `createdSessionIds` array (session-replay was already hermetic on master) |
| `waitForTimeout` in E2E specs | 2026-06-06 (test/isolation-hygiene) | 1 | 2026-06-06 | WATCHING (exam-recovery.spec.ts: waitForTimeout(300) replaced with `waitFor`+attribute assertion — fix already applied in this commit, tracking for recurrence) |

> Count increments only on a **distinct** mechanism. Rows transition state, never deleted.
> Four "watching" count=1 rows have not recurred — that non-recurrence is itself a positive signal.

## Durable knowledge

- **Scope is the commit diff only.** Don't flag size violations whose over-limit lines are all pre-existing (no `+` lines in the hunk) — only flag what the commit introduced or worsened. Note worsened pre-existing violations but classify them as such (e.g. quiz-session-storage 226→251).
- **Test files are exempt from line limits up to a 500-line ceiling.** Most quiz test files run 150–760 lines and are fine. (use-session-bootstrap.test.ts ~685L is pre-existing tracking, not a fresh flag.)
- **Documented Server Action exception:** a file >100 lines holding 3+ focused exported functions (each ≤30L) plus private helpers is acceptable (e.g. flag.ts 118L: toggleFlag 32L, getFlaggedIds 29L + flagQuestion/unflagQuestion helpers).
- **`useEffect` for ResizeObserver, click-outside listeners, timer cleanup, and hydration guards is NOT a data-fetching violation** — do not flag. Only `useEffect` that fetches data is the anti-pattern.
- **Migrations:** 300-line cap. Comment-trimming to hit the cap is acceptable when the rationale lives in `docs/database.md` + commit message; never trim load-bearing decision comments (lock rationale, soft-delete-skip justification, grace-period notes). SECURITY DEFINER functions get a documented exception (e.g. migration 047).
- **Page files:** 80-line cap, composition only — consistently honored (dashboard/page 42L, report/page 46/59L).
- **Borderline watch files trending toward limits:** quiz-session.tsx and use-quiz-state.ts (toward 200L/120L); session-table.tsx ExamBadge inline styling; report-question-row.tsx (117L) inline icons; result-summary.tsx desktop+mobile in one file (89L, "soft and"). Flag on next growth, not now.
- **Stable positive patterns** (acknowledge, don't re-litigate): behavior-first test naming; `vi.hoisted` + `vi.mock` + `vi.resetAllMocks()` mocking; `Readonly<Props>` immutability wrappers; early-fallback ternary (`== null ? fallback : value`); `new URL(url, base).searchParams` for URL-param assertions; responsive tree split (separate desktop/mobile components, not inline branches); component extraction + shared placement + all-import-site updates executed correctly (39b372e6); immutable-table hermiticity via delta assertion + `actor_id` + `gte(created_at, ...)` scoping instead of afterEach cleanup (c2758326 rate-limiting audit_events pattern).
- **Immutable-table E2E pattern:** when a test produces rows in `audit_events` (append-only by security.md rule 5), hermiticity is achieved via a pre/post delta assertion scoped by `actor_id` + `created_at >= testStart` — no afterEach cleanup is needed or possible. Do not flag absence of afterEach on tests whose only writes go to immutable tables.
- **code-reviewer scope is style/structure only.** Logic, security, RLS, error-handling correctness belong to semantic-reviewer — don't overlap.
