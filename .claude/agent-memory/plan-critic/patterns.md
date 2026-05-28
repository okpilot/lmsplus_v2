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

### [2026-05-06] Validation COUNT query breaks for NULL-subject (smart_review) mode
Plans that add a pre-INSERT COUNT query to `start_quiz_session` using `q.subject_id = p_subject_id` forget that `smart_review` mode passes `p_subject_id = NULL`. In Postgres, `q.subject_id = NULL` is always NULL (not TRUE), so the COUNT returns 0 and the validation raises `invalid_question_ids` for every valid smart_review call. The fix is `(p_subject_id IS NULL OR q.subject_id = p_subject_id)`. Plans must check the null-subject call path before adding subject-scoped WHERE clauses.

### [2026-05-06] spec-by-spec intent review: some redteam specs intentionally pass empty/cross-org question IDs
`rpc-cross-tenant.spec.ts` deliberately passes foreign-org question IDs expecting the RPC to fail. After hardening `start_quiz_session` to validate question org membership, that spec's attack must still produce an error — but the error code changes from "23502 NOT NULL" to "invalid_question_ids". Plans must check whether any spec's *pass condition* is a specific error code; if the hardening changes the error, the spec assertion must be updated too. Cross-tenant spec at line 68-78 uses open error check (`expect(error).not.toBeNull()`), so it survives — but this must be verified per spec.

### [2026-05-06] Redteam specs that fetch questions without status=active filter pass invalid IDs to new validation
`session-race-condition.spec.ts` (lines 44-50), `session-replay.spec.ts`, and `rate-limiting.spec.ts` fetch question IDs with only `deleted_at IS NULL` but NOT `status = 'active'`. After adding `q.status = 'active'` to the RPC validation COUNT, these specs could fail if any seeded question has `status != 'active'`. Plans must either add `.eq('status', 'active')` to all spec question fetches or document the assumption that seeded test questions are always active.

### [2026-05-07] Red-team injection specs: NUL-byte payload fails before reaching RPC error
SQL injection payload arrays that include a NUL byte (`\x00`) will be rejected by PostgREST before the Postgres function runs, producing a PostgREST 400 error whose message does NOT match the RPC's `RAISE EXCEPTION` string. Plans that assert a single regex (e.g. `/code_not_found/i`) against all SQL payloads will fail on the NUL-byte case. The fix: either remove the NUL-byte payload from the "all rejected with code_not_found" group, or write a separate assertion branch for it.

### [2026-05-07] audit-completeness specs: actor_id differs per event type — admin events must filter by admin's id
`internal_exam.code_issued` and `internal_exam.code_voided` write `actor_id = v_admin_id` (the admin who called the RPC), while `internal_exam.started`, `internal_exam.expired` (via batch_submit_quiz), `exam.started`, `exam.completed`, `quiz_session.batch_submitted` write `actor_id = v_student_id`. Plans that assert `.eq('actor_id', expected_actor)` on every event type without distinguishing admin vs. student actor will produce a 0-row result for admin-originated events. Each test must bind `expected_actor` to the correct role's uid.

### [2026-05-07] submit_quiz_answer injection: option-validation check requires fixture to reach it
The "selected option does not belong" check (migration 040, line 96-101) is the 5th guard in submit_quiz_answer, after: session ownership, session-ended, question-membership, and question-found. To reliably hit the option-validation check, the test fixture needs (a) an active session owned by the student, (b) a real question whose id is in the session's config.question_ids, and (c) a payload that is not a valid option id of that question. Plans that mention "assert /selected option does not belong/i" without specifying how this fixture is arranged will produce a test that hits an earlier guard (e.g., 'question does not belong to this session') and fails. Plans must specify the fixture setup explicitly.

### [2026-05-07] exam.started / exam.completed require start_exam_session RPC, not start_internal_exam_session
These two event types are emitted by the mock_exam flow (start_exam_session / batch_submit_quiz with mode='mock_exam'). Plans for audit-completeness tests that list these events without specifying which RPC to call risk the implementer using start_internal_exam_session (which emits internal_exam.started / internal_exam.completed). Plans must name the specific RPC for each event type.

