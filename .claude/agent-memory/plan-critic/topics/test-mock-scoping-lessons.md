---
name: test-mock-scoping-lessons
description: Recurring gaps in plans mocking Supabase queries: single mockFrom/mockRpc cannot distinguish sequential/parallel calls to the same endpoint; UI-sweep button-text and test-update-scope underspecification.
metadata:
  type: project
---

## Multi-query test-mock scoping lessons

Relocated verbatim from plan-critic MEMORY.md (curated to stay under the 25 KB native-injection cap). Recurring gaps in plans mocking Supabase queries: single mockFrom/mockRpc cannot distinguish sequential/parallel calls to the same endpoint; UI-sweep button-text and test-update-scope underspecification.

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Multi-query test mocks: single `mockFrom`/`mockRpc` keyed by name can't distinguish N sequential calls to the SAME endpoint with different results (e.g. page-fetch then probe). Plan must scope call-order dispatch (e.g. `mockRpc.mockResolvedValueOnce(…).mockResolvedValueOnce(…)`) as in-scope; and must name which specific existing test cases will BREAK (not just "verify/keep"). | 2026-04-11 | 6 | 2026-05-31 | WATCHING |
| UI-sweep plans that add text-swap ("-ing" variants) to raw `<button>` elements must enumerate all test files that query those buttons by accessible name (getByRole/name). If the button's accessible name changes under loading (e.g. "Submit Answer" → "Submitting…"), every test asserting the pre-loading name with the element in its loading state will fail. Plans must list these tests under "Files affected" and specify updated assertions. First seen: #533 quiz-controls.test.tsx line 210 (`/submit answer/i` when submitting=true). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| UI-sweep plans that propose spinner/text to synchronous navigation buttons (sessionStorage + router.push, no async gap) will produce a visual flash that disappears instantly on navigation. These buttons have no async work to show loading for. Resume buttons in draft-card.tsx and resume-draft-banner.tsx are synchronous — no loading state exists or should be added. Plans must distinguish sync-nav vs async-action buttons before scoping spinner additions. First seen: #533. | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| Multi-query test mocks: single `mockFrom` keyed by table name can't distinguish N parallel `.from()` calls, two sequential calls to the SAME table with different filters, or count-head vs range-data calls. Plan must scope `mockImplementation`/`mockFromSequence`/call-order dispatch as in-scope. dashboard.ts getTotalAnswered+getQuestionsToday are BOTH `student_responses` count-head reads in Promise.all — any error test in dashboard.test.ts that sets `student_responses` to `{ count: null, error }` necessarily errors BOTH, not just the target. Plan's proposed mitigation (assert on prefix match `/Failed to fetch/`) is correct — flag this only as SUGGESTION to change assertion rationale in plan. | 2026-04-11 | 6 | 2026-06-01 | WATCHING |
| Test-update scope underspecification: plans say "test update" for a file but don't name the specific assertion that breaks, the fixture `PROPS` object that needs a new required prop, or the new test cases needed for new UI. Implementer over/under-mocks. Recurs: query→RPC refactors (count 7); feature adding a required prop to a shared component (internal-exam-code-email: `issue-code-form.test.tsx:105`, `issued-code-panel.test.tsx` PROPS, new button tests). | 2026-04-11 | 8 | 2026-06-18 | WATCHING |
