# Implementation Critic — Patterns & Memory

## Recurring Implementation Issues
<!-- Log patterns here as they emerge across reviews -->

## Common Deviation Types
<!-- Track which types of plan deviations occur most often -->

### 2026-05-06 — Error message changed without updating test assertion regex (PR #628 fixture-fragility fix)
- `pickSubjectWithQuestions` empty-list error changed from `"no subjects found in org ${orgId}"` to `"no easa_subjects found"` (dropped "in org" suffix) when switching to the shared `easa_subjects` table.
- The test at seed.test.ts:152 still asserted `/no subjects found in org/`. The regex no longer matches the new message — the test would fail at runtime.
- Pattern: when refactoring a function that throws descriptive error messages (often containing context like orgId), and the new implementation changes what context is embedded, the paired test assertions must be updated in the same diff. The new table name (`easa_subjects`) no longer has org scoping, so "in org" was removed — but the test was not updated to match.
- Watch for: any error message refactor where context strings (org IDs, table names, filter clauses) are removed or replaced. Always grep test files for the old message substring before committing.

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

## Session 2026-05-06 — issue #622 CodeRabbit round 2 (duplicate-UUID hardening)
- Migration duplicate-UUID guard correct: `SELECT count(DISTINCT qid) INTO v_count FROM unnest(p_question_ids) AS qid; IF v_count <> array_length(p_question_ids,1) THEN RAISE EXCEPTION 'invalid_question_ids'` placed BEFORE the JOIN-COUNT block. All prior guards preserved.
- docs/database.md validation contract prose correctly updated to document both RAISE cases for `invalid_question_ids`.
- Integration test `[dupId, dupId]` case added inside correct describe block; `questionIds[0]!` safe per seeded beforeAll.
- `egmontOrgRow` lookup: now destructures `{ data, error }` and throws on missing org — correct.
- `createdSessionIds` populated BEFORE `expect()` call — correct.
- ISSUE: `afterEach` soft-delete missing `{ error }` destructure and `.select('id')` zero-row observability chain (code-style.md §5). Pattern recurs from session 2026-04-10 zero-row no-op watch item.

## Session 2026-05-07 — issue #108 security-header gap + session_state_changed mapping + steering drift

- proxy.ts `applySecurityHeaders` helper: all 7 headers confirmed present (X-DNS-Prefetch-Control, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Strict-Transport-Security, Content-Security-Policy). `redirectWithCookies` now delegates to helper. Both 503 and 403 branches call `applySecurityHeaders` AFTER the cookie loop — cookie posture preserved.
- `session_state_changed` ERROR_MESSAGES entry: message text matches Vitest assertion exactly. Test follows same `mockAdmin() → mockRpc → result.success false → result.error === ...` pattern as sibling cases.
- `injection-sql.spec.ts` `submit_quiz_answer` afterEach: `.is('deleted_at', null)` added at line 318, chained between `.eq('id', sessionToCleanup)` and `.select('id')`. Sibling `void_internal_exam_code` afterEach already had the filter at line 138 — pattern now consistent.
- `tech.md` steering doc: `SAMEORIGIN` → `DENY` + Edge Middleware mirror note. Matches proxy.ts and aligns with issue #631 decision.
- APPROVED — no findings.

## Session 2026-05-08 — issue #629 start_quiz_session p_mode whitelist (PR 1 of sub-batch 1)
- Migration 081 body: diff vs 080 is exactly the 5-line whitelist IF block + comment. All prior guards preserved byte-for-byte (auth.uid(), active-user gate, input validation, INSERT, audit INSERT). SECURITY DEFINER + SET search_path = public present. APPROVED.
- Spec structure mirrors quiz-session-config-injection.spec.ts correctly. beforeAll seeds via seedRedTeamUsers() and picks subject via pickSubjectWithQuestions(). attackerClient uses authenticated student context. Both attacks assert error + count=0. No afterEach cleanup per plan (RPC raises pre-INSERT). Docblock explains no-cleanup intent explicitly.
- ISSUE: supabase/migrations/ counterpart for 081 missing from staged diff. Commit 3136469 established a "dual-directory invariant" — every packages/db/migrations/ migration must have a byte-identical copy in supabase/migrations/. Migration 080 was committed with a supabase counterpart; 081 was not.
- Doc update: migration history line extended with correct convention (081_start_quiz_session_mode_whitelist.sql). Validation contract reordered to match actual execution order (auth → mode → active-user → input). Inline SQL block updated with IF block in the correct position (after auth check, before active-user gate). All accurate.
- No call sites pass mock_exam or internal_exam to start_quiz_session (grepped apps/web and all integration tests — only 'quick_quiz' and 'smart_review' found). No breaking callers.
- Recurring watch: dual-directory supabase/migrations invariant. This is the first miss in a numeric migration. Track for next session.

