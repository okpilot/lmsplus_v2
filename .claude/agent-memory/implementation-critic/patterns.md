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
- 2026-04-11: hard DELETE on `exam_config_distributions` inside `upsert_exam_config` RPC — intentional exception documented in migration 043 and docs/database.md. Table is ephemeral config (same precedent as quiz_drafts). Not a no-soft-delete violation.
- 2026-04-26 (commit 34194aa): flagged "duplicate Discard button" but mistook the adjacent conditional JSX guard block `{canDismiss && (` for the existing Discard button. Two distinct buttons: one state-driven (confirmingDiscard trigger), one prop-driven (canDismiss guard on confirm panel). Both correctly in place. Resolved without revision.

## Recurring Issues
<!-- Track patterns across sessions -->

### 2026-04-14 — Conditional redirect regression when return value is discarded (exam timeout path)
- `handleSubmitSession` called `await discardQuizSession(...)` but discarded the return value. Inside `discardQuizSession`, `router.push` is only called on Server Action success. On failure the user is left stranded with no redirect and no error shown — a regression from the old unconditional `router.push`.
- The pattern: wrapping an old unconditional operation inside a helper that makes it conditional, then calling the helper without checking its result. The caller must either check and handle the failure or the helper must guarantee the side-effect regardless of inner success/failure.
- Watch for: any place a fire-and-forget redirect or state-clear is moved inside a helper that has an early-return on error.

### 2026-04-10 — Zero-row no-op check missing on ownership-scoped UPDATE (exam-mode PR1)
- `toggleExamConfig` UPDATE on `exam_configs` does not chain `.select('id')` to detect silent no-ops.
- Code-style.md Section 5 requires this for all ownership-scoped DELETE/UPDATE calls.
- This is the second occurrence of this pattern (also seen in batch-fixes-apr04 session per code-style.md).
- Watch for: any Server Action that performs an UPDATE with org/subject/user scoping — always chain `.select('id')` and check `data?.length`.

### 2026-04-10 — ExamConfig `id` typed as `string | null` (exam-mode PR1)
- `ExamConfig.id` in `types.ts` is `string | null` even though the DB column is `UUID PRIMARY KEY NOT NULL`.
- The null case is dead code — the DB constraint ensures a non-null id is always returned.
- Watch for: TypeScript local types where optional fields are copied from a "maybe config exists" pattern and applied too broadly to a nested type.

### 2026-04-09 — Base UI Collapsible animation: missing `height: var(--collapsible-panel-height)`
- Implementation declared `transition: height` and `data-[starting-style]:h-0 data-[ending-style]:h-0` but omitted `height: var(--collapsible-panel-height)` as the base height on the Panel element.
- Base UI Collapsible.Panel injects `--collapsible-panel-height`; without consuming it via `height: var(--collapsible-panel-height)`, the CSS transition has no target value and the panel snaps.
- Plan explicitly named the CSS variable as the mechanism — the implementation replaced the variable usage with Tailwind h-0 but forgot the non-start/non-end height assignment.
- Watch for: any Base UI animation pattern that relies on a CSS custom variable — verify the variable is consumed, not just the start/end overrides.

### 2026-04-11 — RPC extraction: JSONB key casing must match JS payload casing
- `upsert_exam_config` RPC uses `v_dist->>'topicId'` (camelCase) because the Server Action passes distributions as camelCase `{ topicId, subtopicId, questionCount }`. Both sides must use the same casing. If one side changes to snake_case, both must change together.
- Positive: implementation got this right on first attempt. Watch for it in future RPC extractions.

### 2026-04-11 — Dead code in new test files fails Biome noUnusedVariables
- `queries.test.ts` contained an unused `buildChain` function (leftover from an earlier draft), an unused `fluent` variable inside it, an unused `isChain` variable inside `makeFilterChain`, and two `noThenProperty` violations from assigning `then` on plain objects.
- Biome `noUnusedVariables: "error"` + `noThenProperty` triggered 5 lint errors, blocking the pre-commit hook.
- Watch for: when test files are adapted from earlier drafts, dead helper functions from the initial design that were replaced by the final `buildTableMocks` approach must be removed before committing.

### 2026-04-13 — Migration pairs (packages/db + supabase/) stay byte-for-byte identical
- Both 046 and 047 pairs diffed clean — zero divergence between packages/db/migrations/ and supabase/migrations/ counterparts.
- Positive signal: the implementer consistently keeps both directories in sync.

### 2026-04-08 — Blank line after import block (batch testing debt)
- Removing `afterEach(cleanup)` lines that served as visual separators between the import block and the first statement left no blank line between the last import and `beforeEach`.
- Biome `organizeImports` rule flags this as a required blank line separator — would fail the pre-commit hook.
- Watch for this in future test cleanup PRs: when a statement is removed from between imports and `beforeEach`/`describe`, the blank line separator must be added explicitly.