### [2026-05-08] SECURITY DEFINER trigger bypass: current_role not always 'postgres'
Plans that add `current_role IN ('service_role', 'postgres')` bypass to a trigger assume the SECURITY DEFINER function owner is 'postgres'. In Supabase, the owner can be 'supabase_admin' or 'postgres' depending on how the function was created and the environment. Plans must make T1.1 (owner verification) a BLOCKER before writing the migration, not a runtime verification. If the plan defers this check to "during execution," it is an open risk that blocks implementation.

### [2026-05-08] mode CHECK constraint widened by later migration — plans must check full migration chain
Plans referencing quiz_sessions.mode values often cite mig 001 (3 modes: smart_review, quick_quiz, mock_exam). Migration 058 widened the CHECK to add 'internal_exam'. Plans for p_mode whitelists must grep all migrations for ALTER TABLE on quiz_sessions to find the current live constraint, not just mig 001.

### [2026-05-08] assertSessionStillLocked deep-equal breaks when new score columns are added to FROZEN_COLUMNS_SELECT but the session has non-null values after trigger extension
When FROZEN_COLUMNS_SELECT is extended to include correct_count, score_percentage, passed, ended_at, and these columns are initially NULL in the mock_exam baseline, assertSessionStillLocked() will compare NULL to NULL (safe). But if any attack test in the existing spec causes a legitimate completion RPC to run before the deep-equal check, the values become non-null and the baseline (captured pre-completion) mismatches. Plans must confirm no existing attack test triggers a completion RPC between baseline capture and assertSessionStillLocked().

### [2026-05-22] Same-table sequential queries cannot be differentiated with single mockFrom dispatch

When a production function calls `supabase.from('questions')` twice with different filters (e.g., once with `.eq('status', 'active')` for counts, once without for correct-response mapping), the single `mockFrom` dispatch pattern (keyed by table name only) returns the same `buildChain` value for both calls. Plans that propose tests requiring two calls to the same table to return different data MUST flag this limitation and either redesign the test or explicitly scope a `mockFromSequence`/call-order tracking conversion as in-scope work. First seen: issue #540 (`getDashboardData` questions count query vs. correct-mapping query). Related to the earlier [2026-04-11] pattern about multi-query parallel fetches — that pattern covered different tables; this covers the same table called sequentially with different filter semantics.

### [2026-05-22] Plans that add a field to a Supabase `.select()` string must also update the local type alias

When a production function uses a local `type QuestionRow = { ... }` cast and the plan adds a new column to `.select(...)`, the plan must also update the type alias. TypeScript does not enforce the cast against the runtime result, so the missing field is invisible until the refactored code references it, at which point `check-types` fails. First seen: issue #540 (`progress.ts` plan adding `status` to the questions query without updating `QuestionRow`). Applies to any file using local row-type aliases with `as SomeRow[]` casts.

### [2026-05-25] Component-level clamping of a raw aggregated field (answeredCorrectly) is inconsistent when the same raw field is passed straight through the type — fix must also clamp the display-string numerator in progress-content.tsx

When a bug produces `answeredCorrectly > totalQuestions` at the query layer, plans that clamp only `masteryPercentage` at the query level but also propose clamping the display numerator (`totalCorrect`) only in progress-content.tsx create a subtle contract inconsistency: the `answeredCorrectly` field in `SubjectDetail` and `SubjectProgress` still carries the raw (unclamped) value, which could mislead future callers who sum it (e.g. exam-readiness checks, future API serializers). Plans must decide: either (a) clamp `answeredCorrectly` at the query layer too, or (b) document explicitly that `answeredCorrectly` is intentionally raw and only `masteryPercentage` is clamped. A display-only clamp in the component is acceptable IF the plan acknowledges the raw value persists in the type and states it is intentional.

### [2026-05-25] progress.test.ts test at L257 asserts masteryPercentage === 100 for a draft-correct-only case — new clamp test must use a DIFFERENT scenario to produce overflow