## Session 2026-05-07 — issue #108 void_internal_exam_code whitespace check
- Single-change migration: diff between new mig 20260507000001 and prior mig 20260430000006 is exactly one line (btrim guard → POSIX regex). All security guards, search_path, auth.uid() check, audit subqueries, GRANT, and ROW_COUNT assertion preserved byte-for-byte.
- Doc section accurate: bug rationale, migration ID, and guard expression all correct.
- Guards line updated to include `invalid_reason` with full description (NULL, whitespace-only, >500 chars).
- Regex `p_reason ~ '^[[:space:]]*$'` confirmed: matches NULL (via explicit OR), '', '   ', '\t\t\t', '\n', mixed; does NOT match 'a', '  abc  '. Logic is correct.
- APPROVED — no findings.

## Session 2026-05-06 — issue #622 start_quiz_session input hardening
- Migration CREATE OR REPLACE chain traced correctly: mig 076 → mig 077 (new). All guards from mig 076 preserved (`Not authenticated`, `user not found or inactive`, `SET search_path = public`, `auth.uid()`). Clean.
- smart_review NULL carve-out: `(p_subject_id IS NULL OR q.subject_id = p_subject_id)` and same for topic — correct per plan.
- 3 specs with status='active' filter: session-race-condition, session-replay, rate-limiting — all confirmed in diff. Correct.
- 3 excluded specs (audit-event-forgery, rpc-cross-tenant, pkce-state): confirmed absent from diff. Correct.
- Cross-org integration test uses shared easa_subjects taxonomy (not org-scoped) but questions are org-scoped — RPC catches it via `q.organization_id = v_org_id`. Confirmed valid.
- ISSUE found: soft-delete test's `.update(...).select('id')` does not check `data?.length` for zero-row no-op per code-style.md §5. Minor — does not affect the RPC test outcome but violates the pattern.
- ISSUE found: inactive-question test seeds via `seedQuestions` (which may default to `status: 'active'`) and then sets `status: 'draft'` — confirmed `seedQuestions` does default to `active`, so the update correctly makes it draft. Valid.
- rpc-question-membership.spec.ts: subjectB lookup queries `subjects` table (org-scoped), not `easa_subjects` — correct. Preserves distinct A/B subject intent.
- quiz-draft-injection.spec.ts: dropped `.limit(2)` second subject in favor of same-org single subject. Comment explains RLS scopes drafts by org not subject — semantically valid for this attack vector. Test intent preserved.

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

### 2026-05-07 — TRANSPORT_LAYER loops applied inconsistently across RPC fuzzing blocks (issue #108)
- `injection-sql.spec.ts` covers `start_internal_exam_session` and `submit_quiz_answer` with both DB_LAYER and TRANSPORT_LAYER loops, but `void_internal_exam_code` gets only DB_LAYER + WHITESPACE, no TRANSPORT_LAYER loop.
- Plan explicitly states "TRANSPORT_LAYER_PAYLOADS asserted with `error !== null` only" for all 3 RPCs.
- The omission means 2 NUL-byte / CRLF payloads go untested against a text parameter that also accepts arbitrary input.
- Watch for: when plan documents a payload group applied to N RPCs, count the actual loops in each describe block before approving.
- ISSUE raised: requires adding a `for (const payload of TRANSPORT_LAYER_PAYLOADS)` loop to the `void_internal_exam_code` describe block.

