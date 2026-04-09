# Implementation Critic — Patterns & Memory

## Recurring Implementation Issues
<!-- Log patterns here as they emerge across reviews -->

## Common Deviation Types
<!-- Track which types of plan deviations occur most often -->

## Positive Signals

### 2026-04-08 — Batch A admin hardening (#494, #492, #487)
- All 3 plan items implemented with exact adherence to plan.
- `requireAdmin()` redirect behavior: auth→login, role→/app, service error→throw. Matches plan exactly.
- `isRedirectError` added to all 5 content components. Plan count verified correct.
- Migration correctly removes `AND u.deleted_at IS NULL` from final WHERE, retains `role = 'student'` filter, keeps SECURITY DEFINER guards intact.
- `useUpdateSearchParams` hook: reads `window.location.search` at call time as planned. Tests use `window.location` property override pattern consistently.
- `StudentDetail` type: `deletedAt: string | null` added. `getStudentDetail` removed `.is('deleted_at', null)`, added `.eq('role', 'student')`. Matches plan-critic finding.
- `admin/error.tsx` created with Sentry capture. `useEffect` for side-effect only (not data-fetch) — valid pattern.

## False Positives
<!-- Findings raised that turned out to be intentional -->
- 2026-04-08: `avg_score` returns NULL (no COALESCE) for students with no sessions — this is intentional. The app type is `number | null` and the UI guards with `!== null`. Not a bug.

## Recurring Issues
<!-- Track patterns across sessions -->

### 2026-04-09 — Base UI Collapsible animation: missing `height: var(--collapsible-panel-height)`
- Implementation declared `transition: height` and `data-[starting-style]:h-0 data-[ending-style]:h-0` but omitted `height: var(--collapsible-panel-height)` as the base height on the Panel element.
- Base UI Collapsible.Panel injects `--collapsible-panel-height`; without consuming it via `height: var(--collapsible-panel-height)`, the CSS transition has no target value and the panel snaps.
- Plan explicitly named the CSS variable as the mechanism — the implementation replaced the variable usage with Tailwind h-0 but forgot the non-start/non-end height assignment.
- Watch for: any Base UI animation pattern that relies on a CSS custom variable — verify the variable is consumed, not just the start/end overrides.

### 2026-04-08 — Blank line after import block (batch testing debt)
- Removing `afterEach(cleanup)` lines that served as visual separators between the import block and the first statement left no blank line between the last import and `beforeEach`.
- Biome `organizeImports` rule flags this as a required blank line separator — would fail the pre-commit hook.
- Watch for this in future test cleanup PRs: when a statement is removed from between imports and `beforeEach`/`describe`, the blank line separator must be added explicitly.