The existing test "counts active and draft question responses separately at the topic level" (progress.test.ts L229) sets up 1 active + 1 draft question where the student answered the draft one. Since the draft response is credited to the topic (`answeredCorrectly = 1`) and `totalQuestions = 1` (active only), the ratio is exactly 1/1 = 100 — NOT an overflow. A plan that describes a new test as "1 active question, student answered 1 active + 1 draft = answeredCorrectly 2, totalQuestions 1 → assert 100" must confirm that the query layer produces answeredCorrectly = 2 (not 1) in that scenario. In progress.ts, `correctByTopic` counts all correct responses (active or draft) for questions whose topic_id is known; `tQuestions.length` counts only active ones. So 2 correct / 1 active = 200% unclamped — this IS a genuine overflow scenario and the new test is correct, but the test fixture must place both the active AND the draft question in the same topic and credit both as correct.

### [2026-05-25] Audit plans partitioned by directory rather than by file-ownership miss colocated query files in feature sub-routes
Admin sub-routes (admin/dashboard, admin/questions, admin/exam-config, admin/internal-exams, admin/syllabus) each have their own colocated `queries.ts` or `students/[id]/queries.ts` file that contains unpaginated reads. Plans that define Agent B as "admin/instructor route trees + their queries" without naming these colocated files explicitly have created a scope boundary that is ambiguous — an agent could interpret its scope as only the lib/queries/ directory and miss the colocated files.

### [2026-05-25] GDPR export path (collectUserData) is a distinct truncation zone not covered by any of the 4 standard zones
`lib/gdpr/collect-user-data.ts` performs unbounded reads on student_responses, quiz_sessions, fsrs_cards, audit_events, and quiz_session_answers (all without .limit()). It is called from settings/gdpr-actions.ts (student self-export) and admin/students/actions/export-student-data.ts (admin export). This file's pattern does not map naturally to any of the four zones (not lib/queries/, not admin/instructor routes per se, not actions.ts, not migrations) — it is a cross-cutting data export layer that audit plans consistently omit.

### [2026-05-25] dashboard-stats.ts .limit(10000) and .limit(5000) are explicit values above max_rows=1000 — they are effectively unbounded and must be flagged, not treated as SAFE-limited
Code that explicitly sets .limit(N) where N > 1000 is NOT protected by the limit; PostgREST's max_rows cap of 1000 overrides it. Plans that classify any .limit() as SAFE without checking whether N ≤ 1000 will produce false negatives. The literal text ".limit(10000)" in getStreakData and ".limit(5000)" in applyLastPracticed in dashboard-stats.ts are truncation vectors, not safeguards.

### [2026-05-26] Test mock pattern misreference: "add rpc mock per analytics.test.ts" drops from: mockFrom when the refactored function still calls .from()

`analytics.test.ts` omits `from: mockFrom` from the client mock because `analytics.ts` calls no `.from()` — it is all-RPC. When a plan says "add an rpc mock per analytics.test.ts:3-16" for a different test file (e.g., dashboard.test.ts, progress.test.ts), the implementer may copy the full mock block — which drops `from: mockFrom`. If the refactored production function still calls `.from()` for metadata reads (easa_subjects, easa_topics, questions), all those from()-dependent tests will throw "mockFrom is not a function." Plans must explicitly say "ADD the @/lib/supabase-rpc module mock; keep from: mockFrom in the existing client mock" rather than pointing to analytics.test.ts as the sole reference.

### [2026-05-26] questionsCallCount ordinal-tracking pattern must be removed when two sequential questions reads collapse to one

When a production function makes TWO calls to `supabase.from('questions')` sequentially and tests use a counter variable (`questionsCallCount`) to return different data on call 1 vs call 2, removing one of those calls (e.g., by moving aggregation to an RPC) invalidates the counter pattern. The test that relied on call 2 returning draft questions must be entirely rewritten — the second return value becomes unreachable. Plans that rewire mastery reads to an RPC and say "switch mock driver to mockRpc" must also explicitly list which tests use ordinal-counter patterns and how those counters are removed.

### [2026-05-26] dashboard.test.ts mockRpc is single-dispatch — upgrading from 1 to N RPCs requires per-fn-name dispatch but plan does not enumerate which existing tests break