### 2026-05-07 — backdateSession missing `.select('id')` zero-row observability (issue #108)
- `backdateSession` in `audit-completeness.spec.ts` calls `.update(...).eq('id', sessionId)` without chaining `.select('id')` or checking `data?.length`.
- Pattern recurs from session 2026-05-06 (issue #622) — now seen twice in E2E helper contexts.
- Per code-style.md §5, every UPDATE expected to hit rows must observe zero-row no-ops via `.select('id')` + length check.
- SUGGESTION raised (not ISSUE — in a test helper, not production code, and the sessionId comes from a trusted beforeAll — but the pattern is still preferred).

### 2026-05-25 — issue #664 mastery % clamp fix (APPROVED)

- All 5 plan items implemented correctly across progress.ts, dashboard.ts, progress-content.tsx, and their 3 test files.
- `answeredCorrectly` stays raw in all production code. Never wrapped in `Math.min`. The #540 filter `totalQuestions > 0 || answeredCorrectly > 0` continues to use the raw value — orphan-retention signal preserved.
- Topic masteryPercentage in `progress.ts` line 106: `Math.min(Math.round(...), 100)` inside the `tQuestions.length > 0 ?` branch — zero-question case still returns 0. Correct.
- Subject masteryPercentage in `progress.ts` line 121: same structure, same correctness.
- `dashboard.ts` line 151: same pattern, with comment explaining `correct` can exceed `total`.
- `progress-content.tsx`: `overallMastery` clamped via `Math.min(..., 100)` on line 12; `masteredCount = Math.min(totalCorrect, totalQuestions)` on line 13. `makeSubject(1, 3)` → totalCorrect=3, totalQuestions=1 → overallMastery=`Math.min(300, 100)=100`, masteredCount=`Math.min(3,1)=1` → "1 / 1 questions mastered". Verified correct.
- New tests assert `answeredCorrectly === 2` (raw) alongside `masteryPercentage === 100` (clamped) in both progress.test.ts and dashboard.test.ts. progress-content.test.tsx asserts "100%" and "1 / 1 questions mastered".
- `makeSubject` helper in progress-content.test.tsx: masteryPercentage line is NOT clamped inside the helper (computes 300%). This is intentional — the component's own clamp logic is what the test exercises.
- APPROVED — no findings.

### 2026-05-26 — issue #540 mastery-stats RPC (#668 instance #1) (APPROVED — one ISSUE, one SUGGESTION)

- SQL: SECURITY INVOKER + STABLE + SET search_path = public + GRANT authenticated. FULL JOIN (not LEFT) for orphan retention. topic_id IS NULL sentinel. Denominator filters status='active'; numerator has no status filter. No answer data exposed (counts only). All security attributes match plan.
- TS: Both files use rpc<MasteryRow[]>(supabase, 'get_student_mastery_stats', {}). Error checked via { data, error } / masteryResult.error. Number() coercion on bigint. !row.subject_id guard in both. topic_id !== null skip in dashboard.ts; === null branch in progress.ts. Orphan filter (totalQuestions > 0 || answeredCorrectly > 0) in both. answeredCorrectly is raw/unclamped.
- types.ts: Args: never (consistent with get_admin_student_stats pattern in file; plan said Record<string, never> but never is the established codebase pattern — SUGGESTION noted).
- Tests: from: mockFrom retained. questionsCallCount pattern removed. #540 regression test (total:1366, correct:1366) present in both suites. RPC-error test present in both suites.
- ISSUE: docs/database.md not staged — get_student_mastery_stats not added to the RPC list (line 660) or Core RPCs section (line 2031). Plan explicitly listed docs/database.md as a file to change. Doc-updater must handle post-commit.
- SUGGESTION: _userId param in getSubjectProgressWithMap is dead — the RPC is caller-scoped via RLS, so the param serves no purpose. Keeping it with the _ prefix suppresses lint but it could be removed and the caller updated. Not blocking.
- No false positives this session.

### 2026-05-22 — issue #540 dashboard/progress orphan-retention fix (APPROVED)

- All 8 plan items implemented correctly across dashboard.ts, progress.ts, dashboard.test.ts, progress.test.ts.
- Both `if (q.topic_id)` null guards added to `topicByQuestionId` (line 62) and `qByTopic` (line 65) — correct.
- `sCorrect`/`tCorrect` type change from array to number: all `.length` references updated, all masteryPercentage calculations use the number correctly.
- `questionSubjectMap` scope unchanged (built from active-only count query) — `applyLastPracticed` correctness preserved.
- Count query retains `.eq('status', 'active')` — correct; correct-mapping query drops it — correct.
- Dashboard orphan test uses scoped `let questionsCallCount = 0` inside the `it(...)` closure — no cross-test leakage.
- Deviation #1 (added `created_at` to response mock): confirmed necessary — `getStreakData` calls `r.created_at.slice(0,10)` and `applyLastPracticed` also accesses `r.created_at`. Would throw on existing tests without it.
- Deviation #2 (`status: 'active'` on 4 pre-existing fixtures): confirmed necessary — new `if (q.status === 'active')` guard would skip all pre-existing fixtures and break their existing assertions.
- No `any` types, no `useEffect`, no barrel files introduced.
- Both acknowledged deviations are justified and do not change the behavioral claims the original tests validate.
- Positive signal: implementer correctly tracked the plan's two-query distinction for dashboard.ts (count vs. correct-mapping) and used a call-counter pattern to differentiate them in the test.

### 2026-04-08 — Blank line after import block (batch testing debt)
- Removing `afterEach(cleanup)` lines that served as visual separators between the import block and the first statement left no blank line between the last import and `beforeEach`.
- Biome `organizeImports` rule flags this as a required blank line separator — would fail the pre-commit hook.
- Watch for this in future test cleanup PRs: when a statement is removed from between imports and `beforeEach`/`describe`, the blank line separator must be added explicitly.

### 2026-05-26 — issue #540 PR-sweep: Promise.all parallelization + database.md COUNT wording — APPROVED

- dashboard.ts `getSubjectProgressWithMap`: two sequential awaits (mastery RPC + questions map) merged into `Promise.all([rpc(...), supabase.from(...)])`. Both arms return `{data, error}` envelopes and never throw on query errors — no unhandled rejection risk. Error precedence (mastery before map) unchanged. Early-return on empty subjects correctly stays before the parallel reads.
- Variable rename sweep complete: `masteryData`→`masteryRes.data`, `questionMapData`→`questionMapRes.data` at all usage sites.
- database.md `total` correction: `active_q` CTE is a plain single-table SELECT on PK `questions.id` (no fan-out), so `COUNT(*)` is accurate and `DISTINCT` is redundant — verified against migration 20260521000005 lines 52-55, 72-74.
- database.md `correct` correction: `correct_q` CTE uses `SELECT DISTINCT q.id` (line 65) to dedup, then `subj_correct` aggregates with `COUNT(*)` (line 77) — two-step dedup described correctly in updated doc.
- Positive signal: `rpc` wrapper contract verified once — record that it returns `{data, error}` and never throws; future reviews of `Promise.all([rpc(...), ...])` can rely on this invariant without re-reading the wrapper.

### 2026-05-26 — issue #668 phase 2: dashboard secondary-stats RPCs (APPROVED)

- Migration 20260521000006: both RPCs are LANGUAGE sql, SECURITY INVOKER, STABLE, SET search_path = public, GRANT EXECUTE TO authenticated, COMMENT. No prior definition of either function in any migration — CREATE OR REPLACE chain starts fresh. Timestamp ordering correct (000006 > 000005).
- Security §11 compliance: explicit `sr.student_id = auth.uid()` in BOTH get_student_streak (days CTE) and get_student_last_practiced (WHERE clause). Two permissive SELECT policies on student_responses confirmed (students_read_responses + instructors_read_students). SECURITY INVOKER + self-scope is the correct defense. Unauthenticated caller → auth.uid() NULL → zero rows → {0,0} single row for streak, empty set for last-practiced.
- Gaps-and-islands semantics verified: `d - ROW_NUMBER() OVER (ORDER BY d)` produces same grp for consecutive dates. current_streak subquery uses `run_end >= today - 1` — exactly mirrors legacy `anchoredToNow` (today or yesterday). best_streak = MAX(len). Empty result → {0,0} via scalar subquery with no FROM.
- UTC date derivation: `(sr.created_at AT TIME ZONE 'UTC')::date` matches legacy `created_at.toISOString().slice(0,10)`. Correct.
- get_student_last_practiced: JOIN on questions inherits `deleted_at IS NULL` via tenant_isolation RLS policy (confirmed in 20260311000001). All responses, no is_correct filter — behavior-preserving.
- TS refactor: getStreakData drops userId param, calls rpc with {}, Number() coercion, data?.[0] fallback to {0,0}. applyLastPracticed drops userId + questionSubjectMap, data ?? [] fallback safe. Error paths throw with sanitized messages. All consistent with existing mastery RPC pattern.
- getDashboardData correctly wired: getSubjectProgress returns SubjectProgress[] directly. Parallel Promise.all includes getStreakData(supabase). applyLastPracticed(supabase, subjects) called post-parallel. bestStreak field wired to return object.
- Dangling references: none. computeStreaks, ResponseDateRow, QuestionIdSubjectRow, SubjectProgressResult all removed. No other callers of the refactored functions outside the two files.
- Tests: mockRpc hoisted with vi.hoisted in both test files. computeStreaks tests appropriately deleted (logic now in SQL). New tests cover: wiring, Number() coercion (string→num), empty data→{0,0}, error→throw for both getStreakData and applyLastPracticed. dashboard.test.ts uses setRpc() dispatcher for per-fn dispatch. Error-path tests for streak and last-practiced RPCs added. questions-branch removed from mockFrom.
- File sizes: dashboard-stats.ts 74 lines (max 200), dashboard.ts 131 lines (max 200), migration 88 lines (max 300). All within limits.
- Dual-directory invariant: does NOT apply to 20260521000006 — pattern confirmed against 20260521000005 (mastery RPC) which also omitted packages/db/migrations counterpart. Timestamp-format migrations live in supabase/migrations/ only.
- docs/database.md: 2 RPC summary rows added after mastery row (L661-663). 2 signature sections added after mastery section (L2073, L2092). Both accurate vs migration body.
- APPROVED — no findings.

### 2026-05-27 — issue #668 PR C test file: dead buildAnswersClient helper causes Biome pre-commit failure — ISSUE

- `buildAnswersClient` (147 lines, test file lines 35–181) built a full Supabase proxy to simulate `.in()` batch tracking, but was never called — all 7 tests switched to the simpler `vi.hoisted` + `mockFetchAllRows` mock approach.
- Biome reported 7 lint errors (`noUnusedVariables` ×4, `noUnusedFunctionParameters` ×1, `useConst` ×1, format ×1) — would have failed the pre-commit hook.
- Pattern: dead helper from an earlier design draft survives when the approach is refactored mid-implementation. Identical failure mode to session 2026-04-11 (queries.test.ts unused `buildChain`).
- Watch for: any test file containing a large helper function (proxy-builder, client factory, chain-builder) — grep for call sites before committing. If the helper is only referenced in its own definition, delete it.
- Count: 2 occurrences (2026-04-11 + 2026-05-27). Pattern is now confirmed recurring — add to pre-commit mental checklist.

### 2026-05-27 — issue #668 PR C: GDPR export pagination (collect-user-data + supabase-paginate) — APPROVED

- fetchAllRows loop: `for (from=0; from<total; from+=pageSize)` with `to=Math.min(from+pageSize,total)-1`. Exact-multiple boundary verified (total=4, pageSize=2 → 2 calls, no third). Can't infinite-loop (total is fixed, from grows by pageSize each iteration, loop terminates at from>=total).
- All 8 list reads routed through fetchAllRows — quiz_sessions, student_responses, fsrs_cards, active_flagged_questions, question_comments, user_consents, audit_events (all via named fetchUser* helpers), quiz_session_answers (chunked in fetchUserSessionAnswers). users read stays .single(). No read left un-paginated.
- active_flagged_questions: view already filters deleted_at IS NULL (migration 20260323000051). Count and page queries add no extra deleted_at filter — correct, consistent. Order uses .order('question_id') tiebreak (no id column on the composite-PK table/view).
- student_responses / fsrs_cards / quiz_session_answers / user_consents: none have deleted_at — queries correctly omit the filter.
- sessionsResult.data used directly (no ?? fallback) — correct; fetchAllRows return type guarantees data: T[] (never null).
- Phase-2 chunk size = 1000 exactly matching the .in() URI limit; empty sessionIds guarded before the loop. An error in any batch breaks early and is logged.
- Error logging: simplified from `'error' in result && result.error` to `result.error` — safe because fetchAllRows always returns the {data, error} envelope (data is never absent from the type). answers error logged separately.
- audit_events: only SELECTed, never mutated. Immutability rule preserved.
- File sizes: collect-user-data-queries.ts 191 lines (max 200), collect-user-data.ts 90 lines (max 200), supabase-paginate.ts 30 lines (max 200). All within limits.
- Positive signal: count-query filters (deleted_at IS NULL, student_id equality) exactly mirror page-query filters in all 8 helpers — a count/page filter mismatch would cause pagination to fetch wrong or excess rows.
- APPROVED — no findings.

### 2026-05-27 — issue #668 PR #681 CodeRabbit fixes: pageSize guard + runtime type-guard + test titles — APPROVED

- pageSize guard (`supabase-paginate.ts`): `!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 1000`. Boundary verified: 1000 passes (allowed), 1001 rejected, 0 rejected, -1 rejected. Returns empty-on-error `{ data: [], error: { message: '...' } }` shape — does not throw. Consistent with empty-on-error contract used by all other early-return paths.
- Regression tests (`supabase-paginate.test.ts`): `it.each([0, -1, 1001])` — correct set. 1000 correctly absent (valid value). Both `getCount` and `getPage` asserted not called. Error message asserted via `/pageSize/i` regex — matches guard output.
- Runtime type-guard (`collect-user-data.ts`): `.filter((f): f is { question_id: string; flagged_at: string } => typeof f.question_id === 'string' && typeof f.flagged_at === 'string')`. `FlagRow` source type has both fields as `string | null`. `typeof null === 'object'` so the `=== 'string'` check correctly excludes nulls. Result type assignable to `GdprExportPayload['flagged_questions']`. Predicate return type matches the narrowed element type exactly.
- Test title renames (`collect-user-data-queries.test.ts`): all 3 internal-helper names (`fetchAllRows`) removed from `it(...)` titles. New titles describe observable batch-splitting behavior. Rule: code-style.md §7 prohibition on impl-detail names in it() titles.
- Positive signal: pageSize=1000 boundary is the critical one (PostgREST cap) — implementation treats it as valid, which is correct. The guard's comment explains both failure modes (loop non-termination for <=0, silent truncation for >1000).

### 2026-05-26 — issue #668 instance #3: quiz.ts counts → get_question_counts RPC — APPROVED

- fetchActiveQuestionCounts helper: rpc<QuestionCountRow[]> wrapper, error logged + returns [], Array.isArray guard. All per plan and §5.
- getSubjectsWithCounts: Promise.all([easa_subjects, fetchActiveQuestionCounts]); destructure `countsData` directly (not wrapped); `Number(row.n)` sum per subject_id. Correct.
- getTopicsForSubject: sequential reads (metadata then counts); subject_id filter in JS; no null-subtopic concern here (topic_id is always non-null). Correct.
- getSubtopicsForTopic: sequential reads; `row.topic_id !== topicId || row.subtopic_id === null` guard on countMap.set — null rows skipped. Correct.
- getTopicsWithSubtopics: Promise.all([easa_subtopics, fetchActiveQuestionCounts]); single loop builds topicCounts (all rows, null or not) + subtopicCounts (null rows skipped). Null-subtopic rows correctly contribute to topicCounts but not subtopicCounts. Behavioral equivalence with old two-query approach verified.
- Type: QuestionCountRow { subject_id, topic_id, subtopic_id: string|null, n: number|string }. Old QuestionRefRow/QuestionTopicRow/QuestionSubtopicRow removed. Correct.
- Tests: mockRpc hoisted via vi.hoisted; vi.mock('@/lib/supabase-rpc'); beforeEach default {data:[],error:null}. All 4 count describe blocks use mockRpc for counts + mockFromSequence for metadata only. Assertions unchanged. getRandomQuestionIds describe blocks untouched.
- getTopicsWithSubtopics questionCount assertion: `n:1` + `n:1` (null subtopic) → topicCounts.get('t1')=2 → correct match to old `{ topic_id:'t1' }, { topic_id:'t1' }` data.
- Positive signal: null-subtopic guard (`if (row.subtopic_id !== null)`) correctly applied before Map.set in both getSubtopicsForTopic and getTopicsWithSubtopics.
- APPROVED — no findings.

### 2026-05-26 — issue #668 instance #3 follow-up: tests + comment + docs — APPROVED

- 5 new Vitest tests: 4 × RPC-error-path (one per public count function) + 1 × non-array-payload guard (on getSubjectsWithCounts, shared guard).
- Test names are behavior-focused ("returns empty array when the counts RPC fails", "returns empty array when the counts RPC returns a non-array payload") — no impl-detail leakage per code-style §7. RPC name in describe titles is integration-boundary contract — permitted.
- consoleSpy prefix verified against production line 56: `'[fetchActiveQuestionCounts] get_question_counts error:'`. Second argument is `error.message` (`'rpc boom'`) — matches mock `{ message: 'rpc boom' }`. Exact.
- Non-array guard test logic verified: `Array.isArray({ unexpected: true }) = false` → `fetchActiveQuestionCounts` returns `[]` → countMap empty → all subjects get questionCount 0 → filtered out → `[]`. Correct.
- getTopicsWithSubtopics error test: two `mockFromSequence` calls (topics + subtopics via Promise.all), RPC fails → topicCounts empty → `.filter(t => t.questionCount > 0)` → `[]`. Correct.
- QuestionCountRow.n comment accurate: BIGINT from PostgREST can serialize as string, Number() coercion required at every read site.
- docs/database.md: RPC summary row updated to list quiz.ts as consumer; `get_question_counts` section prose updated to name quiz.ts at the `'active'` p_status bullet. No false claims.
- docs/plan.md: instance #3 accurately described as PR-pending / not merged; 7/12 P0 count correct (dashboard ×3, dashboard-stats ×2, progress ×1, quiz subject counts ×1); no auto-close token in doc text.
- No production logic changed (only a type comment); no `any`; tests co-located in quiz.test.ts (no __tests__/).
- APPROVED — no findings.

### 2026-05-26 — issue #540 CodeRabbit doc+error-path fixes (PR #674) — APPROVED

- design.md Scoping bullet: corrected from "no manual scoping, no auth preamble" to "RLS + an explicit numerator predicate" with `sr.student_id = auth.uid()`. Wording verified against migration `20260521000005_student_mastery_stats_rpc.sql` — correct_q CTE has `WHERE sr.student_id = auth.uid()` at line 68. security.md §11 reference is accurate (`student_responses` has `instructors_read_students` policy that OR-combines with the student policy).
- progress.ts: added `if (subjectsRes.error) throw` and `if (topicsRes.error) throw` matching the pre-existing `masteryResult.error` pattern. Sequential error checking after `Promise.all` — first error wins, which is the intended fail-fast behavior.
- dashboard.ts `getSubjectProgressWithMap`: added `if (subjectsError) throw` on easa_subjects read and `if (questionMapError) throw` on questions read. Both match the existing `masteryError` throw pattern already in the function.
- Callers are Server Components (no `'use client'`), not Server Actions — `error.message` in throw message is correct (§5 sanitize rule applies only to client-facing Server Action returns).
- Files within line limits: progress.ts (118 lines, max 200), dashboard.ts (159 lines, max 200).
- New error paths (subjects/topics/question-map read errors) have no test coverage yet — test-writer post-commit agent must add them. Not a blocker for this commit.
- Positive signal: sibling-audit rule applied correctly — both dashboard.ts and progress.ts swallowed-error fixes staged together in one diff.
