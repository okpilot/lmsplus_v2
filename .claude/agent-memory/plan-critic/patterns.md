# Plan Critic — Patterns & Memory

## Recurring Plan Issues
<!-- Log patterns here as they emerge across reviews -->

## Common Assumption Failures

### [2026-04-09] Test file mock assumptions when replacing a library
When a component is rewritten from one UI library to another (e.g. shadcn Select → Base UI Collapsible), the co-located `.test.tsx` mocks the OLD library by module path. Plans consistently omit the fact that the entire mock must be rewritten for the new library. The plan correctly identified there is a test file, but did not include the test file in "Files to change" or specify how the mock and assertions change.

### [2026-04-10] Nav icon union type is a closed set — new admin pages need a new icon name
`nav-items.ts` defines a closed union type `'home' | 'file-question' | 'bar-chart' | 'book-open' | 'list' | 'users' | 'settings'`. Plans that add a nav entry with an icon not in this set will cause a TypeScript error at the call site. `NavIcon` also has a `switch` with no matching case for unknown names — it silently renders nothing. Plans must either reuse an existing icon name or add the new icon to both the union type AND the `NavIcon` switch.

### [2026-04-10] sidebar-nav.test.tsx asserts exact admin nav items — adding a new item breaks the test
`sidebar-nav.test.tsx` has tests that assert specific named items (Syllabus, Questions, Students) are present or absent. Adding a new admin nav entry to `ADMIN_NAV_ITEMS` will not break these particular tests directly, but the test file is a missed caller that must be listed in "Files affected" whenever `nav-items.ts` changes.

### [2026-04-10] quiz_sessions.deleted_at exists (migration 023) — plan assumption that it does not exist is correct; column IS there
`quiz_sessions` had no `deleted_at` in the initial schema (explicitly commented "immutable record — no soft delete") but migration `20260313000023_quiz_sessions_deleted_at.sql` added it. The generated types confirm the column. Plans must account for this when reasoning about quiz_sessions columns.

### [2026-04-10] batch_submit_quiz score denominator = answered, not total — exam pass calculation must divide by total_questions
The current `batch_submit_quiz` calculates score as `correct / answered` (not `correct / total`). For a mock exam where all questions must be answered, score = correct / answered = correct / total. But the `passed` flag computed in the modified RPC should compare `(correct / total_questions) * 100 >= pass_mark`, not `score_percentage >= pass_mark`, since score_percentage uses answered as denominator (which equals total only if all questions are answered — the exam guard ensures this, so the values are equivalent; plan is safe).

### [2026-04-11] Controlled dialogs with external state + useState initializers — removing mount guard resets form
When migrating a hand-rolled dialog overlay to shadcn Dialog, plans often say "remove the mount guard and let Dialog control visibility." This breaks components where useState initializers derive from props (e.g., `useState(config?.totalQuestions ?? 16)`). Those initializers run once at mount. If the mount guard is removed, the component stays mounted and the form shows the first-ever subject's values on subsequent opens. The fix is either keep the mount guard or add `key={entityId}` to force remount. This is a recurring failure mode: plan says "Dialog handles visibility" without accounting for derived initial state.

### [2026-04-11] Sibling action files have the same missing-error-destructure pattern
Plans that add error destructuring to one Server Action file consistently miss the sibling file with the same pattern. In this PR: toggle-exam-config.ts (lines 18, 30) was the target; upsert-exam-config.ts line 18 had the identical `.maybeSingle()` without error destructuring. The CLAUDE.md sibling-file audit rule exists exactly for this, but plan validation missed it. Future plans touching one action file should always grep sibling action files in the same folder for the same pattern.

### [2026-04-11] Migration risk items left as "needs verification" block on ambiguity
Plans that note a risk as "needs verification" without resolving it before the review step create implementer ambiguity. In this PR: the migration risk about upsert-exam-config.ts ON CONFLICT was stated but not concluded. The conclusion (no ON CONFLICT clause exists, partial index still prevents dupes for live rows, distributions constraint is unrelated) must be explicit in the plan so the implementer does not guess. Never leave "needs verification" open in a validated plan.