`dashboard.test.ts` currently uses `mockRpc.mockResolvedValue(...)` (flat single return). When `getDashboardData` calls all 3 RPCs in parallel (get_student_mastery_stats + get_student_streak + get_student_last_practiced), every test that only sets one `mockResolvedValue` will return the same data for all three, causing tests that expect streak data from an RPC to receive mastery data instead. The plan says "dispatch by fn name (args[1]) across 3 RPCs" but does not enumerate which of the ~14 existing test blocks must be rewritten and exactly what each RPC mock must return. Without that enumeration the implementer will either miss some tests or produce tests that pass by accident.

### [2026-05-26] dashboard.test.ts streak tests supply data via student_responses mockFrom — those branches become dead after the refactor

Tests "computes current streak" (L321), "breaks streak on gap day" (L347), and "tracks best streak separately" (L372) in dashboard.test.ts all set streak-bearing `data` arrays inside the `student_responses` branch of mockFrom. After the refactor, `getStreakData` calls `get_student_streak` RPC — not `.from('student_responses')`. The `data` field in the student_responses mockFrom will be ignored (only `count` is used by getTotalAnswered/getQuestionsToday). These three tests will silently pass with whatever default mockRpc returns (currently `{ data: [], error: null }` → currentStreak: 0, bestStreak: 0), producing wrong assertions unless the tests are rewritten to supply streak data via mockRpc dispatch. The plan lists this as "remove dead questions branch" but does not name the three dead student_responses data arrays or state they must be converted to mockRpc entries.

### [2026-05-26] `.order('id')` tiebreak plans must verify every target table has an `id` column

Plans that add a universal `.order('id')` tiebreak across multiple tables for pagination stability must check each table's schema. `flagged_questions` (and its view `active_flagged_questions`) uses a composite primary key `(student_id, question_id)` — there is no `id` column. Calling `.order('id')` on that table produces a PostgREST 400 error at runtime. Plans must specify per-table ordering: use the primary key or a suitable timestamped column for tables without an `id` surrogate key. For the GDPR export case, `active_flagged_questions` should use `.order('flagged_at')`.

### [2026-05-26] Proxy-chain test mocks keyed by table name cannot distinguish count-head calls from range-data calls on the same table

When a `fetchAllRows` helper is introduced, each paginated table requires TWO calls to `supabase.from(table)`: one count (head=true) call and one or more range calls. The existing `buildSupabaseClient` mock in `collect-user-data.test.ts` uses a Proxy that returns a single pre-configured `{ data, error }` for any method chain on a given table. It cannot return `{ count: N, error: null }` for the count call and `{ data: [...], error: null }` for the range call. The plan acknowledges this, but MUST specify the exact `mockFromSequence` / call-order dispatch approach (matching `quiz-report-questions.test.ts` pattern) before the test rewrite is considered scoped. The existing `buildSupabaseClient` helper needs a full redesign — it cannot be extended incrementally.

### [2026-05-26] RPC test mocks: plan specifies client-object rpc mock but codebase canonical pattern is module mock

When a quiz.ts-style file imports `{ rpc }` from `@/lib/supabase-rpc` and the plan says "add `rpc: mockRpc` to the `{ auth, from }` client mock object", the test will technically function — the live `rpc()` helper calls `(supabase as unknown as { rpc: RpcFn }).rpc(fn, args)` internally, so a client-level `rpc` mock is reached. However, the established codebase pattern (dashboard-stats.test.ts) mocks `@/lib/supabase-rpc` as a separate `vi.mock()` call and keeps the client mock as `{ from: mockFrom }` only. Plans must specify the module mock approach (`vi.mock('@/lib/supabase-rpc', ...)`) rather than the client-object approach to maintain pattern consistency. Both work; the module mock is the convention. First seen: #668 instance 3 (quiz.ts count function refactor).

### [2026-05-26] Promise.all destructuring changes are implicit when helper returns unwrapped array

When a plan replaces one branch of a `Promise.all` with a private helper that returns an unwrapped array (not `{data: ...}`), the current destructuring `const [{ data: aData }, { data: bData }] = await Promise.all(...)` must change to `const [{ data: aData }, bData] = await Promise.all(...)`. Plans that describe the helper's return type but do not explicitly state the destructuring change leave implementers to infer it. For functions like `getSubjectsWithCounts` where the existing Promise.all destructures both arms as `{data: X}`, this must be called out explicitly. First seen: #668 instance 3 (quiz.ts refactor).

### [2026-05-27] STABLE + EXECUTE is a PostgreSQL hard error — dynamic-SQL RPCs must be VOLATILE

Plans that copy `STABLE` from a non-dynamic-SQL precedent RPC (like `get_admin_student_stats`) onto a new function that uses `RETURN QUERY EXECUTE` will produce a runtime error. PostgreSQL forbids EXECUTE inside STABLE/IMMUTABLE functions. The `get_session_reports` precedent (the correct model for dynamic-SQL RPCs) omits the stability modifier entirely (defaults to VOLATILE). Plans for new RPCs using `RETURN QUERY EXECUTE` must specify VOLATILE (or omit the keyword), never STABLE. First seen: #682 (`get_admin_dashboard_students` plan).

### [2026-05-27] §9 soft-delete-omission on admin RPCs needs explicit migration comment citing precedent

Plans for admin-facing SECURITY DEFINER RPCs that intentionally show soft-deleted rows (e.g. admin student roster showing inactive users) must include an inline SQL comment citing (a) the §9 rule, (b) why the omission is intentional (admin visibility of inactive records), and (c) the precedent RPC that established this pattern. Without this comment, the security auditor will flag the missing `deleted_at IS NULL` as a violation on every review cycle. The old `get_admin_student_stats` shipped without such a comment and was accepted — but the new RPC should be explicit.

### [2026-05-27] Test rewrite plans for RPC refactors that delete a `userId` opt must enumerate exact test blocks deleted vs. kept

When a function that takes a `userId` opt is replaced with a server-side RPC that uses `auth.uid()`, the test file for that function contains test blocks that (a) pass `userId: 'u1'` as an opt — these become TypeScript errors and must be listed as deleted, and (b) use multi-call `mockFrom` patterns to mock per-user filter reads — these also become dead and must be listed as deleted. Plans that say "rewrite X suites to mock `rpc`" without enumerating deleted vs. kept blocks leave the implementer unable to determine scope. Must also confirm whether `mockFrom` in `vi.hoisted()` is still needed by surviving functions in the same file. First seen: #668 instances #678/#679 (`getRandomQuestionIds` quiz.test.ts).

### [2026-05-27] Bail-logic removal in a Server Action changes test *assertions*, not just test *infrastructure*

When a plan removes a short-circuit bail (e.g., `hasTopics/hasSubtopics` check in `getFilteredCount`) and replaces it with SQL semantics, existing tests for the bail behavior have two outcomes: (a) same end result (count: 0), now via SQL path — these need only mock change; (b) DIFFERENT end result (previously bailed and returned 0, now queries and gets N > 0, OR previously returned N now returns 0 because `ANY([])` matches nothing). Plans must classify each bail-path test into category (a) or (b). Category (b) tests must be listed as "semantics-changing rewrites," not just "mock infra changes." First seen: #668 instances #678/#679 (`getFilteredCount` lookup.test.ts bail-logic describe block).

## Positive Signals

### [2026-04-09] Base UI data attribute names correctly verified
Plan correctly used `data-[panel-open]` for the Trigger (which matches `CollapsibleTriggerDataAttributes.panelOpen = "data-panel-open"`) and `data-[starting-style]`/`data-[ending-style]` for panel animation (which match `CollapsiblePanelDataAttributes.startingStyle/endingStyle`). These are real attributes confirmed in the Base UI 1.3.0 type definitions.

### [2026-04-09] Caller analysis accurate for single-file rewrite
Plan correctly identified quiz-config-form.tsx as the only production caller and verified props interface is unchanged. No missed callers in this case.

### [2026-04-28] E2E seed data requirements accurately analyzed
Plan correctly identified that `getExamEnabledSubjects()` returns `[]` in CI because it queries `exam_configs` table which has no rows from `seed-e2e.ts`. Correctly traced the data dependency chain: seed creates no exam config → query returns empty → button stays disabled. Also correctly identified that seed-e2e.ts seeds 21 questions under topic 050-01, which satisfies the planned distribution of 10 questions. Pattern matching from seed-exam-eval.ts EXAM_PLANS is accurate.