### [2026-04-11] Plans referencing start_exam_session as the org-derivation pattern miss the soft-delete filter requirement
When a plan says "derive org from JWT, same as start_exam_session", it cites the pattern correctly but consistently omits the required `AND deleted_at IS NULL` guard on the users table lookup. SECURITY DEFINER RPCs bypass RLS, so this filter must be explicit. Plans must state the full lookup: `WHERE id = auth.uid() AND deleted_at IS NULL`. This has now appeared in two separate RPC plans on the same PR.

### [2026-04-11] Plans for SECURITY DEFINER admin RPCs omit the is_admin() helper
The codebase has `public.is_admin()` defined in migration 039. Plans for new admin-only RPCs consistently describe an inline `SELECT role FROM users WHERE id = auth.uid()` check instead of calling `is_admin()`. The inline pattern is redundant and diverges from all admin RLS policies. Plans must specify `IF NOT is_admin() THEN RAISE EXCEPTION` — not a custom lookup.

### [2026-04-11] Test rewrite plans for Server Actions are underspecified when moving from query chains to RPC mocks
When a Server Action is rewritten from chained Supabase queries to a single rpc() call, the test rewrite plan consistently says "mock rpc() instead of query chains" without specifying: (a) which existing test cases survive unchanged, (b) which test cases collapse (internal lookup/update/insert paths become unreachable), (c) the vi.hoisted + mockRpc structure. Implementers either over-preserve dead tests or drop error-path coverage. Plans must enumerate the surviving test cases explicitly.

### [2026-04-11] Soft-delete matrix entries for tables with cascade + direct-RLS dual-path are underspecified
When a table has both `ON DELETE CASCADE` from a parent and a direct admin RLS DELETE policy (e.g., `exam_config_distributions`), plans that add a "Hard DELETE approved exception" matrix row consistently omit the dual-path nature. The entry reads as if the only deletion path is the RPC. Future plans adding a new deletion route will not know a direct-delete policy already exists. Matrix entries for such tables must document both paths.

### [2026-04-11] Test assertion change rationale "values are exact" is imprecise for multi-keystroke userEvent.type
Plans that change `toBeLessThanOrEqual(max)` to `toBe(max)` justify it with "component uses Math.max/Math.min so values are exact." This is only true for the final keystroke. `userEvent.type('150')` emits three change events; `.at(-1)` captures only the last. The correct rationale is "`.at(-1)` selects the final call, which has the fully-typed number clamped to max." Plans must use this precise rationale to prevent future maintainers from writing broken assertions for intermediate-call scenarios.

### [2026-04-11] Multi-query parallel fetch functions need table-dispatching mock pattern — not flat mockFrom
Plans for testing functions with `Promise.all([...N supabase.from() calls...])` consistently say "follow existing test patterns." The existing sibling action test pattern (single `mockFrom` returning one chain) cannot distinguish between N different `.from('tableName')` calls. Plans must explicitly call out the `mockImplementation((tableName) => ...)` dispatch pattern for any test covering parallel multi-table fetches.

## Positive Signals

### [2026-04-09] Base UI data attribute names correctly verified
Plan correctly used `data-[panel-open]` for the Trigger (which matches `CollapsibleTriggerDataAttributes.panelOpen = "data-panel-open"`) and `data-[starting-style]`/`data-[ending-style]` for panel animation (which match `CollapsiblePanelDataAttributes.startingStyle/endingStyle`). These are real attributes confirmed in the Base UI 1.3.0 type definitions.

### [2026-04-09] Caller analysis accurate for single-file rewrite
Plan correctly identified quiz-config-form.tsx as the only production caller and verified props interface is unchanged. No missed callers in this case.

### [2026-04-28] E2E seed data requirements accurately analyzed
Plan correctly identified that `getExamEnabledSubjects()` returns `[]` in CI because it queries `exam_configs` table which has no rows from `seed-e2e.ts`. Correctly traced the data dependency chain: seed creates no exam config → query returns empty → button stays disabled. Also correctly identified that seed-e2e.ts seeds 21 questions under topic 050-01, which satisfies the planned distribution of 10 questions. Pattern matching from seed-exam-eval.ts EXAM_PLANS is accurate.
