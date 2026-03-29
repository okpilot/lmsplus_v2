# Learner Agent — Pattern Memory

## Issue Frequency

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Test fixture shape mismatch (wrong or missing field in fixture object) | 2 | 2026-03-13 | RULE CANDIDATE — first: missing `short` prop (2026-03-11); second: wrong SubjectOption shape in 6722e97; both caught pre-commit by type-check; test-writer patterns memory should note: always derive fixture shapes from the exported TypeScript type, not by hand |
| `possibly undefined` in test assertions | 1 | 2026-03-11 | Fixed — biome now allows `!` in test files |
| Missing vitest imports (beforeEach) | 1 | 2026-03-11 | Fixed — 3 test files missing import |
| External agent output invisible | 1 | 2026-03-11 | Fixed — Decision 20: agents now run as in-session subagents |
| Duplicate Next.js installs (Playwright) | 1 | 2026-03-11 | Fixed — excluded e2e/ from tsconfig, cast in proxy.ts |
| Pre-push hooks too slow for large diffs | 1 | 2026-03-11 | Fixed — diff cap + timeout + grep fallback |
| Hook file exceeding 80-line limit | 4 | 2026-03-13 | RULE EXISTS — 70-line watch added to code-reviewer memory (9f5a6cc); still recurring despite watch threshold; use-quiz-state.ts hit 117 lines in 741ae30 (4th occurrence); fix required hook split in 34a9352 |
| SQL score aggregation over full table (not current batch) | 1 | 2026-03-12 | Watch — batch_submit_quiz RPC; fixed in f53eccf |
| Array positional pairing instead of Map lookup (FSRS) | 1 | 2026-03-12 | RESOLVED — batch-submit.ts updateFsrsCards; fixed in f53eccf; entire FSRS TS layer removed in b41ffa8 — no active call sites remain |
| Empty-array guard missing at SQL level | 1 | 2026-03-12 | Watch — batch_submit_quiz RPC; fixed in f53eccf |
| New hook/utility file shipped without a test file | 3 | 2026-03-12 | RULE ADDED (9f5a6cc) — still recurring; rule exists but not followed at write time. See also row 58. |
| Top-level await in node16 package test file | 1 | 2026-03-12 | Watch — packages/db/src/server.test.ts; fixed with dynamic import helper |
| Bare `catch {}` without error-type narrowing | 1 | 2026-03-12 | Watch — packages/db/src/server.ts; suggestion from semantic-reviewer |
| `finally` clearing loading state during navigation | 1 | 2026-03-12 | Fixed in a269284 — only clear loading in catch/error branch |
| Supabase mutation result not destructured (error silently dropped) | 3 | 2026-03-12 | RULE EXISTS (code-style.md Section 5) — 5 new call sites found in Sprint 3 analytics cycle (db5d8ea); compliance gap, rule is clear |
| Unstable useEffect dependency (inline function prop) | 1 | 2026-03-12 | Watch — onTabChange in question-tabs.tsx; suggestion only, first occurrence |
| `vi.stubGlobal` without `vi.unstubAllGlobals` teardown in test | 1 | 2026-03-12 | Watch — use-quiz-navigation.test.ts; suggestion only, first occurrence |
| E2E test clicks UI without waiting for React state flush (race condition) | 1 | 2026-03-12 | Watch — quiz-flow.spec.ts + progress.spec.ts; fixed with progress-bar DOM gate |
| Broad E2E selector without accessible name / overly loose text match | 1 | 2026-03-12 | Watch — quiz-flow.spec.ts; fixed by scoping getByText and getByRole with name |
| Missing route entry in docs/plan.md route tree after new page added | 1 | 2026-03-12 | Watch — /app/quiz/report missing; fixed by doc-updater in same cycle |
| Concurrent session mutation without row-level lock (FOR UPDATE) | 1 | 2026-03-12 | Watch — batch_submit_quiz RPC; fixed in fe12342 with FOR UPDATE on session row |
| Partial-submission not rejected at RPC level | 1 | 2026-03-12 | Watch — batch_submit_quiz RPC; fixed in fe12342 with answer count mismatch guard |
| Import from Next.js internal module path instead of public API | 1 | 2026-03-12 | Watch — quiz-submit.ts AppRouterInstance; fixed in b312922 with ReturnType<typeof useRouter> |
| useEffect data fetching in client component (not hydration guard) | 3 | 2026-03-13 | RULE EXISTS (code-style.md Section 6) — 3rd occurrence: statistics-tab.tsx extracted to hook in 6722e97; rule exists, compliance gap |
| LANGUAGE sql instead of plpgsql for SECURITY DEFINER RPC | 1 | 2026-03-12 | Watch — Sprint 3 analytics RPCs (845923b); fixed migration 014 (86c8da4); single root introduction; plpgsql required for RAISE EXCEPTION; if second introduction occurs, add to security.md |
| ?? [] fallback applied after an explicit error guard (silent data loss path) | 1 | 2026-03-12 | Watch — subjects ?? [] in statistics-tab.tsx after null/error guard (845923b); fixed in 86c8da4; data is already known bad at that point, fallback hides the gap |
| Server Action shipped without Zod input validation | 1 | 2026-03-12 | Watch — fetch-stats.ts Server Action (845923b); fixed in 86c8da4; rule exists (security.md rule 4); compliance gap, not rule gap |
| Inconsistent guard between related RPCs (sibling RPC missing guard introduced in first) | 2 | 2026-03-14 | RULE CANDIDATE — first: auth.uid() identity guard missing from sibling analytics RPC (845923b → 7b824c2); second: NULL correct_option guard in migration 037 but missing from sibling migration 036 (83ae098 → 08abee0); both fixed in follow-up commits; when a guard is added to one RPC in a family, audit all siblings in the same commit |
| Partial fix applied to sibling file group (cross-cutting concern) | 4 | 2026-03-29 | RULE CANDIDATE (count 4 — action required) — first: auth error destructuring applied to 2 of 8 query files (2190dd5); second: PR4 getUser hardening missed quiz/session/page.tsx and discard.ts (83ae098); third: GDPR consent seeding updated in supabase.ts and 1 other helper but missed admin-supabase.ts ensureAdminTestUser() (consent commit, 2026-03-27), caught as CRITICAL by semantic-reviewer; fourth: e38ef8c fixed currentStreak "1 days" → "1 day" in stat-cards.tsx but left bestStreak with the same bug (same component, same line pattern) — caught as ISSUE by semantic-reviewer; fixed in ca09f34; all four required fix commits; root cause: the fix is scoped to the specific instance the author saw rather than to all instances of the same pattern in the file/component; the grep approach is required: when fixing a string formatting or grammatical pattern (singular/plural, casing, label text), grep the same file for all instances of the same pattern before committing; see Lessons entry 2026-03-29 |
| Auth error from getUser() not destructured in query file | 1 | 2026-03-12 | Watch — 7 of 8 query files under apps/web/lib/queries/ missing authError destructuring (2190dd5 → 3a0d1e6 → 78cb130); distinct from mutation error pattern (that is about .insert/.update/.delete); first occurrence as a named pattern |
| Auth error from getUser() swallowed without logging | 1 | 2026-03-12 | Watch — quiz-report.ts (78cb130); auth failure path returned early with no console.error; first occurrence; silent auth failure is harder to diagnose than silent mutation failure |
| Raw Supabase error message leaked to student UI | 1 | 2026-03-12 | Watch — load-session-questions.ts (78cb130); error.message from Supabase returned directly to student-facing caller; first occurrence; internal error strings must not be exposed to UI — return a generic message or error code |
| Unconditional setState in render body (spurious re-renders) | 1 | 2026-03-13 | Watch — statistics-tab.tsx (53efbdd); `setIsLoading(false)` called unconditionally in a render-path reset block, causing a state update on every render when isLoading was already false; fixed with `if (isLoading) setIsLoading(false)` guard in b555b50; first occurrence |
| useTransition + manual loading state hybrid fragility | 2 | 2026-03-13 | RULE CANDIDATE — statistics-tab.tsx (53efbdd, f0f8d0e); semantic-reviewer flagged this suggestion twice across two consecutive commits: isPending from useTransition and manual isLoading state tracked in parallel can both be false simultaneously during a question-switch mid-fetch, briefly showing the idle "Load Statistics" button while a fetch is still in-flight; generation counter mitigates stale data but does not close the UI-state race; suggestion-level only (not fixed); second occurrence reached — propose rule clarification in code-style.md when next commit arrives in this component's area; NOT flagged in 8863926 (pure JSX presenter refactor, no state logic touched) — no further action this cycle |
| Silent numeric fallback without observability logging | 2 | 2026-03-13 | RULE CANDIDATE — first: analytics.ts (53efbdd); `boundParam` silently clamped NaN/±Infinity without console.warn; suggestion-level; second: reports.ts (33c1fa8); `answeredCount` fell back to 0 for completed sessions with no answer rows with no console.warn — fixed in d06c25b; both share same root cause: a fallback that produces a valid-looking result with no server-side signal; the fix pattern is always a console.warn before the fallback value is returned; applies to any numeric computation that falls back to 0 or a minimum when the source data is empty/malformed |
| test-writer produces TS2532 (unchecked array index) errors | 3 | 2026-03-23 | RULE IN MEMORY (test-writer/patterns.md §Array index safety, count now 3) — third occurrence in 153a975 (session-table.test.tsx): test-writer accessed array elements without guarding against undefined, triggering TS2532; fixed with non-null assertion after length assertion; test-writer patterns.md already documents this rule at count 2; pattern persists despite documented rule — test-writer generates the wrong form first and requires a fix cycle; the rule is documented but the agent does not always apply it; no additional rule change needed — rule exists; the fix cycle remains a reliable gate |
| Shared hoisted mock capture without beforeEach reset | 1 | 2026-03-13 | Watch — activity-chart.test.tsx (8863926); capturedBarChartData shared across tests without reset allowed cross-test contamination; fixed with beforeEach reset; first occurrence |
| Direct SELECT from `questions` bypassing RPC (correct-answer exposure) | 2 | 2026-03-13 | RULE EXISTS (security.md rule 1, CLAUDE.md) — 2nd occurrence: checkAnswer in feat/post-sprint-3-polish directly queried questions table exposing `correct` flag; fixed in f6ba7a0 with check_quiz_answer RPC; rule is clear, compliance gap at authoring time |
| ON CONFLICT clause with no supporting UNIQUE constraint (dead code) | 1 | 2026-03-13 | Watch — student_responses (a09c6be); ON CONFLICT on (session_id, question_id) silently ignored because UNIQUE constraint was never created; fixed by adding UNIQUE constraint in migration; first occurrence |
| TOCTOU race on count-gated INSERT (read-then-write without lock) | 1 | 2026-03-13 | Watch — draft count check before inserting quiz_draft (feat/post-sprint-3-polish); concurrent requests could both pass the count check; fixed with DB trigger enforcing limit at DB level; first occurrence |
| Query missing student_id scope (returns wrong student's data) | 2 | 2026-03-15 | RULE CANDIDATE — first: getFilteredCount in feat/post-sprint-3-polish (2026-03-13); second: getQuizReport quiz_sessions query missing student_id scope (b46b0bf → 199e927, CRITICAL); both fixed; root cause: auth check (getUser) ≠ ownership scoping — queries on student-owned tables must always scope to student_id; distinct from RPC identity-guard pattern (that is SECURITY DEFINER param mismatch); propose security.md note on third occurrence |
| UI event handler missing re-entry guard (double-fire on fast interaction) | 2 | 2026-03-16 | RULE CANDIDATE — first: handleSelectAnswer async double-fire (2026-03-13, fixed with isSubmitting ref); second: finish-quiz-dialog Escape double-fire via DOM bubbling (4439640, fixed with unconditional stopPropagation); two different mechanisms (async lock vs. event propagation); common principle: any close/submit action must be audited for re-entry at authoring time |
| Server Action file exceeding 100-line limit after Biome auto-format | 1 | 2026-03-13 | Watch — draft.ts was 166 lines, split to 114+37 (6d274fa); the 114-line file still exceeds the 100-line Server Action limit; root cause: Biome expanded compact code from 97→114 lines during pre-commit format pass; authoring-time count ≠ post-format count; first occurrence of this specific mechanism (Biome expansion pushing over limit) |
| Biome auto-format expanding compact code past file-size limit | 1 | 2026-03-13 | Watch — draft.ts written at ~97 lines, Biome format expanded to 114 lines on pre-commit (6d274fa); the 100-line Server Action limit check must be done against post-format line count, not authoring-time count; first occurrence |
| Async fetch in useEffect without stale-result cancellation flag | 1 | 2026-03-13 | Watch — useEffect in draft.ts initiated fetch without cancelled flag; if the component unmounted or deps changed before the fetch resolved, setState was called on stale/unmounted context; fixed with cancelled flag pattern in fe4ffff; distinct from "useEffect data fetching in client component" (that is about banned server-action fetching — this is a permitted client fetch missing a cleanup guard); first occurrence |
| UPDATE returning zero rows treated as success (silent no-op) | 2 | 2026-03-20 | RULE CANDIDATE — first: draft update (6d274fa, 2026-03-13): draft ID did not match ownership, 0 rows updated, caller got success; second: deleteComment (6520962, 2026-03-20): DELETE with no app-layer ownership filter, wrong commentId or cross-user attempt returned `{ success: true }` silently; both fixed by selecting affected row or checking row count; fix pattern: for any DELETE or UPDATE that is ownership-scoped, add `.select('id')` (or equivalent) and check that at least one row was returned before returning success; code-style.md Section 5 covers error destructuring but not the zero-row no-op sub-case; second occurrence warrants note in code-style.md |
| Error path in existing function untested (count-error branch) | 3 | 2026-03-14 | RULE CANDIDATE (3rd occurrence) — count-error path in draft.ts (1st, 2026-03-13); users query error path in draft.ts (2nd, d06c25b); 'session not accessible' error branch in batch-submit.ts (3rd, d057128 → 45da072); all caught post-commit by test-writer; distinct from "new file without test" — this is an existing tested file with an uncovered error branch; pattern: when a new error-return path is added to an existing function (e.g., adding a second query with its own error check), the test file is not updated to cover the new branch; 3rd recurrence warrants action in test-writer patterns memory |
| Async cleanup path untestable in jsdom (cancelled flag branch) | 1 | 2026-03-13 | Watch — test-writer noted that the cancelled flag cleanup path (setState skipped after unmount) is not testable in jsdom because act() flushes effects synchronously before assertions can observe the cancelled state; analogous to the pre-hydration jsdom limitation; first occurrence; do not write tests for this branch — document the constraint in code-style.md jsdom section if it recurs |
| Stale closure introduced by hook split (scalar captured in closure vs ref) | 1 | 2026-03-13 | Watch — when use-quiz-state was split in 34a9352 to fix the 80-line violation, currentIndex was captured as a scalar in a closure in handleSave instead of being accessed via useRef; fixed in df5d354; the hook split itself introduced the bug; pattern: any value read inside a callback that is defined outside a React.useCallback/useMemo with that value in its deps array is at risk of being stale; when splitting a hook, audit all callbacks in the extracted portion for captured scalar state; first occurrence |
| SQL string comparison instead of ::uuid cast in duplicate check | 1 | 2026-03-13 | Watch — batch_submit_quiz duplicate-answer check compared option IDs as text rather than casting to ::uuid, which can cause case-sensitivity and format-variation failures; fixed in 34a9352; first occurrence |
| Type cast bypassing runtime validation (`as unknown as T` hiding missing guard) | 2 | 2026-03-13 | RULE ADDED (22c3d5e) — first: batch_submit_quiz malformed config cast (306f44a); second: check-answer.ts + fetch-explanation.ts (a0d9973); rule added to code-style.md Section 5 + .coderabbit.yaml synced; 274821b applied the rule correctly via isCheckAnswerRpcResult type guard |
| New hook/utility file extracted without shipping tests in the same commit | 7 | 2026-03-27 | RULE EXISTS (code-style.md Section 7) — use-answer-handler.ts (306f44a), use-session-state.ts (1b38542), score-color.ts + reports-utils.ts (b104ae4, ca55c3c), collect-user-data.ts (7eeff14/0bad818 GDPR PR3); seventh recurrence; rule is clear, authoring habit is not there; code-reviewer BLOCKING catch + test-writer fix remains the reliable gate |
| Imperative ref clear in catch block leaving re-entry window | 1 | 2026-03-13 | Watch — use-answer-handler.ts (306f44a): lockedRef.current.delete() in catch block cleared the lock before React state (answers) had settled, creating a brief window where a second call could enter; fixed in a0d9973 with useEffect drain keyed on answers; then partially reverted in 5b2864f (synchronous clear restored for immediate retryability, useEffect kept as safety drain); first occurrence of this specific async-lock re-entry window pattern |
| Derived value correct by coincidence (index used as count proxy) | 2 | 2026-03-13 | RULE CANDIDATE — first: SQL score aggregation over full table (not current batch) in batch_submit_quiz (f53eccf), where position-in-array was used as a proxy for "answered"; second: answeredCount derived as currentIndex + 1 in use-session-state.ts (675104e) — correct only because index is incremented at the same moment an answer is submitted, not because it semantically tracks "answers given"; fixed in 4798fdb with dedicated useState counter incremented in handleSubmit; both share root cause: a value that co-varies with the desired metric under normal conditions but diverges on edge cases (non-linear navigation, partial completion, session restore); propose note in code-style.md or agent memory: when a metric (count, score, progress) needs to be tracked, use a dedicated state variable incremented at the domain event, not a proxy derived from a structural position |
| Unbounded numeric regex permitting int overflow (SQL input validation) | 1 | 2026-03-13 | Watch — batch_submit_quiz RPC (274821b): `^\d+$` matched response_time_ms without an upper bound, permitting integer overflow when cast to INT; fixed in 34c9b36 with `^\d{1,10}$` (10 digits caps at 9,999,999,999, safely below INT_MAX); first occurrence; applies to any SQL regex that validates before casting to a bounded numeric type — the regex digit count must be bounded to match the target type's range |
| Case-sensitive UUID/text dedup in SQL (lower() missing) | 1 | 2026-03-13 | Watch — batch_submit_quiz duplicate-answer check (274821b): dedup compared `e->>'question_id'` text values without lowercasing; fixed in 34c9b36 with `lower(e->>'question_id')`; note: UUID format from standard generators is lowercase, so this is a defense-in-depth fix rather than a known live bug; first occurrence; distinct from "SQL string comparison instead of ::uuid cast" (that is about cast vs. text — this is about case normalisation before text comparison) |
| ARIA tab role missing on button-based tab UI | 1 | 2026-03-13 | Watch — QuizTabs (46113bf): buttons used as tabs lack role="tab", aria-selected, and enclosing role="tablist"; pre-existing gap, not introduced by the TabButton extraction; flagged by semantic-reviewer as a suggestion; if a second component is flagged for missing semantic ARIA tab attributes, add a note to code-style.md Section 2 (component rules) |
| Error message not updated after control flow change eliminates its code path | 1 | 2026-03-14 | Watch — batch_submit_quiz (d057128/ce35a31): original error message 'session not found or already completed' became inaccurate after the idempotent replay path was added (completed sessions no longer reach the error branch); caught by semantic-reviewer post-commit; fixed in ce35a31 with 'session not found or not accessible'; first occurrence; the root cause: when a control flow change eliminates a code path (e.g., converting an error to a replay), any error message that referenced that path by name must be updated in the same commit |
| FOR UPDATE lock scope wider than write path (read-only replay serialization) | 1 | 2026-03-14 | Watch — batch_submit_quiz (d057128): FOR UPDATE lock on session SELECT is held even during the idempotent read-only replay path, briefly serializing replay reads; flagged by semantic-reviewer; accepted as documented trade-off (prevents TOCTOU race on concurrent new submissions); comment added in ce35a31 explaining the trade-off explicitly; first occurrence; accepted pattern with required documentation — not a violation |
| consoleSpy created without try/finally cleanup (spy leaks on test failure) | 3 | 2026-03-14 | RULE ADDED TO TEST-WRITER MEMORY — 1st: start.test.ts + check-answer.test.ts (15ad393); 2nd: draft-delete.test.ts (cb0395c, newly created file); 3rd recurrence across different commits warrants update to test-writer patterns memory; always wrap consoleSpy in try { ... } finally { consoleSpy.mockRestore() } |
| RPC missing `AND deleted_at IS NULL` guard on session fetch | 1 | 2026-03-14 | Watch — complete_quiz_session and submit_quiz_answer both fetch a session row (SELECT ... WHERE id = p_session_id) without filtering soft-deleted sessions; a deleted session can be replayed or answered; first occurrence; test-writer flagged both RPCs in a1335ff post-commit; security.md rule 6 covers "never hard DELETE" but does not explicitly require session-fetch queries to exclude soft-deleted rows; if a second RPC ships without this guard, add explicit requirement to security.md: "session-fetch queries must always include AND deleted_at IS NULL" |
| Hard DELETE in test/spec cleanup code | 1 | 2026-03-14 | Watch — session-race-condition.spec.ts (a396438/a1335ff) used hard DELETE in a `afterAll` cleanup block instead of soft-delete; test code is exempt from the application-level soft-delete rule (it is seeding/cleanup, not student data), but for security-sensitive red-team specs the pattern of writing hard DELETEs is a habit that can accidentally propagate to production code; first occurrence; acceptable in test cleanup only — document the exception if flagged again |
| Red-team spec written against wrong schema column or RPC signature | 2 | 2026-03-14 | Watch — first: multiple specs in f278d5c used wrong column names (e.g. wrong foreign key column), wrong RPC parameter names, and wrong table names; second: a396438 + a1335ff required further alignment of RPC signatures and schema assertions; distinct from "test fixture shape mismatch" (that is TypeScript type mismatch — this is SQL/RPC API mismatch in Playwright E2E); both caught pre-merge by CI failures; root cause: red-team specs are written speculatively from memory of the schema rather than reading actual migration files; if a third spec ships with wrong schema references, add a rule to the red-team agent: always read the relevant migration file before writing DB assertions |
| Test spec encodes a security gap as a passing assertion | 1 | 2026-03-14 | Watch — session-race-condition.spec.ts (a1335ff) had a test that asserted the race condition response was acceptable/expected, effectively baking the security gap into the passing baseline rather than asserting the gap does not exist; semantic-reviewer flagged this as an ISSUE: a test that passes because it accepts wrong behavior is worse than a failing test; first occurrence; the correct form for a security spec is: assert the hardened behavior, fail if the unguarded path succeeds |
| Auth callback guard ordering error (guards run in wrong order, allowing bypass) | 2 | 2026-03-17 | RULE CANDIDATE — first (83ae098 → 08abee0, 2026-03-14): exchangeCodeForSession set session cookie before users-table check; if users check failed, signOut() was not called; second (5cc4109 → 47df5cf, 2026-03-17): recovery branch placed before profile-existence gate, allowing orphaned auth users to bypass not_registered check via password reset; both fixed in follow-up commits; root cause: multi-step auth callback branches are added without auditing the full ordering of guards; rule candidate: when any new branch is added to the auth callback, the ordering of all guards must be verified — session actions always precede existence/registration checks, and all post-session failure paths must call signOut() before redirecting |
| useMemo with empty deps used as stability guarantee (should be useRef) | 1 | 2026-03-14 | Watch — use-quiz-state.ts (1b38542 → fixed 9ea234b): initial fix used `useMemo(() => value, [])` to snapshot mount-time value; semantic-reviewer correctly flagged that useMemo is a performance hint whose result is not guaranteed stable in concurrent mode; correct tool is useRef; first occurrence; if a second component uses useMemo with empty deps to capture a mount-time constant, add a note to code-style.md Section 2 or 6 about the distinction |
| test-writer generates deprecated vi.fn generic syntax (two-arg form) | 2 | 2026-03-15 | RULE ADDED — first: use-session-state.test.ts (9ea234b, 2026-03-14); second: session-operations.test.ts (69273cf, 2026-03-15); both required orchestrator correction before type-check passed; correct form is `vi.fn<(arg: A) => R>()` (single function-type argument, Vitest v4); test-writer patterns.md updated with explicit rule and code examples; stale wrong-syntax example on line 238 also corrected |
| ZodError escaping Server Action with typed error return type (parse() without try/catch) | 1 | 2026-03-15 | Watch — checkAnswer called CheckAnswerSchema.parse(raw) without try/catch; ZodError propagated as unhandled exception instead of returning typed { success: false } response (199e927); fixed with try/catch returning typed error shape; first occurrence; distinct from "Server Action without Zod validation" (that is missing validation — this is validation present but exceptions escaping the return-type contract) |
| Supabase `.returns<T>()` causing forced intermediate type casts (`as string & keyof never`) | 1 | 2026-03-15 | Watch — PR #7 (b46b0bf) systematically removed `.returns<T>()` chains that caused `as string & keyof never` casts on query builder methods; fix pattern: drop `.returns<T>()`, execute query, cast result directly via `const typed = data as TargetType | null`; first occurrence of systematic cleanup; first occurrence of original antipattern being named |
| Non-redirect response in proxy.ts dropping refreshed session cookies | 1 | 2026-03-15 | Watch — proxy.ts admin 403 guard returned bare `new NextResponse(...)` bypassing `redirectWithCookies()` cookie-copy loop (6b49021); fixed in cebf441; any response after `getUser()` in proxy.ts must copy `response.cookies.getAll()` before returning; CRITICAL severity |
| Supabase query (SELECT) error silently swallowed in auth helper (distinct from mutation pattern) | 2 | 2026-03-15 | RULE CANDIDATE — first: getUser error ignored in Server Actions (83ae098, 2026-03-14); second: requireAdmin() profile SELECT discards `{ error }` (6b49021, 2026-03-15); both in auth-path helpers; fix: always destructure `{ data, error }` and log before guard decision; existing code-style.md rule covers mutations only — clarification extension proposed |
| Server-authoritative ordering value (sort_order) computed client-side and trusted on submission | 1 | 2026-03-15 | Watch — subject-row.tsx passed sort_order as prop to upsert Server Action; fixed in cebf441 by computing sort_order server-side from sibling count; first occurrence; applies to any derived ordering or position value that should reflect DB state at write time |
| `@ts-expect-error` for Supabase TypeScript inference depth limit on easa_* tables | 1 | 2026-03-15 | PARTIAL RESOLUTION (2026-03-16) — @supabase/ssr upgraded 0.5.0 → 0.9.0; fixed inference depth limit for quiz_drafts (draft-helpers.ts, 2 suppressions removed); easa_* tables (upsert-subject, upsert-subtopic, upsert-topic) still require suppressions on `.insert()` — TypeScript still cannot resolve the easa_* generated type chain to a non-never Insert type; suppressions are documented with JSDoc comment explaining the root cause; validated as still-needed by semantic-reviewer on 603b36c cycle (false positive rejected) |
| `.single()` used where no-row is a valid outcome (silently swallows PGRST116 error) | 1 | 2026-03-15 | Watch — seed-admin-eval.ts topic/subtopic lookups used `.single()` for rows that may legitimately not exist yet; `.single()` raises PGRST116 on zero rows and its error is swallowed if not explicitly checked; fixed in 4363a34 with `.maybeSingle()` which returns `{ data: null, error: null }` when no row is found; distinct from "Supabase mutation result not destructured" (that is about .insert/.update calls — this is about SELECT lookups where zero rows is an expected valid state); first occurrence |
| Duplicated fallback/error-handling code in same file that drifts out of sync | 1 | 2026-03-15 | Watch — security auditor script had two copies of the same grep fallback logic (timeout-fallback path and agent-failure path); they diverged silently; fixed in 4363a34 by extracting to a shared helper; first occurrence; root cause: copy-paste duplication in shell/TS scripts is harder to spot than in application code because scripts often have bespoke control flow with no shared abstraction layer |
| Migration-based consolidation (TS best-effort write moved to RPC for atomicity) | 1 | 2026-03-16 | Watch — migration 040 moved last_was_correct write from TypeScript try/catch into submit_quiz_answer RPC; first occurrence as a named pattern; prior examples: draft_count DB trigger, consecutive_correct_count in batch_submit_quiz; propose note in agent memory if a third TS best-effort post-RPC write appears |
| Behavioral gap silently fixed by migration (cross-path column population) | 1 | 2026-03-16 | Watch — migration 040 closed last_was_correct gap in single-answer mode; filter:incorrect was silently incomplete; fixed as side-effect of FSRS removal; implication: when a migration adds a write path for a column, check all query consumers that filter on that column across all write paths |
| Upstream named type used as structural approximation after library upgrade | 1 | 2026-03-16 | Watch — `Record<string, unknown>` used for `CookieOptions` in middleware.ts and server.ts; after @supabase/ssr upgrade to 0.9.0 the named type became available; fixed in 603b36c with correct import; first occurrence; apply: after any library upgrade, cross-check hand-rolled Record/structural types against the library's updated public exports |
| Zod error message pinned to exact internal text | 2 | 2026-03-16 | RULE CANDIDATE — first: cb0395c (2026-03-14) test file assertion pinned to Zod 3 internal string; second: 559bf9e Zod 3→4 migration — "Invalid uuid"→"Invalid UUID", "Required"→"Invalid input:…" changed in production source files; Zod internal messages are not public API; assert `error instanceof ZodError` or `.issues[0].code`, never `.message` text |
| Test fixtures using zeroed UUID format (`00000000-0000-0000-0000-*`) invalid under Zod 4 RFC 4122 enforcement | 1 | 2026-03-16 | Watch — 559bf9e: 27 test files required UUID constant replacements from `00000000-0000-0000-0000-*` to `00000000-0000-4000-a000-*`; Zod 4 validates version bits (nibble 13 must be 4–5) and variant bits (nibble 17 must be 8–b); also affected E2E sentinel UUIDs (5ad3c16); first occurrence; if new test file added with zeroed UUIDs, update test-writer memory with compliant constant form |
| `err.errors` property access silently undefined after Zod 4 removal (was Zod 3 alias for `.issues`) | 1 | 2026-03-16 | Watch — 559bf9e: two production source files accessed `.errors` on ZodError instances; Zod 4 removed the property (not deprecated); returns undefined, silently falls through to fallback strings; caught by pre-commit tsc gate; fix: use `.issues` throughout; first occurrence |
| Turbo type-check cache masking new compile errors after dependency bumps | 3 | 2026-03-17 | RULE APPLIED (CLAUDE.md) — first: PR #211 (@supabase/ssr, @supabase/supabase-js, vitest bumps); second: c5025f6 (commitlint 20, jsdom 29, @types/node 22 bumps); third: d9de1dd (vite 7→8, @vitejs/plugin-react 5→6); CLAUDE.md rule added after 2nd occurrence: "After any dep-bump commit, run `pnpm check-types --force` (bypasses turbo cache)"; 3rd occurrence confirms the rule was followed — ISSUE was pre-empted; rule is working; no further change needed |
| rolldown-vite RC bundled in @vitejs/plugin-react@6 | 1 | 2026-03-17 | Watch — d9de1dd: @vitejs/plugin-react@6 bundles rolldown-vite (Rust-based bundler) as an internal dep; RC status means breaking changes possible in minor bumps; no action needed now; first occurrence — log and watch |
| Undefined severity level used in agent rule (label not in agent's schema) | 1 | 2026-03-16 | Watch — b32d56a: new suppression condition 9 in security-auditor.md assigned "WARNING" severity; security-auditor schema defines only CRITICAL, HIGH, MEDIUM; undefined level has no blocking/non-blocking contract; pre-push hook cannot act on it; fixed in d6e8224 with MEDIUM; first occurrence; watch for agent edits that introduce severity labels without cross-checking the agent's own severity table |
| Agent suppression condition requiring out-of-diff artifact verification | 1 | 2026-03-16 | Watch — b32d56a: suppression condition required verifying RPC's SELECT list does not expose correct answers; RPC definition lives in a migration file not present in the diff; if the migration file is inaccessible, the agent must flag as HIGH rather than suppress; fixed in d6e8224 with explicit fallback instruction: "If the migration file is not accessible, flag as HIGH"; first occurrence; watch for suppression rules that require knowledge of artifacts outside the current diff |
| Agent file DO NOT section numbering collision with main checklist numbering | 1 | 2026-03-16 | Watch — b32d56a: new DO NOT item numbered "9" collided with checklist item "9" in HIGH section; non-contiguous DO NOT numbering (1,2,3,5,6,8,9) also pre-existed; fixed in d6e8224 (DO NOT renumbered 1-7) and 0f40bd6 (duplicate HIGH block removed, renumbered 11-15); first occurrence; watch for agent file edits that append to a numbered DO NOT section without checking for collisions with the main checklist |
| SECURITY DEFINER RPC input array not validated against caller-owned records | 1 | 2026-03-16 | Watch — f1f6c32/7029f4e (fix/45-remove-answer-keys-from-test): get_student_questions RPC accepted p_question_ids from caller without verifying those IDs belonged to the caller's session; fixed in 7029f4e/1f76a7b by deriving question set from session answers rather than trusting caller input; distinct from "Query missing student_id scope" (that is a missing WHERE clause on a SELECT — this is an RPC SECURITY DEFINER trusting a caller-supplied array without cross-checking ownership against session state); rule already in security.md covers auth.uid() identity check but not input array ownership validation; first occurrence |
| TypeScript type cast used as data-stripping mechanism (answer key exposure) | 1 | 2026-03-16 | Watch — f1f6c32 (fix/45-remove-answer-keys-from-test): correct field present on runtime object cast to QuestionForStudent type; TypeScript type does not exclude the field at runtime — only explicit SQL SELECT projection or object spread omitting the field strips it; directly violates security.md rule 1 (correct answers must be stripped server-side); fixed by moving answer-key stripping into the RPC SELECT list; distinct from "Type cast bypassing runtime validation" (that is about missing runtime guards on cast data — this is about using a type cast as a security boundary for data stripping, which provides zero runtime protection); first occurrence |
| RPC `.rpc()` call result not destructured for error (silent swallow on RPC failure) | 1 | 2026-03-16 | Watch — f1f6c32 (fix/45-remove-answer-keys-from-test): supabase.rpc() call result was not destructured for { error }; existing code-style.md Section 5 rule covers .insert/.update/.delete/.upsert mutations; .rpc() calls are semantically equivalent — any Supabase client call that can fail must destructure { data, error }; fixed in 7029f4e; first occurrence as a named gap in the rule's coverage; if a second .rpc() call ships without error destructuring, extend the code-style.md rule to explicitly list .rpc() alongside mutation methods |
| `NextResponse.redirect()` dropping cookies set via `cookies()` API in Route Handler | 1 | 2026-03-18 | Watch — 738eb43 (feat/174-login-redesign): verifyOtp wrote session cookies via Supabase cookies() API; NextResponse.redirect() does not carry those cookies to the browser — cookies set via the Next.js cookies() API only flow through responses built by the framework's own redirect() helper; fixed by switching to `redirect()` from `next/navigation`; applies to any Route Handler that mutates cookies (auth, session, etc.) and then redirects — always use next/navigation `redirect()` or copy cookies onto the NextResponse manually; first occurrence |
| `{{ .RedirectTo }}` in Supabase email templates passes full URL, not pathname | 1 | 2026-03-18 | Watch — 738eb43 (feat/174-login-redesign): Supabase passes the full absolute URL (e.g. `http://localhost:3000/auth/reset-password`) as the `next` query param when `{{ .RedirectTo }}` is used in email templates; if code naively appends this to a base URL, the full URL becomes a path segment and doubles the origin; fixed by extracting `.pathname` from a `new URL(next)` call before appending; applies to any code that reads a `next` param arriving from a Supabase email template redirect; first occurrence |
| Supabase `updateUser` returns 422 when new password matches current password | 1 | 2026-03-18 | Watch — 738eb43 (feat/174-login-redesign): E2E reset-password spec tried to reset to the same password the account already had; Supabase auth API returns HTTP 422 with no explicit error message, causing a confusing test failure; fixed by using a distinct password value in E2E tests and by handling 422 in the UI with a user-facing error message; applies to any E2E test covering the password reset flow — always reset to a value different from the current one; also applies to the reset-password UI, which should handle 422 distinctly from other errors; first occurrence |
| Open redirect via unvalidated `next` param in Route Handler | 1 | 2026-03-18 | Watch — ca5bbd5 (feat/174-login-redesign): /auth/confirm accepted any `next` query param and redirected to it without validation; a crafted link could redirect users to arbitrary internal paths (e.g. `/app/admin`); fixed by validating `next` against an explicit allowlist (only `/auth/reset-password` permitted); applies to any Route Handler or Server Action that reads a redirect target from query params or form input — always validate against an allowlist before redirecting; semantic-reviewer caught this as an ISSUE; first occurrence as a named pattern |
| Security fix requiring multiple rounds due to incomplete self-defending audit | 1 | 2026-03-16 | Watch — fix/45-remove-answer-keys-from-test (f1f6c32 → 7029f4e → 1f76a7b): branch required 3 semantic-reviewer rounds because each fix addressed the flagged issue but not the adjacent gap it exposed; round 1: correct field in runtime object; round 2: RPC not session-scoped; round 3: p_question_ids not validated against session; root cause: security fixes to SECURITY DEFINER RPCs were applied narrowly (one gap at a time) rather than with a full self-defending audit (ownership check, input validation, output projection, error handling all verified together); first occurrence; when any SECURITY DEFINER RPC is modified, audit all four axes before committing: (1) auth.uid() identity check present, (2) input arrays validated against owned records, (3) output SELECT excludes sensitive fields explicitly, (4) result destructured for error |
| Pre-existing file size violation surfaced when a new commit adds lines to an already-over-limit file | 1 | 2026-03-20 | Watch — d93f924 (fix: resolve 3 tech-debt issues): lookup.ts exceeded the 100-line Server Action/utility limit before the commit; the new commit added lines that made the violation visible to the code-reviewer; fixed by extracting helpers to lookup-helpers.ts in fix commit 5a68fa3; distinct from "Biome auto-format expanding compact code past file-size limit" (that is Biome pushing an at-limit file over; this is a file already over the limit that accumulates further lines); distinct from "Server Action file exceeding 100-line limit after Biome auto-format" (same distinction); root cause: file was never split when it first exceeded the limit; implication: code-reviewer should be run after any commit to files approaching their limit even if the commit itself is small — a near-miss in one commit becomes a BLOCKING in the next; first occurrence as a named pattern — log and watch |
| Function exceeding 30-line limit in Server Action file | 2 | 2026-03-20 | RULE CANDIDATE — first: getFilteredCount in lookup.ts (d93f924, 2026-03-20): 58 lines, fixed by extracting buildQuestionQuery helper; second: toggleFlag in flag.ts (6520962, 2026-03-20): 52 lines, fixed by extracting unflagQuestion/flagQuestion helpers; both in Server Action files, both caught post-commit by code-reviewer BLOCKING; root cause: Server Actions with branching logic (toggle/conditional paths) are written as a single function rather than as an orchestrator + focused helpers; pattern: any function with 2+ conditional branches in a Server Action is a candidate to exceed 30 lines — extract each branch as a named helper at authoring time; second occurrence across different commits — RULE CANDIDATE |
| Read-then-write race on flag/state mutation (UPDATE predicate not atomic) | 1 | 2026-03-20 | Watch — toggleFlag in flag.ts (6520962, 2026-03-20): SELECT to check current flag state followed by UPDATE or UPSERT; rapid toggle-toggle from two tabs could leave flag in wrong state; fixed by adding .is('deleted_at', null) to the UPDATE predicate to make the unflag atomic, plus row-count check; distinct from "TOCTOU race on count-gated INSERT" (that is an INSERT gate — this is a state-change UPDATE that should be conditional on current column state); fix pattern: for any UPDATE that modifies a boolean/state column, include the expected current column value in the WHERE/predicate to make the operation atomic; first occurrence — log and watch |
| Return discriminant (error field) threaded through hooks but never rendered in UI | 1 | 2026-03-20 | Watch — d93f924 (fix: resolve 3 tech-debt issues): authError was passed as a return value through multiple hook layers but never consumed in the component tree; users received no feedback on auth failures; fixed in 5a68fa3 by adding a session-expired message and disabling the Start Quiz button when authError is set; distinct from "Auth error from getUser() swallowed without logging" (that is an error not destructured at all — this is an error correctly threaded through hooks but dropped at the UI boundary); root cause: when adding a new error discriminant to a hook's return type, there is no mechanical check that the caller actually renders it; first occurrence — log and watch |
| Node Current release (non-LTS) pinned in CI configuration | 1 | 2026-03-20 | Watch — d93f924 (fix: resolve 3 tech-debt issues): CI was configured with Node 25, which is a Current (odd-numbered) release, not an LTS release; Node Current releases receive fewer months of support and are not production-stable; fixed in 5a68fa3 by reverting CI to Node 22 LTS; applies to any CI matrix or .nvmrc update — always use an even-numbered Node version (LTS); first occurrence — log and watch |
| Silent error drop on non-critical secondary query | 1 | 2026-03-21 | Watch — 29b441f/4e217d1 (feat/fix quiz results redesign #178): `getEasaSubjects()` error was ignored; the function returned an empty array and the component rendered with no subject labels, with no server-side log; fixed in 4e217d1 by adding `console.error` on the error path; distinct from "Supabase mutation result not destructured" (that is a missing `{ error }` destructure on .insert/.update — this is a SELECT error on a non-critical enrichment query that is destructured but the error branch silently falls through without logging); first occurrence — log and watch |
| Hardcoded hex colors in SVG component bypassing oklch design token system | 1 | 2026-03-21 | Watch — 29b441f (feat/quiz results redesign #178): `score-ring.tsx` SVG used hardcoded hex values (#3b82f6, #22c55e, #f59e0b, #ef4444) rather than CSS custom properties from the oklch theme; browser cannot retheme or dark-mode override these values; flagged by semantic-reviewer as a SUGGESTION; a threshold comment documenting the hex values as intentional for SVG compatibility was added in 4e217d1 as a mitigation; root cause: SVG stroke/fill do not inherit CSS vars when set as SVG attributes (only when set as CSS properties via `style=`); applies to any SVG component with color-bearing attributes — prefer `style={{ stroke: 'var(--color-...)' }}` or `className` with Tailwind; first occurrence — log and watch |
| test-writer generates vi.mock factory referencing mock variable not declared via vi.hoisted | 1 | 2026-03-20 | Watch — 7c5b6ca/f846d96 (fix: resolve 4 maintenance issues): test-writer generated subject-row.test.tsx with `mockToastSuccess` and `mockToastError` referenced inside `vi.mock('sonner', ...)` factory but declared as plain `const` above the factory rather than via `vi.hoisted()`; vi.mock factories are hoisted to the top of the file by Vitest at compile time, so any variable referenced inside them must also be hoisted via `vi.hoisted()` — otherwise the variable is `undefined` at factory execution time; the bug was caught by the test run, fixed before commit; distinct from "Shared hoisted mock capture without beforeEach reset" (that is about a hoisted variable not being reset — this is about a non-hoisted variable being used inside a factory); test-writer patterns.md should note: every mock variable referenced inside a vi.mock() factory MUST be declared via vi.hoisted(), not as a plain const; first occurrence — log and watch |
| E2E helper function copied from sibling loses return value contract | 1 | 2026-03-20 | Watch — 7c5b6ca/f846d96 (fix: resolve 4 maintenance issues / test: add subject-row tests): ensureLoginTestUser was modeled after ensureTestUser but was not updated to return { orgId, userId }; semantic-reviewer flagged the asymmetry as a suggestion; fixed in f846d96 by adding the return value; root cause: when a helper is added by copying a sibling, the copy may omit return values or contracts that the original developed over time but that the new function did not have at the time it was written; first occurrence — log and watch |
| Semantic-reviewer ISSUE on intentional staged delivery or intentional design decision | 1 | 2026-03-20 | Watch — bc1725a/3aa5a6b/fd40227 (feat/fix quiz: PR #177): two ISSUEs flagged by semantic-reviewer were false positives — (1) flaggedIds empty array flagged as a behavior gap but intentionally staged empty until PR 5 wires the data source; (2) current color on answered-but-not-visited questions flagged as "hides feedback" but intentional per Paper Design spec; both confirmed by orchestrator as intentional design decisions and dismissed; root cause: semantic-reviewer lacks context about multi-PR delivery plans and external design specs; mitigation: document intentional gaps (staged delivery, design-spec-driven choices) in a commit message note or inline code comment so the reviewer has in-diff context; first occurrence — log and watch |
| Test mock type becoming stale after production type refactor | 1 | 2026-03-20 | Watch — fd40227 (fix/quiz PR #177): a test mock used a stale type shape that no longer matched the production interface after a refactor in an adjacent commit; flagged by semantic-reviewer as a SUGGESTION; fixed in fd40227 before commit; distinct from "test fixture shape mismatch" (that is a wrong field in a fixture object used as test data — this is the type annotation on a mock itself being stale); first occurrence — log and watch |
| Misleading test name (test name contradicts actual assertion body) | 1 | 2026-03-21 | Watch — ca55c3c (fix/reports #179): a test name described a different behavior than the assertion it contained; semantic-reviewer flagged as an ISSUE (misleading passing tests give false confidence); fixed by aligning the name to the assertion; distinct from "implementation-named test" (that is a style issue — this is an active contradiction between name and assertion); first occurrence — log and watch; if it recurs, add note to test-writer patterns memory: verify each test name accurately describes the assertion's postcondition |
| Multiple anchor tags per table row pointing to same destination | 1 | 2026-03-21 | Watch — ca55c3c (fix/reports #179): session history table row rendered two <a> tags (text link + icon link) both pointing to the same detail URL; screen readers and keyboard users hit the same destination twice; fixed by consolidating to single link with aria-label; first occurrence — if a second component renders duplicate same-destination links in a repeated row, add accessibility note to code-style.md Section 2 |
| stopPropagation on nested Link inside row onClick without explanatory comment | 1 | 2026-03-23 | Watch — 281b05f (fix/reports): `<Link onClick={(e) => e.stopPropagation()}>` inside a `<tr onClick={navigate}>` lacked an inline comment explaining the call prevents the row-level navigation from firing twice; semantic-reviewer flagged as SUGGESTION; not fixed in this cycle (comment-only improvement); first occurrence — if a second component ships stopPropagation inside a delegated-click container without a comment, add note to code-style.md Section 2: stopPropagation in nested interactive elements must include a comment explaining which parent handler it blocks and why |
| Hook file exceeding 80-line limit | 5 | 2026-03-23 | RULE EXISTS — use-quiz-config.ts at 110 lines (57ec870/0bc21e6); 5th occurrence; fixed by extracting calcFilteredAvailable helper to topic-tree-helpers.ts; pattern persists despite 70-line watch threshold; root cause: hooks grow incrementally through feature additions, each addition individually small but cumulatively breaching the limit; no new rule needed — existing rule and watch threshold are correct; the post-commit code-reviewer gate remains the reliable catch |
| Async callback (refetch) not wrapped in useCallback causing redundant server calls | 1 | 2026-03-23 | Watch — use-quiz-config.ts (57ec870/0bc21e6): `fc.refetch` passed as a useEffect dependency without useCallback wrapping; new function reference on every render triggered unnecessary refetch calls; fixed by wrapping refetch in useCallback with [fc] dependency; semantic-reviewer caught as ISSUE; distinct from "Unstable useEffect dependency (inline function prop)" (that is a prop passed down — this is a hook method reference captured in useEffect deps); first occurrence — log and watch |
| ZodError escaping Server Action with typed error return type (parse() without try/catch or safeParse) | 2 | 2026-03-26 | RULE CANDIDATE — first: checkAnswer in 199e927 (2026-03-15): ZodError propagated as unhandled exception instead of returning typed { success: false }; second: settings actions.ts in 552bb2f (2026-03-26): `parse()` used instead of `safeParse()` — unhandled ZodError escapes the return-type contract on invalid input; both fixed by switching to try/catch-wrapped parse or safeParse with explicit error-path return; second occurrence across different commits — RULE CANDIDATE: Server Actions must use `Schema.safeParse()` (or wrap `.parse()` in try/catch) so that invalid input returns a typed error response rather than throwing an unhandled exception that breaks the caller's return-type contract |
| Sensitive auth operation (password change) implemented as direct client-side Supabase call instead of Server Action | 1 | 2026-03-26 | Watch — 552bb2f (feat/settings PR #368): `change-password-form.tsx` called `supabase.auth.updateUser()` directly from the client component; password changes must flow through Server Actions so the audit trail (audit_events insert) can be recorded server-side before the auth mutation commits; semantic-reviewer caught as CRITICAL; fixed in d9e1d10 by moving the call to a `changePassword` Server Action that inserts an audit event first; distinct from "Server-authoritative ordering value computed client-side" (that is a data value — this is a security-sensitive auth operation); first occurrence — log and watch; if a second auth mutation (email change, MFA toggle) ships as a client-side call, add a rule note: all auth.updateUser/admin calls must live in Server Actions, not client components |
| Soft-delete guard missing on org lookup in Server Action (SECURITY DEFINER exemption does not apply here) | 1 | 2026-03-26 | Watch — 552bb2f (feat/settings PR #368): profile update Server Action queried the `organizations` table with `.eq('id', orgId)` but no `.is('deleted_at', null)` filter; a deactivated org's data would still resolve, allowing students of a soft-deleted org to update their profiles; semantic-reviewer caught as ISSUE; fixed in d9e1d10 by adding the soft-delete filter; distinct from "RPC missing AND deleted_at IS NULL guard on session fetch" (that is inside a SECURITY DEFINER RPC — this is a direct Supabase client query in a Server Action where RLS is active but the row-level filter on the org's deleted_at is not enforced by the student's own RLS policy); first occurrence — log and watch; if a second Server Action ships an org/user lookup without a soft-delete filter, add a note to code-style.md Section 5: ownership-scoping queries on soft-deletable tables must include `.is('deleted_at', null)` |
| Hardcoded cookie/constant values in tests instead of importing source constants | 2 | 2026-03-27 | RULE CANDIDATE — first: proxy.test.ts (consent commit, 2026-03-27): hardcoded cookie name and value as string literals instead of importing from production module; second: actions.ts used hardcoded 'v1.0' string literal for CURRENT_ANALYTICS_VERSION instead of importing the constant (CodeRabbit PR #385 cycle, 227c976); and E2E helper supabase.ts used hardcoded 'v1.0' for TOS/privacy versions instead of importing CURRENT_TOS_VERSION and CURRENT_PRIVACY_VERSION (same cycle); root cause: when a constant is defined in a production module, test authors duplicate the literal value rather than importing the exported constant; when the constant is renamed or the value changes, the test continues to pass while silently testing stale data; both caught by semantic-reviewer as ISSUE-level findings; second occurrence across different commits — RULE CANDIDATE: test files must import production constants rather than duplicating literal values; add note to test-writer patterns memory |
| GRANT EXECUTE missing after CREATE OR REPLACE on SECURITY DEFINER RPC in migration | 1 | 2026-03-27 | Watch — migration 058 (44e305f/d0e5aed): `record_consent()` RPC was replaced with CREATE OR REPLACE but GRANT EXECUTE to authenticated was not re-stated; Postgres revokes execute rights when a function's owner changes via CREATE OR REPLACE; any authenticated call to the RPC would fail with permission denied; caught as ISSUE by semantic-reviewer post-commit; fixed in d0e5aed by appending GRANT EXECUTE after CREATE OR REPLACE; first occurrence — log and watch; if a second migration ships CREATE OR REPLACE on a SECURITY DEFINER function without a GRANT EXECUTE statement, add a rule note to security.md: "Every CREATE OR REPLACE of a SECURITY DEFINER function must be followed by GRANT EXECUTE ON FUNCTION ... TO authenticated" |
| E2E seed helper missing version filter (stale consent rows survive version bump) | 1 | 2026-03-27 | Watch (carry-forward suggestion — 4th consecutive cycle) — `ensureConsentRecords` in `apps/web/e2e/helpers/supabase.ts` checks for the existence of consent rows without filtering by `document_version`; after a version bump, the helper skips re-seeding because old-version rows are already present, leaving test users with stale consent records that fail the gate; flagged by semantic-reviewer as a SUGGESTION in cycles 227c976, b35a7c1, 44e305f (now 3 suggestion cycles + this 4th); not yet addressed; semantic-reviewer has flagged this 4 consecutive cycles; first entry into learner frequency table; this pattern crosses the "watch and log" threshold due to repetition frequency — GitHub issue should be created to track |
| Deep JSX nesting from repeated pattern (3x repetition causing 5-level nest) | 1 | 2026-03-27 | Watch — consent commit (2026-03-27): consent-form.tsx repeated a checkbox+label+description JSX pattern 3 times; each repetition added nesting depth, pushing the component to 5 levels (limit 3); caught as BLOCKING by code-reviewer; fixed by extracting ConsentCheckbox sub-component; distinct from "extract at 3 repetitions" rule (Section 2 applies at any nesting level — this is the specific case where the 3-repetition trigger coincides with a nesting-depth violation); first occurrence of this specific mechanism (repetition causing nesting violation) as a named pattern — log and watch; the existing "extract at 3 repetitions" rule in code-style.md Section 2 is the correct gate; no additional rule needed |
| RLS SELECT policy missing for student role on table read via RLS-scoped client in multi-client feature | 1 | 2026-03-27 | Watch — GDPR data export (7eeff14/0bad818): collect-user-data.ts used the anon/authenticated Supabase client to fetch audit_events for a student's own export; audit_events had no SELECT RLS policy for the authenticated role (admin-only by design), so the query silently returned empty data; caught as a valid ISSUE by semantic-reviewer post-commit; fixed in 0bad818 by adding a SELECT RLS policy scoped to auth.uid(); root cause: when a feature adds a code path that reads a table via the RLS-scoped client (not adminClient), each table in that path must be audited for an appropriate SELECT policy for the authenticated role — the fact that another path in the same feature uses adminClient does not guarantee the student-client path is covered; distinct from "Query missing student_id scope" (that is a missing WHERE clause — this is a missing RLS policy); distinct from "GRANT EXECUTE missing on SECURITY DEFINER RPC" (that is a function permission — this is a table row-level policy); Supabase returns 200 OK with empty data when RLS blocks a SELECT, making the gap silent at runtime (no error to destructure); first occurrence — log and watch |
| Semantic reviewer false positive due to wrong schema assumption (column existence) | 1 | 2026-03-27 | Watch — GDPR data export (7eeff14): semantic reviewer claimed quiz_sessions has no deleted_at column and flagged a `.is('deleted_at', null)` filter as dead code; the column was added in migration 023 and is present in the schema; the reviewer's scan missed an earlier migration file; confirmed false positive — no code change warranted; validated by checking migration 023 against the claim before acting; distinct from "Red-team spec written against wrong schema column" (that is spec authoring error — this is a reviewer making a wrong inference about the live schema); mitigation: before acting on any semantic-reviewer finding that claims a column or table does not exist, verify against the migration files directly; first occurrence as a named false positive type — log and watch |
| Decorative icon in interactive element missing aria-hidden | 1 | 2026-03-27 | Watch — report-question-row.tsx (539222e/10263b3): ChevronUp/ChevronDown lucide icons inside a button lacked aria-hidden; screen readers would announce "chevron up" alongside "Hide explanation" button text, creating redundant noise; caught by semantic-reviewer as a SUGGESTION; fixed in 10263b3 by adding aria-hidden to both icons; distinct from "ARIA tab role missing on button-based tab UI" (that is about missing structural ARIA roles — this is about decorative icons polluting the accessible name of their interactive parent); first occurrence — log and watch; if a second component ships decorative icons without aria-hidden inside buttons or links, add a note to code-style.md Section 2: decorative icons (lucide or SVG) inside interactive elements must always have aria-hidden |
| Generic alt text for contextual image (alt="Explanation illustration") | 1 | 2026-03-27 | Watch — report-question-row.tsx (539222e): ZoomableImage for explanation diagrams used alt="Explanation illustration" regardless of question content; the alt text should describe the specific diagram or be derived from the question context; caught by semantic-reviewer as a SUGGESTION; not fixed in this cycle (context-specific alt text would require passing description data through the data layer); first occurrence — log and watch; the fix path would be: add an explanation_image_alt column to the questions schema and propagate it through the quiz-report query |
| New test file shipped without vi.resetAllMocks() in beforeEach | 2 | 2026-03-27 | Watch — first: report-question-row.test.tsx (539222e/10263b3): test file written with mocks but missing beforeEach(() => { vi.resetAllMocks() }), allowing mock state to bleed between tests; caught by semantic-reviewer as a SUGGESTION; fixed in 10263b3 by adding beforeEach with the call; second occurrence — the rule exists in test-writer/patterns.md (§ Mock patterns) and the agent-test-writer.md rule file mandates vi.resetAllMocks() in beforeEach; the pattern persists at authoring time; the semantic-reviewer catch is the reliable gate; no additional rule change needed — rule is documented, compliance gap at generation time; distinct from "Shared hoisted mock capture without beforeEach reset" (that is a specific hoisted variable needing its own reset — this is the absence of the global vi.resetAllMocks() call entirely) |
| Supabase error mock shape wrong: `{data: [], error}` instead of `{data: null, error}` | 1 | 2026-03-28 | Watch — GDPR collect-user-data.test.ts (09e1be1): test mock helper returned `{ data: [], error: someError }` when simulating a Supabase query failure; real Supabase client always returns `{ data: null, error }` on failure — never `{ data: [], error }`; the wrong shape meant error-path tests were exercising code with a non-production input shape, making fallback assertions like `?? []` pass for the wrong reason; fixed in 09e1be1 by changing all error-path mock entries to `data: errors.xError ? null : actualData`; root cause: test authors write `data: []` as an intuitive "empty" value without checking the actual Supabase contract; the correct rule: a Supabase mock that returns a non-null error MUST set data to null, not to an empty array; first occurrence — log and watch; if a second test file ships with this pattern, update test-writer patterns.md with an explicit rule under the mock shape section |
| jsdom PointerEvent gaps (setPointerCapture not implemented, pageX not in PointerEventInit) | 1 | 2026-03-29 | Watch — use-drag-scroll.test.ts (ca09f34): test-writer initially generated PointerEvent dispatches without `pointerId` in the init dict, causing `setPointerCapture` to throw "not implemented"; and used `pageX` directly in `new PointerEvent(...)` init without `Object.defineProperty` (jsdom does not map pageX from init dict); fixed by: (1) always including `pointerId: 1` in PointerEvent init, (2) setting `pageX` via `Object.defineProperty(event, 'pageX', { value: N })` after construction; rule now in test-writer/patterns.md (§ Dispatching PointerEvents in jsdom); first occurrence in learner table — log and watch; if a second test file ships with the same jsdom PointerEvent gaps, no additional rule change needed (test-writer memory already updated) |
| test-writer generates tests requiring jsdom compatibility fixes before they pass | 3 | 2026-03-29 | RULE IN MEMORY (test-writer/patterns.md) — first (153a975): TS2532 unchecked array index; second (various): deprecated vi.fn generic syntax; third (ca09f34): PointerEvent jsdom gaps (setPointerCapture, pageX); all required a fix cycle before tests could be committed; the pattern is consistent: test-writer generates logically correct tests but hits jsdom API limitations or TypeScript strictness constraints that are not obvious at generation time; the fix cycle remains the reliable gate; test-writer/patterns.md is the correct place to document these constraints (already updated for each occurrence); no code-style.md rule change needed |

## Lessons Learned

### 2026-03-28 — GDPR data export fix commit (commit 09e1be1)

**Context:** Single-commit fix. 09e1be1 corrected Supabase error mock shapes in `collect-user-data.test.ts` and added a new test covering the `?? []` fallback for `quiz_answers` when phase-2 fires but the answers query returns null data. The fix was prompted by two semantic-reviewer SUGGESTIONs on earlier commits in this GDPR PR 3/3 cycle: (1) error mocks returned `{ data: [], error }` instead of the real Supabase shape `{ data: null, error }`; (2) the `?? []` null-fallback branch for `quiz_answers` was only exercised via the all-errors path, not via a targeted phase-2 scenario. Both suggestions were fixed and the fix commit was clean.

**Code reviewer:** 0 BLOCKING, 0 WARNING. Clean.

**Doc updater:** No changes needed. Clean.

**Semantic reviewer:** 0 CRITICAL, 0 ISSUE, 2 SUGGESTION (both fixed in 09e1be1).
1. **Error mocks returning `{ data: [], error }` — SUGGESTION, real, fixed.** `buildSupabaseClientWithErrors` returned `data: []` on error paths. Real Supabase always returns `data: null` when `error` is non-null. The wrong shape meant fallback logic was tested against a non-production input.
2. **`?? []` null fallback for quiz_answers not covered when phase-2 fires — SUGGESTION, real, fixed.** A dedicated test was added: sessions exist (phase-2 fires), answers query returns null data, result falls back to `[]`.

**Test writer:** Full coverage, no gaps.

**Pattern analysis:**

- **Supabase error mock shape wrong: `{data: [], error}` instead of `{data: null, error}` (NEW — count 1):** First occurrence of this pattern as a named entry. The correct Supabase client contract is: when `error` is non-null, `data` is always `null`. Test authors commonly write `data: []` as an intuitive "empty result" without checking the actual client contract. The wrong shape allows fallback logic like `?? []` to be exercised via a path that would never occur in production (real errors always produce null data, not empty arrays). Caught as a semantic-reviewer SUGGESTION and fixed in 09e1be1. First occurrence — log and watch. If a second test file ships with this pattern, update test-writer patterns.md with an explicit mock shape rule.

- **`?? []` fallback untested for the specific conditional code path that produces null data (adjacent to above, count 1):** The `quiz_answers` fallback was indirectly covered by the all-errors path but not by a targeted phase-2 scenario (sessions present, answers query fails). The fix added a dedicated test that exercises exactly this branch. This is a coverage precision issue: a fallback operator needs a test where the operand is null in the exact control-flow context where it appears. First occurrence — log and watch.

**Actions taken:**
- Frequency table: New watch row added for "Supabase error mock shape wrong: `{data: [], error}` instead of `{data: null, error}`" at count 1.

**No rule changes applied this cycle.** Both patterns are first occurrences. Rule change threshold requires 2+ occurrences across different commits.

**False positives:** None detected. Both suggestions were real gaps — the mock shape was wrong per the Supabase client contract and the fallback branch had a genuine coverage gap in the phase-2 scenario.

**Positive signals:**
- All agents clean on a test-only commit — gate is functioning correctly as a correction mechanism.
- Semantic-reviewer correctly identified a contract violation in test mocks (not just style) — demonstrating that review of test-only commits catches real correctness issues.
- Both suggestions were fixed in a single targeted commit with no residual findings.
- The mock-shape correction was systematic — all 8 table entries in the error helper were updated consistently in one pass.

---

### 2026-03-26 — Student profile & settings page (commits 552bb2f, d9e1d10)

**Context:** Two-commit sequence for issue #368 (student profile and settings page). 552bb2f introduced the settings page at `/app/settings`, profile-card, edit-name-form, change-password-form components, a `profile.ts` query module, a settings `actions.ts`, and an RLS migration (`20260326000056_users_self_update_rls.sql`). d9e1d10 was the fix commit: moved password change to a `changePassword` Server Action, added soft-delete filter on the org lookup, switched from `.parse()` to `.safeParse()`, and added 25 tests (219 lines in `profile.test.ts` + 268 lines in `actions.test.ts`).

**Code reviewer (commit 1 — 552bb2f):** 1 BLOCKING, 2 WARNING.
- BLOCKING: `profile.test.ts` missing — resolved by test-writer, not by a separate fix commit (test-writer wrote the test file in the same cycle).
- WARNING 1: Client-side auth pattern in `change-password-form.tsx` — component called `supabase.auth.updateUser()` directly. Flagged correctly, fixed in d9e1d10.
- WARNING 2: Component approaching size limit (change-password-form.tsx at 109 lines, limit 150). Not blocking; watch item.

**Semantic reviewer (commit 1 — 552bb2f):** 1 CRITICAL, 2 ISSUE, 3 SUGGESTION, 4 GOOD.
1. **Password change via client-side call — CRITICAL, real, fixed in d9e1d10.** `change-password-form.tsx` called `supabase.auth.updateUser()` directly from the client, bypassing the audit trail. A Server Action is required so the `audit_events` insert can be recorded before the auth mutation. Fixed by extracting `changePassword` Server Action that inserts audit event first.
2. **Soft-delete guard missing on org lookup — ISSUE, real, fixed in d9e1d10.** Profile update Server Action queried `organizations` with `.eq('id', orgId)` without `.is('deleted_at', null)`. A deactivated org would still resolve. Fixed by adding the soft-delete filter.
3. **`.parse()` instead of `.safeParse()` — ISSUE, real, fixed in d9e1d10.** `parse()` throws `ZodError` on invalid input, escaping the typed `{ success: false }` return contract. Switched to `safeParse()` with explicit error-path return.
4. **3 SUGGESTION items:** Minor naming, comment, and early-return style nits. All accepted or addressed.
5. **4 GOOD patterns:** Server Component data flow, co-located types, early-return guards, RLS migration structure.

**Doc updater:** `docs/database.md` updated with new RLS policy for `users` table self-update. `docs/plan.md` updated with #368 progress. Clean.

**Test writer:** 25 new tests written (profile.test.ts: 14 tests covering query module; actions.test.ts: 11 tests covering Server Actions). All passing.

**Pattern analysis:**

- **ZodError escaping via parse() instead of safeParse() (RECURRING — count now 2):** First occurrence was checkAnswer in 199e927 (2026-03-15); second is settings actions.ts in 552bb2f. Both are Server Actions where `.parse()` was used without a try/catch, allowing `ZodError` to propagate as an unhandled exception instead of returning a typed `{ success: false }`. Both fixed. Pattern is now RULE CANDIDATE. Proposed rule clarification: Server Actions must use `Schema.safeParse()` or wrap `.parse()` in a try/catch to guarantee that invalid input always returns a typed error response rather than throwing. This is a clarification to the existing "Zod validation" rule in security.md (rule 4), not a new rule.

- **Sensitive auth operation performed as direct client-side call (NEW — count 1):** Password change called `supabase.auth.updateUser()` from a client component. CRITICAL severity because it bypasses server-side audit trail. First occurrence of this specific pattern. Log and watch — if a second auth mutation (email change, MFA toggle, session invalidation) ships as a client-side call, propose a rule: all `auth.updateUser` and `admin.auth.*` calls must live in Server Actions.

- **Soft-delete guard missing on org/user lookup in Server Action (NEW — count 1):** Org lookup in profile update Server Action lacked `.is('deleted_at', null)`. First occurrence in a Server Action context (prior occurrences were in SECURITY DEFINER RPCs, which is a separate named pattern). Log and watch — if a second Server Action lookup on a soft-deletable table omits the filter, propose a code-style.md clarification.

**Actions taken:**
- Frequency table: "ZodError escaping Server Action with typed error return type (parse() without try/catch or safeParse)" updated from count 1 → 2, last-seen 2026-03-26, status RULE CANDIDATE.
- Frequency table: "Sensitive auth operation performed as direct client-side call" added at count 1, status WATCH.
- Frequency table: "Soft-delete guard missing on org lookup in Server Action" added at count 1, status WATCH.

**Recommended change (awaiting orchestrator action):**
- `docs/security.md` rule 4 — add a clarifying sentence: "Server Actions must use `Schema.safeParse()` or wrap `.parse()` in a try/catch; never call `.parse()` bare in a Server Action, as a thrown `ZodError` escapes the typed return contract." This is a clarification to the existing rule, not a new rule. The rule already says "parse input with Zod before using data" — this specifies which parse form to use.

**False positives:** None detected.

**Positive signals:**
- Both ISSUEs and the CRITICAL were real and fixed in the fix commit d9e1d10 — all findings acted on in the same session.
- Test writer produced 25 tests covering the query module and Server Actions, all passing, shipped in the same session.
- Doc updater correctly identified the new RLS policy as a `docs/database.md` update and kept the docs in sync.
- The fix commit d9e1d10 addressed all 3 non-trivial findings in a single pass with no residual findings.

---

### 2026-03-27 — Quiz result page improvement: collapsible explanations (commits 539222e, 10263b3, 7cf92ee)

**Context:** Three-commit sequence for issue #390 (collapsible explanations in quiz report). 539222e introduced the feature: added `explanationImageUrl` to the quiz-report query and type, replaced plain text explanation with a collapsible toggle per question row, rendered explanation content via `MarkdownText` and `ZoomableImage`, replaced inline SVG icons with lucide-react (Check, X, ChevronDown/Up), and updated 23 unit tests. 10263b3 was the fix commit: added `aria-hidden` to chevron icons, added `beforeEach(() => { vi.resetAllMocks() })` to the test file, and added 3 unit tests for the `explanationImageUrl` mapping. 7cf92ee added an E2E test for the explanation toggle to `quiz-flow.spec.ts`.

**Code reviewer:** 0 BLOCKING, 0 WARNING. Clean.

**Doc updater:** No changes needed. Clean.

**Semantic reviewer (commit 539222e):** 0 CRITICAL, 0 ISSUE, 3 SUGGESTION.
1. **Chevron icons missing aria-hidden — SUGGESTION, real, fixed in 10263b3.** ChevronUp/ChevronDown inside the toggle button lacked `aria-hidden`. Screen readers would announce the icon glyph name alongside the visible button text, producing redundant output ("Show explanation chevron down"). Fixed by adding `aria-hidden` to both icon renders.
2. **Missing `vi.resetAllMocks()` in beforeEach — SUGGESTION, real, fixed in 10263b3.** `report-question-row.test.tsx` had Supabase/component mocks set up at module scope but no `beforeEach(() => { vi.resetAllMocks() })` call. Mock state could bleed between test cases. Fixed by adding the beforeEach block (and importing `beforeEach` from vitest).
3. **Generic alt text on explanation image — SUGGESTION, not fixed.** `alt="Explanation illustration"` is static regardless of question content. A meaningful alt text would describe the specific diagram. Not fixed because the fix path requires a schema addition (explanation_image_alt column) and data pipeline work. Deferred.

**Test writer (commit 10263b3):** Added 3 tests to `quiz-report.test.ts` covering `explanationImageUrl` mapping: (1) maps URL when present, (2) sets null when field is null, (3) sets null when question not found in result. All passing.

**E2E (commit 7cf92ee):** Added explanation toggle section to quiz-flow.spec.ts (steps 9–9.c): verify toggle button visible, click to expand, verify panel visible, collapse again.

**Pattern analysis:**

- **Decorative icon in interactive element missing aria-hidden (NEW — count 1):** Lucide icon placed inside a button without `aria-hidden`. Caught as SUGGESTION by semantic-reviewer, fixed in the same session. First occurrence — log and watch. Rule change requires 2+ occurrences across different commits. The fix is always mechanical: add `aria-hidden` to the icon element.

- **Generic alt text for contextual image (NEW — count 1):** `alt="Explanation illustration"` is non-descriptive. Caught as SUGGESTION. Not fixed because the fix requires a schema change. First occurrence — log and watch. The path to fix is adding an `explanation_image_alt` column to the questions schema and propagating it through the quiz-report query.

- **New test file shipped without vi.resetAllMocks() in beforeEach (RECURRING — count now 2):** First occurrence was tracked as "Shared hoisted mock capture without beforeEach reset" (a different mechanism, same root: missing beforeEach reset). This is now named distinctly as the absence of the global `vi.resetAllMocks()` call. The rule exists in test-writer/patterns.md but is not consistently applied at generation time. The semantic-reviewer catch is the reliable gate. No rule change needed — rule is documented; compliance gap is at authoring time only.

**Actions taken:**
- Frequency table: Added "Decorative icon in interactive element missing aria-hidden" at count 1, status WATCH.
- Frequency table: Added "Generic alt text for contextual image" at count 1, status WATCH.
- Frequency table: Added "New test file shipped without vi.resetAllMocks() in beforeEach" at count 2 (this cycle + prior occurrence), status WATCH.

**No rule changes applied this cycle.** All three suggestions are first (or near-first) occurrences. The aria-hidden and alt-text patterns are first occurrences — rule change threshold requires 2+. The resetAllMocks absence has a documented rule in test-writer/patterns.md already; adding another rule would duplicate existing enforcement.

**False positives:** None detected. All three SUGGESTION findings were real and correctly classified.

**Positive signals:**
- Code reviewer produced 0 findings on a commit touching 4 files including a new component feature — mechanical discipline held.
- Doc updater clean — no documentation drift despite adding a new field to the quiz-report query and type.
- Test writer filled 3 gaps in `explanationImageUrl` mapping coverage in the fix commit — the query function's new field is now fully covered (present, null, missing).
- E2E test for the explanation toggle was added in the same PR cycle as the feature — not deferred to a later commit.
- All 3 SUGGESTION-level findings (two fixed, one deferred with clear rationale) were handled in a single fix commit — the review cycle was clean.

---

### 2026-03-23 — Dashboard/quiz fix + filter-topic decoupling (commits 57ec870, 0bc21e6)

**Context:** Two-commit sequence. 57ec870 fixed the calendar heatmap, redesigned stat cards, and decoupled filter counts from topic checkbox selection in the quiz config. 0bc21e6 was the fix commit addressing all post-commit agent findings: extracted `calcFilteredAvailable` helper to `topic-tree-helpers.ts`, wrapped `fc.refetch` in `useCallback`, and fixed a stale doc reference in `docs/manual-eval-175-179.md`.

**Code reviewer:** 1 BLOCKING.
- `use-quiz-config.ts` at 110 lines, exceeding the 80-line hook limit. Fixed in 0bc21e6 by extracting `calcFilteredAvailable` to `topic-tree-helpers.ts`, bringing `use-quiz-config.ts` to 68 lines.

**Doc updater:** No updates needed. Clean.

**Semantic reviewer:** 0 CRITICAL, 1 ISSUE, 3 SUGGESTION.
1. **fc.refetch not wrapped in useCallback — ISSUE, real, fixed in 0bc21e6.** `fc.refetch` was used as a `useEffect` dependency without being stabilised via `useCallback`. Because the hook method reference is recreated on every render, the effect re-ran on every parent render, generating redundant server calls. Fixed by wrapping in `useCallback` with `[fc]` as the dependency.
2. **Bail-early comment missing — SUGGESTION, fixed in 0bc21e6.** A bail-early condition in `use-filtered-count.ts` lacked an inline comment explaining the intent. Comment added.
3. **Stale doc reference — SUGGESTION, fixed in 0bc21e6.** `docs/manual-eval-175-179.md` had a stale reference to a section that no longer exists. Removed.
4. **Frozen `now` captured at module load — SUGGESTION, accepted without fix.** `Date.now()` captured at module-load time means the value is stale across long-lived sessions. Accepted as a deliberate design choice given the context; the suggestion is valid in principle but the trade-off is acceptable here.

**Test writer:** 22 new tests written, all passing.

**Pattern analysis:**

- **Hook file exceeding 80-line limit (RECURRING — count now 5):** This is the fifth occurrence across different commits (9f5a6cc, 741ae30, 34a9352, and now 57ec870). The pattern is persistent despite the 70-line watch threshold added to code-reviewer memory after the 4th occurrence. Root cause: hooks grow incrementally through feature additions, each step individually small but cumulatively breaching the limit. The current rule and watch threshold are correct — the post-commit code-reviewer BLOCKING gate reliably catches violations before push. No additional rule change warranted. The gate is functioning; the habit gap is at authoring time. This is the right balance between friction and enforcement.

- **Async callback not wrapped in useCallback (NEW — count 1):** `fc.refetch` used as a `useEffect` dependency without `useCallback`. First occurrence as a named pattern. Distinct from "Unstable useEffect dependency (inline function prop)" (that is a prop passed as a callback — this is a hook method reference captured in deps). First occurrence — log and watch. Rule change requires 2+ occurrences.

**Actions taken:**
- Frequency table: "Hook file exceeding 80-line limit" count updated from 4 to 5, last-seen updated to 2026-03-23.
- Frequency table: New watch row added for "Async callback not wrapped in useCallback" at count 1.

**No rule changes applied this cycle.** Hook limit violation is a recurring pattern but the existing rule is correct and the gate catches it reliably — no gap in the rule, only in authoring habit. The `useCallback` pattern is a first occurrence. Rule change threshold requires 2+ occurrences across different commits.

**False positives:** None detected. The "frozen now" SUGGESTION was accepted without fix — this is a deliberate trade-off, not a false positive. The semantic reviewer's characterisation of it as a concern is valid; the decision not to fix it is contextual.

**Positive signals:**
- Fix commit 0bc21e6 addressed all findings cleanly in a single pass — no residual findings after the fix cycle.
- Test writer produced 22 tests, all passing, covering the new hook split and filter logic.
- The hook extraction (`calcFilteredAvailable` to `topic-tree-helpers.ts`) was a clean split — the helper is small, named, and testable in isolation.
- Doc updater reported clean — no documentation drift from a non-trivial refactor touching 5 files.

---

### 2026-03-23 — CodeRabbit + SonarCloud fix commit (commit 281b05f + test commit 153a975)

**Context:** Two-commit sequence. 153a975 added `session-table.test.tsx` (18 tests covering rendering, color logic, keyboard navigation, link behavior). 281b05f addressed CodeRabbit and SonarCloud findings: keyboard a11y on `<tr>` (tabIndex + onKeyDown), focus-visible outline, `Readonly<>` on prop types (SonarCloud S6759), and flipped `!= null` ternaries to `== null` form (SonarCloud S7735).

**Code reviewer:** 0 BLOCKING, 0 WARNING. Clean.

**Doc updater:** No changes needed. Clean.

**Semantic reviewer:** 0 CRITICAL, 0 ISSUE, 2 SUGGESTION.

1. **stopPropagation without explanatory comment — SUGGESTION, not fixed.** `<Link onClick={(e) => e.stopPropagation()}>` inside a `<tr onClick={navigate}>` lacked an inline comment explaining which parent handler it prevents from firing. Technically correct; the comment would improve future readability. Not acted on (comment-only improvement, under-10-lines threshold not reached — this would be a 1-line inline comment addition that was judged not worth a fix commit). First occurrence of this specific gap.

2. **resetAllMocks concern — SUGGESTION, not acted on.** Reviewer noted that `vi.resetAllMocks()` in beforeEach resets all mock implementations, which requires any mock that returns a non-default value to be set up in each test or in beforeEach. The session-table test file already follows this pattern correctly (router mock setup inside describe block). Suggestion was informational; no change warranted.

**Test writer:** Wrote 18 tests for `session-table.tsx`. Tests had TS2532 errors (unchecked array index access — `rows[0].cells[0]` without guard). Fixed with non-null assertion after length assertion before commit.

**Pattern analysis:**

- **TS2532 unchecked array index (RECURRING — count now 3):** This is the third occurrence of the test-writer generating array index access without undefined guards. The rule is already documented in test-writer/patterns.md (§Array index safety) at "count 2, now a rule." The pattern persists: the test-writer generates the wrong form first, requiring a fix cycle before commit. The rule is documented and the fix is caught by the pre-commit type-check gate before any broken test enters git. The gate is functioning correctly. No additional rule change needed — the existing documented rule is the right response. The fix cycle (generate → type-check fails → fix → commit) is a reliable if slightly inefficient path.

- **stopPropagation without explanatory comment (NEW, count 1):** A `stopPropagation` call in a nested interactive element lacked an inline comment. First occurrence — log and watch. Rule change requires 2+ occurrences.

- **resetAllMocks suggestion (watch item, count 1):** Semantic-reviewer flagged a `vi.resetAllMocks()` usage as potentially problematic (would reset mock implementations). In this file, the setup is correct. This is a context-sensitive suggestion that requires per-file judgment. Log and watch — if test files start failing due to resetAllMocks clearing needed mock implementations, a note in test-writer patterns memory would be warranted.

**Actions taken:**
- Frequency table: TS2532 count updated to 3, last-seen updated to 2026-03-23.
- Frequency table: 2 new watch rows added (stopPropagation without comment; resetAllMocks suggestion).

**No rule changes applied this cycle.** TS2532 rule already documented in test-writer/patterns.md. New patterns are first occurrences. Rule change threshold requires 2+ occurrences across different commits.

**False positives:** The resetAllMocks SUGGESTION is borderline — the suggestion is technically correct advice in the general case but the specific usage in this test file is already correct. Logged as a watch item rather than a false positive because the advice is sound in principle.

**Positive signals:**
- Code reviewer and doc updater both clean — no mechanical drift from a refactor-focused commit touching 5 files.
- Semantic reviewer produced 0 issues — the a11y and SonarCloud fixes were applied cleanly without introducing new logic gaps.
- Test writer produced 18 tests covering rendering, color logic, keyboard navigation, and link behavior — meaningful behavioral coverage, not just smoke tests.
- TS2532 fix cycle was completed before commit — the type-check gate caught the issue and no broken test entered git.
- The `Readonly<>` prop type pattern (SonarCloud S6759) applied consistently to all 4 affected components in a single fix commit — cross-cutting fix applied completely in one pass.

---

### 2026-03-21 — Quiz results redesign (commits 29b441f, 4e217d1)

**Context:** Two-commit sequence for issue #178 (quiz results page redesign). 29b441f introduced three new components (`score-ring.tsx`, `result-summary.tsx`, `question-breakdown.tsx`), refactored `report-card.tsx` and `report-question-row.tsx`, updated `page.tsx`, and extended `quiz-report.ts`. 4e217d1 was a fix commit addressing semantic-reviewer findings and adding 39 new tests (score-ring: 14, result-summary: 14, question-breakdown: 11).

**Code reviewer:** 0 BLOCKING, 1 WARNING.
- Dual layout pattern in `result-summary.tsx` (mobile vs. desktop via parallel `hidden`/`flex` divs) flagged as a WARNING. Accepted as a standard responsive Tailwind pattern — not a code-style violation.

**Doc updater:** `docs/plan.md` updated with Sprint 7 section. `MEMORY.md` updated with session entry. Clean.

**Test writer:** 39 new tests across 3 files, all passing. No gaps found after 4e217d1.

**Semantic reviewer:** 0 CRITICAL, 1 ISSUE, 2 SUGGESTION, 6 GOOD.

1. **easa_subjects error silently dropped — ISSUE, real, fixed in 4e217d1.** `getEasaSubjects()` error was destructured but the error branch had no `console.error` call. On failure, the function returned an empty array silently — no server-side signal. Fixed by adding logging on the error path.

2. **Hardcoded hex colors in SVG bypass oklch theme — SUGGESTION.** `score-ring.tsx` used hardcoded hex values (`#3b82f6`, `#22c55e`, etc.) as SVG attribute values. SVG attributes do not inherit CSS custom properties, so the oklch design token system is bypassed. A threshold comment was added in 4e217d1 documenting the hex values as intentional for SVG attribute compatibility; full fix would require switching to `style={{ stroke: 'var(--color-...)' }}` or Tailwind `className`. Deferred — comment mitigation accepted for now.

3. **formatDuration negative guard missing — SUGGESTION, fixed in 4e217d1.** Duration utility did not guard against negative inputs. Guard added.

4. **Direct questions SELECT safety not documented — SUGGESTION, fixed in 4e217d1.** A SELECT from `questions` in the report query lacked an inline comment explaining it is a server-only admin-context read, not a student-facing exposure. Comment added.

**Pattern analysis:**

- **Silent error drop on non-critical secondary query** (NEW, count 1): `getEasaSubjects()` is an enrichment query — its failure degrades the UI but does not break the core report. The error path was silently swallowed (no log). This is distinct from "Supabase mutation result not destructured" (wrong method) and "Auth error from getUser() swallowed" (wrong layer). The pattern: when a non-critical query fails and the code falls back to a default value, there must still be a `console.error` call before the fallback so the failure is observable server-side. First occurrence — log and watch. Rule change requires 2+ occurrences.

- **Hardcoded hex colors in SVG bypassing oklch theme** (NEW, count 1): SVG attribute colors are not inherited from CSS custom properties — only inline `style` or class-based CSS picks up CSS vars. Using hardcoded hex values in SVG attributes is a silent design-system bypass. First occurrence — log and watch. Rule change requires 2+ occurrences.

**Actions taken:**
- Frequency table: 2 new watch rows added (silent error drop on non-critical secondary query; hardcoded hex in SVG attribute bypassing theme). Both at count 1 — log and watch, no rule changes.

**No rule changes applied this cycle.** Both new patterns are first occurrences. Rule change threshold requires 2+ occurrences across different commits.

**False positives:** none detected. The code-reviewer WARNING on dual layout was correctly characterised as acceptable (standard responsive pattern); it was not a false positive from the reviewer's perspective — it flagged something worth noting — but no action was warranted.

**Positive signals:**
- Code reviewer produced 0 BLOCKING on a commit adding 3 new components and touching 5 existing files — mechanical style discipline held across a large feature addition.
- Semantic reviewer's single ISSUE (easa_subjects silent error drop) was real, caught before push, fixed in the same session. Gate functioning correctly.
- Test writer produced 39 tests across 3 new components in one fix commit, all passing — comprehensive coverage shipped alongside the feature rather than being deferred.
- 6 GOOD patterns noted by semantic reviewer — positive signal that the new components follow established conventions (Server Component data flow, Tailwind responsive classes, co-located types, early-return guards).

---

### 2026-03-20 — Quiz PR #177 (commits bc1725a, 3aa5a6b, fd40227)

**Context:** Three-commit sequence for issue #177 (quiz session redesign). bc1725a added the `question_comments` table, flag/comment Server Actions, and RLS. 3aa5a6b added the full-screen session layout and color-coded question grid. fd40227 was a fix commit adding a layout comment and 12 unit tests for quiz-main-panel.

**Code reviewer:** 0 BLOCKING, 0 WARNING across all three commits. Clean.

**Doc updater:** `docs/plan.md` updated with PR #177 status. No other drift. Clean.

**Test writer:** 12 new tests written for `quiz-main-panel`. All passing. No gaps found after fd40227.

**Semantic reviewer (on 3aa5a6b):** 0 CRITICAL, 2 ISSUE, 2 SUGGESTION. Both ISSUEs were false positives. Both SUGGESTIONs were fixed in fd40227.

1. **flaggedIds empty array — FALSE POSITIVE ISSUE.** Reviewer flagged `flaggedIds` as always empty, suggesting a behavior gap. This is intentional staged delivery — the data source is wired in PR 5. The empty array is correct for the current PR scope.

2. **Current color hides question feedback — FALSE POSITIVE ISSUE.** Reviewer flagged that the "current" color on an answered-but-not-visited question obscures the answered/unanswered distinction. This is intentional per the Paper Design spec — the color scheme exactly matches the agreed external design document. No code change warranted.

3. **Stale mock type — SUGGESTION, fixed.** A test mock's type annotation no longer matched the production interface after a refactor in an adjacent commit. Fixed in fd40227 before commit.

4. **Layout comment missing — SUGGESTION, fixed.** A non-obvious layout choice lacked an explanatory comment. Added in fd40227.

**Pattern analysis:**

- **Semantic-reviewer ISSUE on intentional staged delivery or design decision** (NEW, count 1): reviewer issued two ISSUEs that were both valid concerns in isolation but were intentional by design — one is a multi-PR staged delivery gap, the other is a deliberate design-spec match. The reviewer has no visibility into multi-PR delivery plans or external design docs. Mitigation without rule change: add a brief inline comment in the code or a commit message note when an apparent gap is intentional — this gives the reviewer in-diff context on the next cycle and may self-resolve the false positive. First occurrence — log and watch. No rule change at count 1.

- **Test mock type becoming stale after production type refactor** (NEW, count 1): test mock type annotation drifted from production type after a refactor. Caught by semantic-reviewer as a SUGGESTION and fixed in the same cycle before commit. Distinct from test fixture shape mismatch (wrong field values vs. wrong type annotation). First occurrence — log and watch.

**Actions taken:**
- Frequency table: 2 new watch rows added (semantic-reviewer ISSUE on intentional design/staged delivery; stale mock type annotation). Both at count 1 — log and watch, no rule changes.

**No rule changes applied this cycle.** Both patterns are first occurrences. Rule change threshold requires 2+ occurrences across different commits.

**False positives:** 2 detected. Both semantic-reviewer ISSUEs were confirmed false positives — intentional staged delivery (flaggedIds) and intentional design-spec match (color scheme). This is the first cycle where confirmed false positives appeared at ISSUE severity. Worth tracking: if semantic-reviewer false-positive rate at ISSUE level increases, consider adding in-diff comment conventions for intentional gaps.

**Positive signals:**
- Code reviewer clean across all three commits — no mechanical violations in a large new-feature cycle including a new DB migration, Server Actions, and complex UI layout.
- Test writer added 12 meaningful tests for quiz-main-panel — coverage added in the same session, not deferred.
- Both SUGGESTIONs from semantic-reviewer were real and fixed in the same session before any push — suggestion-level gate functioning correctly.
- The fix commit fd40227 is minimal and focused (layout comment + tests only) — clean separation between feature and polish.
- False positives were correctly identified and dismissed by the orchestrator without jumping to fix non-existent issues. Validate-before-fixing protocol held.

---

### 2026-03-20 — Maintenance fixes + subject-row tests (commits 7c5b6ca, f846d96)

**Context:** Two-commit session. Commit 1 (7c5b6ca) resolved 4 maintenance issues: aria-labels on expand/collapse buttons (#273), filteredCount branch coverage in topic-row tests (#282), trivially-passing assertion fix in quiz-config-form tests (#280), and org-mismatch handling in ensureLoginTestUser E2E helper (#266). Commit 2 (f846d96) added 15 unit tests for the admin SubjectRow component plus the return value fix to ensureLoginTestUser.

**Commit 1 (7c5b6ca) — fix: resolve 4 maintenance issues**

**Code reviewer:** 0 BLOCKING, 0 WARNING. Clean.

**Doc updater:** No updates needed. Clean.

**Test writer:** subject-row.test.tsx was missing (SubjectRow component had no tests). Test writer generated the file. Found a vi.hoisted bug during generation — sonner toast mocks were declared as plain `const` variables above `vi.mock('sonner', ...)` rather than via `vi.hoisted()`; at factory execution time the variables were `undefined`. Bug caught by the test run before commit. Fixed before f846d96 was committed.

**Semantic reviewer:** 0 CRITICAL, 0 ISSUE. 2 SUGGESTIONS.
1. **ensureLoginTestUser missing return value** — SUGGESTION. ensureTestUser returns `{ orgId, userId }` but ensureLoginTestUser did not; callers could not use the helper's resolved identifiers. Fixed in f846d96 by adding the return statement.
2. **subtopic-row edit mode note** — SUGGESTION about a note-only observation in the diff. No action required.

**Commit 2 (f846d96) — test: add subject-row tests and return value to ensureLoginTestUser**

**Code reviewer:** 0 BLOCKING, 0 WARNING. Clean.

**Doc updater:** No updates needed. Clean.

**Test writer:** New test file, no further gaps.

**Semantic reviewer:** No new findings on the test-only commit.

**Pattern analysis:**

- **test-writer generates vi.mock factory referencing non-hoisted variable** (NEW, count 1): test-writer emitted mock variables as plain `const` above `vi.mock()` factory rather than wrapping them in `vi.hoisted()`. This is a known Vitest requirement (factory is hoisted by compiler, non-hoisted variables are undefined at factory time). The existing test-writer patterns.md documents `vi.hoisted()` usage correctly for the success path but the generated code for a new module (sonner) did not apply it. Bug caught by test run, fixed before commit — gate held. First occurrence as a named generation failure — log and watch. If it recurs, update test-writer patterns.md with an explicit "always use vi.hoisted for ANY variable referenced inside a vi.mock factory" callout as the top rule in the vi.hoisted section.

- **E2E helper function copied from sibling loses return value contract** (NEW, count 1): ensureLoginTestUser was modeled after ensureTestUser but did not return `{ orgId, userId }`. When a helper evolves to return a richer value and a sibling helper is written from an earlier snapshot of it, the sibling silently lacks the richer contract. First occurrence — log and watch.

**Actions taken:**
- Frequency table: 2 new watch rows added (vi.mock factory referencing non-hoisted variable; E2E helper sibling missing return contract). Both at count 1 — log and watch, no rule changes.

**No rule changes applied this cycle.** Both patterns are first occurrences. Rule change threshold requires 2+ occurrences across different commits.

**False positives:** none detected.

**Positive signals:**
- Code reviewer clean on both commits — no style regressions from the maintenance batch.
- test-writer's own test run caught the vi.hoisted bug before the file was committed. The test execution gate functioned as designed.
- Semantic reviewer correctly identified the ensureLoginTestUser return-value asymmetry as a suggestion (not an ISSUE) — severity was accurately calibrated.
- Both commits are minimal, focused, and passed all agent checks without requiring fix commits.

---

### 2026-03-20 — Tech-debt fix + post-commit findings (commits d93f924, 5a68fa3)

**Context:** Tech-debt batch fixing issues #305 (lookup.ts refactor), #304 (authError wiring), and #250 (Node version alignment). The original commit (d93f924) triggered post-commit agents. Three findings required a fix commit (5a68fa3).

**Code reviewer:** 2 BLOCKING.
1. **lookup.ts exceeded 100-line utility limit** — file was already over-limit before this commit; adding lines triggered the BLOCKING. Fixed by extracting helpers to `lookup-helpers.ts` in 5a68fa3.
2. **getFilteredCount was 58 lines** — function body exceeded the 30-line function limit. Resolved as part of the helper extraction above.

**Doc updater:** No changes needed. Clean.

**Test writer:** 3 gaps found and filled — `isPending` after auth error, stale auth error guard, `authError` passthrough in `useQuizConfig`. All tests written and passing.

**Semantic reviewer:** 1 ISSUE, 3 SUGGESTIONS.
1. **authError threaded through hooks but never rendered in UI — ISSUE, real, fixed in 5a68fa3.** `authError` was a return value on `useQuizConfig` but no component consumed it; auth failures were silent to the user. Fixed by adding a session-expired message and disabling Start Quiz when `authError` is set.
2. **catch swallowing errors silently** — SUGGESTION, deferred. Single occurrence, suggestion-level.
3. **Node 25 (Current) in CI** — SUGGESTION that became a clear fix: Node 25 is non-LTS; CI reverted to Node 22 LTS in 5a68fa3. Treated as a fix, not a deferral.

**Pattern analysis:**

- **Pre-existing file size violation surfaced by new commit** (NEW, count 1): lookup.ts was already over the limit. New commits that add lines to already-over-limit files expose the violation. Distinct from Biome-expansion mechanism. First occurrence — log and watch.
- **Return discriminant threaded through hooks, dropped at UI boundary** (NEW, count 1): authError was correctly threaded but never rendered. No mechanical gate exists to catch this. First occurrence — log and watch.
- **Node Current release pinned in CI** (NEW, count 1): Node 25 is a Current (odd) release, not LTS. Should always use even-numbered LTS. First occurrence — log and watch.

**Actions taken:**
- Frequency table: 3 new watch rows added (pre-existing file size violation surfaced, return discriminant dropped at UI boundary, Node Current in CI). All at count 1 — log and watch, no rule changes.

**No rule changes applied this cycle.** All three patterns are first occurrences. Rule change threshold requires 2+ occurrences across different commits.

**False positives:** none detected.

**Positive signals:**
- Code reviewer correctly caught 2 BLOCKING findings (file size + function length) in the first pass. Gate functioning correctly.
- Semantic reviewer caught the authError UI gap as an ISSUE — real, not a false positive. Fix was clean.
- Test writer found 3 meaningful behavioral gaps (isPending after auth error, stale auth error guard, authError passthrough) — coverage added in the same session.
- Fix commit 5a68fa3 addressed all agent findings in a single commit. No deferred work.

---

### 2026-03-18 — feat/174-login-redesign fix cycle (commit 610e358)

**Context:** Post-CodeRabbit fix commit on PR #262. Extracted `ResetSuccess` sub-component from `reset-password-form.tsx` (to get the file under the 150-line component limit) and fixed a markdown blank-line issue in `decisions.md`. Three source files changed: reset-password-form.tsx (shrunk by 17 lines), new reset-success.tsx (15 lines), decisions.md (+1 line).

**Code reviewer:** 0 BLOCKING, 0 WARNING. Clean.

**Doc updater:** No documentation updates needed. Clean.

**Test writer:** No new tests needed. Existing `reset-password-form.test.tsx` covers `ResetSuccess` via the integration test path (the parent form test renders the component end-to-end including the success state). Clean.

**Semantic reviewer:** 0 CRITICAL, 0 ISSUE. 1 SUGGESTION — recovery cookie may linger if the user closes the browser on the success screen without clicking the login link. Non-blocking and suggestion-level only; the cookie is short-lived (session-scoped) and the reset-password page already gates behind it. No action required.

**Pattern analysis:**

No new patterns. No frequency table rows updated. The component-split extraction is the expected mechanical fix for a file-size violation — code-reviewer caught the limit approach, CodeRabbit flagged it externally, and the fix commit is clean on all four agents on the first pass. This is the system working correctly.

One observation worth noting: the `ResetSuccess` extraction was driven by an external CodeRabbit finding rather than being caught by the internal code-reviewer at the time of the original commit. The original commit's file sat within the 150-line limit at authoring time but the reviewer rounds (fixes, formatting) pushed it over. This is the same mechanism as "Biome auto-format expanding compact code past file-size limit" (row 50) — post-authoring transformations (here: successive small edits across a review cycle rather than Biome formatting) can push a file over its limit in a way that is invisible at authoring time. Count for that pattern does not increase (different mechanism: incremental edits vs. Biome format pass) but the shared root cause is worth noting.

**Actions taken:**
- No frequency table changes. All findings are clean or single-occurrence patterns already logged.
- Suggestion about lingering recovery cookie logged in this lesson entry. Not a new frequency table row — it is a suggestion-level finding, not a repeat of an existing pattern, and the risk is bounded by cookie lifetime.

**No rule changes applied this cycle.** All agents clean on first pass. System is working as designed.

**False positives:** none.

**Positive signals:**
- All four agents clean on a fix commit — the mechanical extraction of a sub-component is a well-understood, low-risk refactor. Pipeline correctly produced no noise.
- Test-writer correctly identified that the existing integration test covers the extracted component without needing a new test file. This avoids a duplicate-coverage antipattern.
- The recovery cookie suggestion from semantic-reviewer is correctly categorised as suggestion-level (not ISSUE): the risk is bounded, the UX path is short-lived, and the existing gate already prevents re-entry. No false negative in the reviewer's severity assignment.

---

### 2026-03-18 — feat/174-login-redesign (commits ce47d5b, 738eb43, ca5bbd5, 11a36af)

**Context:** Login page redesign + PKCE-based password reset flow. New /auth/confirm Route Handler (OTP verification + redirect). Supabase email template updated to pass `{{ .RedirectTo }}`. E2E spec added for full password reset flow.

**Code reviewer:** clean — 0 blocking, 0 warnings across all commits.

**Doc updater:** decisions.md (Decision 29 added), security.md (open redirect prevention noted), plan.md (progress updated). All committed in 11a36af. No drift.

**Test writer:** comprehensive — 7 unit tests for confirm route, 6 for forgot-password form, 6 for reset-password form, 8 for callback, 6 for page, 5 E2E tests for full password reset flow. No gaps found.

**Semantic reviewer:** 0 CRITICAL, 3 ISSUE, 2 SUGGESTION, 5 GOOD. All 3 ISSUEs were real. Two of the three ISSUEs are the same root cause (URL handling) described from different angles; they share one fix commit (738eb43).

1. **Open redirect via unvalidated `next` param — ISSUE, real, fixed in ca5bbd5.** /auth/confirm accepted any value in the `next` query param and redirected to it without validation. A crafted PKCE confirmation link could silently redirect users to unintended internal paths. Fixed by validating `next` against an explicit allowlist. First occurrence as a named pattern — log and watch.

2. **Full URL doubling when `{{ .RedirectTo }}` passes absolute URL — ISSUE, real, fixed in 738eb43.** Supabase email templates inject the full origin+pathname into `{{ .RedirectTo }}`; naively appending this to a base URL doubles the origin. Fixed by extracting `.pathname` via `new URL(next)` before using the value. First occurrence — log and watch.

3. **`NextResponse.redirect()` dropping cookies from cookies() API — ISSUE, real, fixed in 738eb43.** verifyOtp wrote session cookies via Next.js cookies() API; NextResponse.redirect() does not carry those cookies to the browser. Switching to `redirect()` from `next/navigation` preserves the cookie store. First occurrence — log and watch.

**Pattern analysis:**

- All three ISSUEs are first occurrences. No existing frequency table rows are promoted this cycle. All four new rows added to the frequency table are single-occurrence watch items.
- The two Supabase-specific patterns (#2 and #3 above) are framework-level gotchas that are non-obvious and not documented in any existing rule. If either recurs, a note in `docs/security.md` or `code-style.md` Section 6 is warranted.
- The open redirect pattern (#1) is already covered by the general principle "never trust client input" (security.md rule 4 — Zod validates data, same principle applies to redirect targets). No new rule needed at count 1.

**Actions taken:**
- Frequency table: 4 new watch rows added (NextResponse cookie drop, full URL doubling, Supabase 422 same-password, open redirect via next param). All at count 1 — log and watch only, no rule changes.

**No rule changes applied this cycle** — all patterns are first occurrences. Rule change threshold requires 2+ occurrences across different commits.

**False positives:** none detected. All 3 semantic-reviewer ISSUEs were confirmed real.

**Positive signals:**
- All 3 ISSUEs caught and fixed before the branch is pushed — semantic-reviewer gate functioning correctly.
- Code reviewer clean across all commits in this login redesign cycle — no mechanical violations introduced.
- Comprehensive test coverage written in the same cycle: unit tests for every new route + E2E for the full flow. Test-writer found no gaps.
- The three-fix convergence (ce47d5b → 738eb43 → ca5bbd5) is tight and purposeful — each commit addresses a distinct, independently verifiable issue.

---

### 2026-03-17 — feat/auth-email-password (commits 5cc4109, 47df5cf)

**Context:** Auth mechanism switched from magic link to email+password. New pages: forgot-password, reset-password. Auth callback updated with recovery branch. Fix commit 47df5cf addressed a guard ordering ISSUE found by semantic-reviewer, cleaned up stale magic link docs, and added missing page.tsx tests.

**Code reviewer:** clean — 0 blocking, 0 warnings.

**Doc updater:** stale magic link references in `docs/plan.md` — fixed in 47df5cf. No other doc drift. Correct behavior: doc update committed in the same cycle as the triggering change.

**Test writer:** missing tests for `apps/web/app/page.tsx` (login page error-mapping behavior) — 8 tests written and added in 47df5cf. This is another instance of a new or significantly modified page/component shipping without co-located tests.

**Semantic reviewer:** 3 findings.

1. **Recovery branch bypassing profile check — ISSUE, real, fixed in 47df5cf.** Recovery branch was positioned before the profile-existence gate, allowing orphaned Supabase Auth users (account created but no `users` table row) to bypass `not_registered` check via password reset. Fixed by moving recovery handling to after the profile gate. This is the second auth-callback guard ordering error across different commits (first: 83ae098 — session cookie set before users-table check). Pattern count now at 2 — meets RULE CANDIDATE threshold. Updated frequency table accordingly.

2. **`window.location.origin` in forgot-password `redirectTo` — FALSE POSITIVE.** Semantic-reviewer flagged this as a potential SSR issue, but the form is a client component (`'use client'`), so `window` is always available at call time. The same pattern was present and accepted in the old magic link code. Recorded as a false positive.

3. **`student.login` audit event not emitted — PRE-EXISTING GAP, not introduced by this commit.** Audit logging for login was never implemented under magic link auth either. This is a known coverage gap, not a regression. Not tracked as a new pattern — pre-existing state, no action.

**Pattern analysis:**

- Auth callback guard ordering (row updated, count 2): second occurrence across different commits. RULE CANDIDATE. Proposed rule: when any branch is added to the auth callback, verify the full guard ordering — all existence/registration checks must precede branch-specific actions, and all post-session failure paths must call `signOut()` before redirecting.
- Missing tests for modified page (recurring, existing watch item "New hook file extracted without shipping tests"): page.tsx tests were missing from 5cc4109. Caught by test-writer and fixed in same cycle. No new rule change warranted — existing rule (code-style.md Section 7) covers this. The compliance gap at authoring time persists.
- False positive logged: `window.location.origin` in client component `redirectTo` — not an SSR issue when component is `'use client'`.

**Actions taken:**
- Frequency table row 71 updated: "Auth callback guard ordering error" count raised to 2, status changed to RULE CANDIDATE, description expanded to cover both occurrences.
- False positive logged in this lesson entry. Not added to frequency table (false positives do not count as pattern recurrences).
- Pre-existing audit gap noted. Not added to frequency table (not introduced by this commit).

**No rule changes applied this cycle** — RULE CANDIDATE for auth callback guard ordering requires orchestrator decision before being written into `docs/security.md` or `CLAUDE.md`. Proposed text: "When adding or modifying any branch in the auth callback, verify the full guard ordering before committing: (1) all existence/registration checks execute before branch-specific session actions, (2) any branch that fails after a session is established must call `signOut()` before redirecting."

**Positive signals:**
- Single fix commit (47df5cf) covered all three outputs: ISSUE fix + doc cleanup + test addition. No deferred work.
- Guard ordering bug was caught by semantic-reviewer and fixed in the same session — did not reach production.
- Code reviewer clean across both commits — no mechanical violations introduced in a large new-feature commit.

---

### 2026-03-16 — fix/45-remove-answer-keys-from-test (commits f1f6c32, 7029f4e, 1f76a7b)

**Context:** Fix for #45 — remove raw answer keys from web-layer test contract. Involved a new SECURITY DEFINER RPC (`get_student_questions`) to strip correct answers server-side rather than relying on TypeScript type casting. Branch required 3 review rounds before all agents reported clean.

**Round 1 (f1f6c32):**

- Code reviewer: clean.
- Semantic reviewer: 2 ISSUEs. Both real.
  1. **Correct field in runtime object** — TypeScript `as QuestionForStudent` cast does not strip `correct` from the returned object at runtime. The RPC SELECT still included `correct`, so it was present on the wire. This is a direct violation of security.md rule 1. Fixed in 7029f4e by removing `correct` from the RPC SELECT list.
  2. **RPC not session-scoped** — get_student_questions accepted `p_question_ids` from the caller without verifying the caller had a session containing those questions. Any authenticated user could pass arbitrary question IDs and retrieve question data for questions outside their session. Fixed in 7029f4e by deriving the question set from session answers rather than trusting caller-supplied IDs.
- Test writer: 3 tests added covering the new RPC behavior.
- Doc updater: decisions.md and security.md updated.

**Round 2 (7029f4e):**

- Code reviewer: clean.
- Semantic reviewer: 1 ISSUE. Real.
  1. **p_question_ids not validated against session** — even after scoping the RPC to require a session, the implementation still accepted `p_question_ids` as input and did not cross-check them against the session's actual answer set. A caller could still inject question IDs outside their session scope. Fixed in 1f76a7b by removing the `p_question_ids` parameter entirely and deriving the question set exclusively from `quiz_session_answers`.
- Test writer: 2 tests added.
- Doc updater: plan.md updated.

**Round 3 (1f76a7b):**

- All agents clean. 2 suggestions only (comment quality — not actioned).

**Root cause of 3-round cycle:** Security fixes were applied narrowly — each fix addressed the specific flagged gap without auditing adjacent axes. A "self-defending RPC audit" would have caught all three gaps in round 1: (1) output projection strips sensitive fields, (2) input arrays are validated against caller-owned records, (3) result is destructured for error, (4) auth.uid() identity check present.

**Actions taken:**
- Frequency table: "SECURITY DEFINER RPC input array not validated against caller-owned records" added as new watch item (count 1). First occurrence — log and watch.
- Frequency table: "TypeScript type cast used as data-stripping mechanism (answer key exposure)" added as new watch item (count 1). First occurrence — log and watch.
- Frequency table: "RPC `.rpc()` call result not destructured for error" added as new watch item (count 1). First occurrence — log and watch; existing code-style.md rule covers mutations but not `.rpc()` calls; one more occurrence warrants extending the rule.
- Frequency table: "Security fix requiring multiple rounds due to incomplete self-defending audit" added as new watch item (count 1). First occurrence — log and watch.

**No rule changes proposed** — all 4 new patterns are single occurrences. Rule change threshold requires 2+ occurrences.

**Recommended change (proposed, not applied):** When a SECURITY DEFINER RPC is created or modified, the author should verify all four axes before committing: (1) auth.uid() identity check present, (2) input arrays validated against owned records (not trusted from caller), (3) SELECT list explicitly excludes sensitive fields — not relying on type casts, (4) RPC call result destructured for `{ data, error }`. This could be added as a checklist item to `docs/security.md` or the semantic-reviewer's agent definition once a second occurrence confirms the pattern.

**False positives:** none detected across all 3 rounds. All semantic-reviewer ISSUEs were confirmed real.

**Positive signals:**
- Code reviewer clean across all 3 rounds — no mechanical violations introduced.
- Three-round convergence is expected for a security RPC being written for the first time. The self-defending audit checklist above would reduce this to 1 round in future.
- Doc updater correctly tracked the evolving security decision across rounds without double-writing.

---

### 2026-03-16 — fix/56-narrow-auth-delegation-suppression (commits b32d56a, d6e8224, 0f40bd6)

**Context:** Config-only change narrowing the security-auditor's auth-delegation suppression rule (DO NOT item 9) from a one-line blanket exemption to a 4-condition gate. No production code changed.

**Code reviewer:** clean — 0 blocking, 0 warnings.

**Test writer:** no tests needed — config-only change, no testable logic.

**Doc updater:** no doc updates needed — no docs referenced issue #56 or the suppression rule.

**Semantic reviewer round 1:** 3 ISSUEs, 2 SUGGESTIONs. All 3 ISSUEs were real.
1. **Undefined severity "WARNING"** — condition 3 assigned "WARNING" severity; security-auditor schema defines CRITICAL, HIGH, MEDIUM only. Fixed in d6e8224 with MEDIUM. Root cause: author did not cross-check the severity label against the agent's own severity table before writing the rule.
2. **Unverifiable suppression condition from diff context** — condition 3 required the agent to verify the RPC's SELECT list does not expose correct answers, but the RPC definition is in a migration file not present in the diff. Without an explicit fallback instruction, the agent had no guidance when the artifact was inaccessible and might suppress a CRITICAL finding incorrectly. Fixed in d6e8224 with: "If the migration file is not accessible, flag as HIGH."
3. **DO NOT numbering collision** — new item added as "9" collided with HIGH checklist item "9". Non-contiguous pre-existing numbering (1,2,3,5,6,8,9) also cleaned up. Fixed in d6e8224 (DO NOT renumbered 1-7).

**Semantic reviewer round 2:** 2 ISSUEs (pre-existing). Both were real, both fixed in 0f40bd6.
1. **Duplicate HIGH checklist block** — a prior edit had left two copies of HIGH items 11-15. Removed in 0f40bd6.
2. **Stale pattern status in semantic-reviewer patterns memory** — a pattern row still showed "watching" when it had already been resolved. Updated.

**Actions taken:**
- Frequency table: "Undefined severity level used in agent rule" added as new watch item (count 1). First occurrence — log and watch, no rule change.
- Frequency table: "Agent suppression condition requiring out-of-diff artifact verification" added as new watch item (count 1). First occurrence — log and watch, no rule change.
- Frequency table: "Agent file DO NOT section numbering collision" added as new watch item (count 1). First occurrence — log and watch, no rule change.

**No rule changes proposed** — all 3 patterns are single occurrences (first time seen across different commits). Rule change threshold requires 2+ occurrences.

**False positives:** none detected. All semantic-reviewer findings were confirmed real.

**Positive signals:**
- Code reviewer, test writer, and doc updater all reported clean on a config-only change — as expected. Pipeline behaved correctly.
- The semantic reviewer correctly identified real issues in a config-only commit, demonstrating the agent provides value even when no production code changes. This is the intended behavior.
- The 4-condition suppression structure (Zod + SECURITY DEFINER RPC + non-sensitive return + JSDoc waiver) is a strong pattern: each condition is independently verifiable, and the fallback behavior when a condition cannot be verified is now explicit (flag as HIGH rather than suppress).

---

### 2026-03-11 — Initial session
- **Root cause of pushed broken code:** Type-check and tests were in pre-push (too late), not pre-commit. Pre-push had slow security-auditor that timed out, forcing `--no-verify`. All quality gates collapsed.
- **Fix:** Moved type-check + tests to pre-commit. Pre-push now only does security + audit.
- **Pattern:** When test fixtures don't match updated types, TS catches it but only if type-check runs early enough (pre-commit, not pre-push).
- **Pattern:** External hooks (Lefthook post-commit) that Claude can't see are useless. All agent output must flow back to the main session.

### 2026-03-11 — Partial doc fix pattern
- **Context:** Commit c756141 (learner agent + coderabbit) updated `docs/decisions.md` with Decision 20 (post-commit workflow), but left `docs/plan.md` stale (old pipeline diagram, missing learner/coderabbit agents).
- **Result:** Doc-updater flagged the gap in the next cycle (33eb2bb). Plan.md got fixed in a follow-up commit.
- **Pattern:** Agent findings (doc gaps, code style, tests) must be **fully acted on in the same commit**. Partial fixes = extra commits wasted and risk of incomplete state.
- **Lesson:** When doc-updater flags stale files, audit all related docs together. Don't update decision tree without updating plan + CLAUDE.md. Single commit per logical unit of work.

### 2026-03-12 — Sprint 2 quiz overhaul fix cycle (commits f53eccf, post-commit round)

**Code reviewer:** clean pass. One watch item — `use-quiz-state.ts` is at 100 lines against an 80-line hook limit. First occurrence; no rule change. File is complex state + side effects; if it grows further, extract into sub-hooks.

**Semantic reviewer — 3 findings, all fixed in f53eccf:**

1. **Score scoping in `batch_submit_quiz` RPC** — The score query counted ALL `quiz_session_answers` rows for the session rather than only the rows just inserted. Correct fix: scope to `WHERE question_id = ANY(v_submitted_question_ids)`. This is a first occurrence of the "aggregate from full table, not current operation's rows" anti-pattern. Watch for it whenever a batch RPC computes a derived metric (score, count, average) after inserting rows.

2. **Positional index pairing instead of Map lookup** — `updateFsrsCards` in `batch-submit.ts` paired `answers[i]` with `results[i]` by index, relying on the RPC preserving array order. Correct fix: build a `Map<questionId, isCorrect>` from results and look up by ID. First occurrence. Watch for any future array-zip patterns where the two arrays come from different sources (client input vs. RPC output).

3. **Empty-array guard at SQL level** — `batch_submit_quiz` RPC did not guard against an empty `p_answers` input at the SQL layer. Application layer validated, but SQL should not assume valid input. First occurrence. Watch for new RPCs that iterate over `jsonb_array_elements` without a length guard.

**Doc updater:** `database.md`, `decisions.md`, `plan.md` all updated with batch RPC docs in the same cycle. Clean — no partial-doc-fix pattern recurrence.

**Test writer:** `quiz-submit.ts` (hook-level submit orchestrator) had no test file. First occurrence of a new non-trivial hook shipping without tests. 11 tests written. Watch for other hook files in `_hooks/` that may be similarly uncovered. Total test count: 490.

**Actions taken:** All findings were single occurrences — logged and watched, no rule changes proposed. No false positives detected.

---

### 2026-03-12 — Server client fix + test coverage (commits 2b10602, 45cccd2)

**Code reviewer:** clean — 0 blocking, 0 warnings.

**Semantic reviewer:** 0 critical, 0 issues. 1 suggestion: bare `catch {}` in `packages/db/src/server.ts` could be narrowed to a specific error type (e.g., check `error.message` for the known Next.js read-only cookie string) so unexpected errors are not silently swallowed. First occurrence — logged and watched. 3 good patterns noted (env-var guard, cookie adapter, try/catch boundary explanation in comment).

**Doc updater:** no changes needed — fix was internal to an existing module, no schema or API surface change.

**Test writer:** wrote 7 tests in `packages/db/src/server.test.ts` covering env-var guards, cookie adapter wiring, and the read-only-context try/catch fix. All 7 passing. Initial version had a top-level await problem — the test file called `await import('./server.js')` at module scope, which is not supported under node16 module resolution (used in `packages/db`). Fixed by wrapping in an async helper function `getModule()` called inside each test. This is a first occurrence of this pattern.

**Actions taken:**
- Logged `top-level await in node16 package test file` as a new watch item (first occurrence — no rule change yet).
- Logged `bare catch {} without error-type narrowing` as a new watch item (first occurrence — no rule change yet).
- Both items need a second occurrence across different commits before a rule change is warranted.

**Positive signal:** The semantic reviewer's suggestion about bare catches is aligned with existing TypeScript discipline (no `any`, explicit narrowing). If this recurs, the natural fix is a rule addition to `code-style.md` Section 5 or a note in the test-writer memory about the dynamic import pattern for node16 packages.

---

### 2026-03-11 — CI/Vercel build failures (commit 2ac3286)
- **Root cause:** Turbo caching + monorepo package boundary issues masked errors locally that surfaced in CI.
- **Pattern 1 — Integration tests in CI:** `packages/db/vitest.config.ts` runs all tests by default in CI/Vercel. Integration tests that require live DB services (Supabase) fail in CI. Solution: exclude integration tests from default `pnpm test` via glob `!**/*.integration.test.ts` in vitest config, or move to separate config. Locally, devs still run them with explicit flag.
- **Pattern 2 — Auto-generated files in biome ignore:** Next.js generates `next-env.d.ts` dynamically. This file should be in `.biomeignore` (or `.gitignore` equivalent) to prevent biome from formatting it. Prevents spurious "changed" diffs in CI.
- **Pattern 3 — E2E helpers as devDeps:** E2E test helpers (e.g., `apps/web/e2e/helpers.ts`) may import packages not in the app's direct deps (e.g., `@supabase/supabase-js`). In a monorepo, packages should be declared explicitly as devDeps in the package that imports them — not assumed to exist via transitive deps. Turbo caching hides the gap locally.
- **Pattern 4 — Turbo cache masking type errors:** TS type-check passes locally (Turbo cache hit) but fails in CI (fresh install). Root cause: tsconfig path resolution or package versioning differs. Solution: verify `pnpm check-types` (tsc --noEmit) passes in clean environment before pushing. Consider adding explicit `pnpm install --frozen-lockfile` + `pnpm check-types` to CI as separate step before `pnpm build`.
- **Lesson:** In Turborepo + monorepo, always assume CI has a clean state. Test locally with `pnpm install --frozen-lockfile`, `pnpm check-types`, `pnpm build` before commit. Cache hits are not a sign of success.

---

### 2026-03-12 — Sprint 2 quiz overhaul round 2 (commits 9d9e898, a269284, 090e1e7)

**Code reviewer:** 2 BLOCKING findings, both resolved before the cycle closed.
- `quiz-config-form.tsx` at 200 lines (limit: 150) — fixed by extracting `useQuizConfig` hook in a269284.
- `use-quiz-state.ts` at 102 lines (limit: 80) — fixed in a269284 by compressing and extracting `clampIndex` utility.
- 2 acceptable warnings remain: hooks at 91 and 103 lines. Both are within the documented Server Action orchestrator boundary (30–35 lines) and the `useQuizConfig` hook is new — 103 lines is a first post-refactor count. Watch these in the next cycle.

**Semantic reviewer:** 3 ISSUEs found and fixed across the three commits.

1. **`finally` clears loading state during navigation (9d9e898 → fixed a269284):** Using `finally` to call `setLoading(false)` when the success branch calls `router.push()` + `return` re-enables the submit button while navigation is in-flight. Fixed by moving `setLoading(false)` to the catch-only branch. Pattern: never clear a loading gate in `finally` if the success path navigates away.

2. **Silent discard of failed user-triggered operation (9d9e898 → partial fix → 090e1e7):** `ResumeDraftBanner` showed no error to the user when `deleteDraft()` failed. Fixed in two steps: a269284 added UI error state in the banner handler, 090e1e7 fixed `deleteDraft` itself to check the Supabase `{ error }` response and return `{ success: false }` instead of silently returning `{ success: true }`. Root cause: Supabase mutations return errors in `result.error`, they do not throw — so `await supabase.from(...).delete()` without destructuring silently drops the error. This pattern appeared twice across two commits (UI layer then DB layer), meeting the 2+ threshold.

3. **`useNavigationGuard` still active after successful submit (9d9e898 → fixed a269284):** Guard condition `answers.size > 0` without a post-submit clear left a brief double-submit window. Fixed by adding a `submitted` ref checked before the guard fires. Pattern: navigation guards need an explicit "submitted" signal, not just an implicit state check.

**Doc updater:** `database.md` updated with RPC deprecation note. No partial-doc-fix pattern.

**Test writer:** 22 tests across 6 files + 2 new test files (clamp-index, use-quiz-config). This is the second cycle in a row where new hook/utility files shipped without test files. The `useQuizConfig` hook and `clampIndex` utility (both created in the same sprint) had no tests until the test-writer wrote them post-commit. This meets the 2+ threshold for a rule addition.

**Rule changes proposed (2+ occurrences):**

1. **Hook size overflow pattern (count 2):** `use-quiz-state.ts` exceeded 80 lines across two consecutive commit cycles (first at 100 lines, then 102). The correct fix each time was to extract a utility function (clampIndex) or split state into a sub-hook. No rule change needed — the rule already exists. What's missing is a proactive check: add a note to code-reviewer memory that hooks at 70+ lines are a WARNING-level watch item (pre-violation signal), not just at 80+.

2. **Supabase mutation error silently dropped (count 2):** `deleteDraft` returned `{ success: true }` even when the Supabase delete returned `{ error }`. Same root cause pattern as the batch-submit partial failure issue from the prior cycle (where the DB layer silently succeeded but state was wrong). Rule addition warranted: all Supabase `.insert()`, `.update()`, `.delete()`, `.upsert()` calls must destructure `{ error }` from the return value and handle it explicitly. Proposed addition to `code-style.md` Section 5 (TypeScript Rules).

3. **New hook/utility file shipped without tests (count 2):** `quiz-submit.ts` (prior cycle) and `useQuizConfig` + `clampIndex` (this cycle) all shipped without test files. Rule addition warranted: add to `code-style.md` Section 7 (Testing Rules) that any new file in `_hooks/` or `lib/` must have a co-located `.test.ts` file in the same commit.

**False positives:** none detected.

**Positive signals:**
- Auth-before-parse pattern holds across all 3 commits — no new violations.
- FSRS best-effort try/catch pattern is consistent across all mutation paths.
- Doc updates were complete in the same cycle (no partial-doc-fix recurrence).

---

### 2026-03-12 — E2E test updates for deferred-write quiz flow (commits 9b624ff, 7f7eed8)

**Code reviewer:** clean on both commits — 0 blocking, 0 warnings. (Changes were test files only; relaxed line limits apply.)

**Semantic reviewer:** 1 ISSUE + 2 SUGGESTIONS. All fixed before cycle closed.

1. **ISSUE — Race condition between React setState flush and E2E click (9b624ff → fixed 7f7eed8):** After the last answer was submitted, the test immediately called `page.getByRole('button', { name: 'Finish Test' }).click()`. The progress bar reflects accumulated React state, and if `setState` hadn't flushed yet the button click could fire before the UI was ready, producing a flaky test. Fix: wait for `[data-testid="progress-bar"]` to have `style` matching `/100%/` before clicking Finish Test. This is the **first occurrence** of the pattern "E2E test interacts with React state-driven UI without waiting for the DOM to reflect the state change." Log and watch.

2. **SUGGESTION — Overly broad `getByText(/\d+%/)` selector:** The original `getByText('%')` was a substring match that could hit any element containing `%`. Changed to `getByText(/\d+%/)` to scope to a score-like string. First occurrence.

3. **SUGGESTION — Unscoped dialog selector:** `page.getByRole('dialog')` without a name could match any open dialog on the page. Changed to `page.getByRole('dialog', { name: 'Finish quiz' })`. First occurrence.

**Doc updater:** found missing `/app/quiz/report` route in `docs/plan.md` route tree. Fixed in the same cycle.

**Test writer:** no gaps — 605 tests passing, no new source files introduced.

**Actions taken:**
- Frequency table: "E2E race condition on React state flush" added as new watch item (count 1). First occurrence — no rule change.
- Frequency table: "broad E2E selector without accessible name" added as new watch item (count 1). First occurrence — no rule change.
- Frequency table: "missing route in docs/plan.md route tree" added as new watch item (count 1). First occurrence — no rule change.
- No rule changes proposed — all patterns are single occurrences.

**False positives:** none detected.

**Positive signals:**
- Code reviewer was clean on both commits — E2E test files correctly benefit from relaxed line limits.
- The progress-bar flush gate fix (7f7eed8) is a clean, minimal change — single `await expect` assertion before the click. Good pattern for future E2E work against deferred-write flows.
- Doc-updater caught the missing route entry immediately and the fix was applied in the same cycle, consistent with the no-partial-doc-fix discipline.

---

### 2026-03-17 — Vite 7→8 dependency upgrade (commits d9de1dd, 5428b5c)

**Context:** Pure dependency upgrade — Vite 7→8 (`@vitejs/plugin-react` 5→6) on branch chore/226-vite-8-migration. Two commits: d9de1dd (upgrade + pin explicit vite devDependency) and 5428b5c (lockfile dedupe + plan.md update). No production logic changed.

**Code reviewer:** clean — 0 blocking, 0 warnings. Pure dep upgrade; no source file content changed.

**Test writer:** no tests needed — no new logic or modules introduced. Correct outcome for a dep-only commit.

**Doc updater:** suggested updating plan.md sprint table to mark #215 Done and add #226 row. Applied and committed in 5428b5c. Correct outcome — doc-updater caught a missing progress entry.

**Semantic reviewer:** 1 ISSUE, 2 SUGGESTIONs, 2 GOODs.

1. **ISSUE — `pnpm check-types --force` needed after dep bump (d9de1dd):** The semantic reviewer flagged that the standard `pnpm check-types` after a dep-bump commit might be served from turbo cache, masking new type errors introduced by the upgraded packages. This is not a new pattern — it is the third occurrence of "Turbo type-check cache masking new compile errors after dependency bumps" (count updated from 2→3). The flag was already applied before committing (per CLAUDE.md rule added after the second occurrence). The reviewer confirmed the type check was clean. ISSUE resolved pre-commit, not post-commit.

2. **SUGGESTION — rolldown-vite RC watch item (d9de1dd):** `@vitejs/plugin-react@6` bundles rolldown-vite (Rust-based bundler) as an internal dependency; RC status means breaking changes possible in minor bumps. No action needed now — watch for follow-up releases. First occurrence as a named watch item.

3. **SUGGESTION — esbuild version duplication + lightningcss redundancy in lockfile (d9de1dd → resolved 5428b5c):** The initial upgrade introduced two esbuild versions (0.27.3 and 0.27.4) and a lightningcss duplicate alongside the Vite-bundled copy. Addressed in 5428b5c by running `pnpm dedupe`, which collapsed esbuild to 0.27.4 and removed 270 orphaned lockfile lines. Duplication was non-breaking but wasteful.

4. **GOOD — CI Node.js compat confirmed (d9de1dd):** Vite 8 requires Node.js ≥18; CI already runs Node 20. No matrix change needed.

5. **GOOD — Clean Babel removal confirmed (d9de1dd):** `@vitejs/plugin-react@6` dropped `@babel/core` as a peer dep in favour of `@vitejs/plugin-react-oxc` transform. Lockfile correctly shows Babel packages removed, not just version-bumped.

**Positive signals:**
- Code reviewer, test writer all reported clean — pipeline behaved correctly for a dep-only commit.
- The CLAUDE.md `pnpm check-types --force` rule (added after the second turbo-cache occurrence) was followed before committing. The ISSUE flagged by the semantic reviewer was therefore already resolved at commit time. The rule is working.
- `pnpm dedupe` as a follow-up commit is a clean pattern: one commit for the bump, one for lockfile hygiene. Keeps diffs readable.
- No production code touched — zero post-commit test failures, zero rule violations.

**Actions taken:**
- Frequency table: "Turbo type-check cache masking new compile errors after dependency bumps" count updated 2→3. Status remains RULE CANDIDATE — the CLAUDE.md rule was already applied after the second occurrence. No further rule change warranted; this is now a compliance-tracking entry.
- Frequency table: "rolldown-vite RC watch item" added as new watch item (count 1). First occurrence — log and watch.
- No new rule changes proposed — turbo-cache rule already applied; rolldown item is first occurrence only.

**False positives:** none detected. The semantic reviewer ISSUE was valid and had been pre-empted correctly.

---

### 2026-03-12 — CodeRabbit PR #33 fixes + partial-submission guard (commits b312922, fe12342)

**Code reviewer:** clean — 0 blocking, 0 warnings. All production changes in these commits were single-line targeted fixes or SQL-level additions.

**Semantic reviewer:** 1 ISSUE + 2 suggestions. ISSUE fixed in fe12342 before cycle closed.

1. **ISSUE — Partial-submission guard missing in `batch_submit_quiz` RPC (b312922 → fixed fe12342):** The RPC accepted any non-empty answer array, including partial submissions where `jsonb_array_length(p_answers) < total_questions`. Fixed by fetching `qs.total_questions` into `v_total` in the session-lock query and adding `IF jsonb_array_length(p_answers) != v_total THEN RAISE EXCEPTION`. Additionally, a `FOR UPDATE` row lock was added to the session SELECT to prevent concurrent submissions. Two distinct sub-patterns here: (a) partial answer sets not rejected — first occurrence, logged as new watch item. (b) concurrent session mutation without row lock — first occurrence, logged as new watch item.

    Secondary note: the prior cycle's score-scoping fix (f53eccf scoped count to `WHERE question_id = ANY(v_question_ids)`) was itself revised in fe12342. Now that `v_total` comes from `quiz_sessions.total_questions` (authoritative) and the partial-submission guard guarantees all questions are answered, scoping the count to the inserted batch IDs was redundant. The count query was simplified back to full session scope. This is not a new anti-pattern — it's a correct second-order consequence of the partial-submission guard.

2. **SUGGESTION — Type alias `AppRouterInstance` imported from internal Next.js path (b312922):** `quiz-submit.ts` imported `AppRouterInstance` from `next/dist/shared/lib/app-router-context.shared-runtime` — an internal module path not part of Next.js's public API. Fixed by deriving the type as `ReturnType<typeof useRouter>` from `next/navigation`. First occurrence — logged and watched. If it recurs, warrants a note in code-style.md about importing from `next/dist/` internal paths.

3. **SUGGESTION — Count state not reset on subject switch (b312922):** Component-level count display could show stale counts when the user switches between subjects without a full remount. This was noted as protected at server (data is re-fetched server-side on navigation), so the concern applies only to client-side tab switching without navigation. First occurrence — logged and watched.

**Doc updater:** `docs/database.md` updated with RPC changes (FOR UPDATE note, partial-submission guard, revised score-calculation rationale). Applied in same cycle — no partial-doc-fix pattern.

**Test writer:** 5 tests added — `resume-draft-banner.test.tsx` covering the catch/finally restructure (error branch, setDiscarding reset in finally, setVisible only on success, error cleared on retry) and the clamped-label display. All passing. No new hook/utility files shipped without tests in this cycle.

**Actions taken:**
- Frequency table: added "Concurrent session mutation without row-level lock" as new watch item (count 1).
- Frequency table: added "Partial-submission not rejected at RPC level" as new watch item (count 1).
- Frequency table: added "Import from Next.js internal module path" as new watch item (count 1).
- No rule changes proposed — all three are first occurrences.

**False positives:** none detected.

**Positive signals:**
- "New hook without test" pattern did NOT recur in this cycle — no new hook/utility files shipped without tests. First cycle since 9f5a6cc where the rule was followed at write time.
- "Supabase mutation error silently dropped" rule (added 9f5a6cc) held for a second consecutive cycle — no new violations.
- The `finally { setDiscarding(false) }` usage in `resume-draft-banner.tsx` is the correct pattern for this case: the success branch only hides the component (`setVisible(false)`), it does not navigate away. This is distinct from the prior "finally clears loading during navigation" anti-pattern. The distinction matters: `finally` is safe when success does not navigate; unsafe when success calls `router.push()` + `return`.
- Code reviewer clean pass confirms the 70-line hook watch threshold is effective — no hooks drifted over 80 lines in this cycle.

---

### 2026-03-12 — Sprint 2 quiz overhaul round 3 (commits 0176634, 2454c28)

**Code reviewer (0176634):** 1 BLOCKING + 1 WARNING.
- BLOCKING: `use-quiz-navigation.test.ts` missing. `use-quiz-navigation.ts` was a new hook file shipped without a co-located test. This is the **third occurrence** of this pattern. The rule was added to `code-style.md` Section 7 in 9f5a6cc but was not followed at write time. Rule is confirmed necessary; the issue is compliance at authoring time, not rule clarity. Test-writer wrote 16 tests (2454c28 fixed the gap).
- WARNING: `use-quiz-config.ts` at 88/80 lines — hook file over limit. This is the third occurrence of the hook-exceeds-80-lines pattern. The 70-line watch was added to code-reviewer memory in 9f5a6cc but the violation still occurred, suggesting the 70-line early warning is not being acted on proactively.

**Code reviewer (2454c28):** clean — 0 issues. Fix commit closed the BLOCKING finding correctly.

**Semantic reviewer (0176634):** 0 ISSUEs. 2 SUGGESTIONs (first occurrences, no action):
- Zod `.max()` constraint missing on subject/topic string fields in quiz config schema. First occurrence — log and watch. If it recurs on a different schema, warrants a note in code-style.md about string field validation completeness.
- `navigate` closure in `use-quiz-navigation.ts` could capture a stale ref without a comment explaining why it's safe. First occurrence — log and watch.

**Semantic reviewer (2454c28):** 1 SUGGESTION.
- `vi.stubGlobal('window', ...)` in `use-quiz-navigation.test.ts` is not torn down via `vi.unstubAllGlobals()` in `afterEach`, which can leak state to subsequent tests. First occurrence — logged in frequency table as a new watch item. If it recurs, warrants a note in test-writer memory about global stub teardown.

**Doc updater (0176634):** 2 updates needed — `plan.md` (sprint progress) and `database.md` (subject metadata in quiz_drafts). Both applied in 2454c28. Clean in second cycle.

**Doc updater (2454c28):** clean — docs current.

**Test writer (0176634):** Wrote `use-quiz-navigation.test.ts` (16 tests) and extended 4 existing test files. All tests passing before report.

**Test writer (2454c28):** no gaps — system caught up.

**Actions taken:**
- Frequency table updated: "new hook without test" count 2 → 3, "hook exceeds 80 lines" count 2 → 3, "Supabase mutation not destructured" status updated to RULE ADDED.
- New watch item added: `vi.stubGlobal` without teardown (first occurrence).
- No new rule changes proposed — all active patterns already have rules. Rule compliance is the remaining gap, not rule coverage.

**False positives:** none detected.

**Positive signals:**
- Supabase mutation destructuring rule (added 9f5a6cc) held — no new violations in either commit. First positive signal after rule addition.
- 2454c28 was fully clean on code-reviewer and doc-updater. Fix cycle closed correctly with no secondary issues.
- test-writer's 16-test suite for `use-quiz-navigation.ts` covered all meaningful branches (boundary clamping, visited tracking, answer status, direction guards). High-signal test output.

---

### 2026-03-12 — Sprint 3 analytics cycle (commit db5d8ea)

**Code reviewer round 1:** 1 BLOCKING.
- `statistics-tab.tsx` used `useEffect` to call a Server Action for data fetching — a direct violation of the "no useEffect for data fetching" rule (code-style.md Section 6). Fixed with button-triggered fetch + `useTransition`. This is the **second occurrence** of this pattern (rule already exists; compliance gap confirmed).

**Code reviewer round 2:** clean — 0 issues.

**Semantic reviewer round 1:** 3 ISSUEs.
1. **Missing Zod validation on a Server Action** — input used without `.parse()`. Rule exists (security.md rule 4). First occurrence of non-compliance with this specific rule. Fixed in same cycle.
2. **Supabase mutation errors silently dropped at 5 call sites** — same root cause pattern as prior occurrences (Supabase returns errors in `result.error`, never throws). This is the **third recurrence** of this pattern. The rule exists in code-style.md Section 5. Compliance is the remaining gap — rule clarity is not the issue. Fixed in same cycle.
3. **LANGUAGE sql RPCs should be plpgsql with RAISE EXCEPTION** — Sprint 3 analytics RPCs used `LANGUAGE sql` (which cannot raise exceptions) for SECURITY DEFINER functions that need to call `auth.uid()` and raise on null/identity mismatch. First occurrence — logged and watched. A plpgsql body is required any time an RPC uses `RAISE EXCEPTION` or `IF/THEN` control flow.

**Semantic reviewer round 2:** 2 ISSUEs.
1. **Missing identity guard in RPCs** — RPCs checked `auth.uid() IS NULL` but did not verify `auth.uid() = p_student_id`. A student could call the RPC with another student's ID and it would succeed the null check. First occurrence of this specific sub-pattern. Logged as new watch item. security.md rule 7 covers the null check but does not explicitly require the identity comparison. If this recurs, clarify rule 7 to require both guards.
2. **`subjects ?? []` applied after error guard** — after an explicit `if (error) return { subjects: null }` guard, a downstream consumer applied `subjects ?? []` which turned a known error condition into an empty array. This creates a silent data loss path — the caller proceeds with no subjects rather than surfacing the error. First occurrence — logged and watched. The anti-pattern: never apply `?? []` to a value that was null because of an error (only apply it to values that are null because "no data" is a valid empty state).

**Doc updater:** `docs/database.md` updated with Sprint 3 RPCs + schema additions. `docs/plan.md` updated with sprint progress. Decision 24 added to `docs/decisions.md`. Clean — no partial-doc-fix pattern.

**Test writer:** 39 new tests written across Sprint 3 analytics components and server actions. All passing before report.

**Actions taken:**
- Frequency table: "Supabase mutation result not destructured" count updated to 3. Rule already exists — no change to rule.
- Frequency table: "useEffect data fetching" count updated to 2 (second recurrence). Rule already exists — no change to rule.
- Frequency table: 4 new watch items added (all first occurrences): LANGUAGE sql vs plpgsql, `?? []` after error guard, Server Action without Zod validation, RPC missing identity guard.
- No new rule changes proposed — the two recurring patterns (Supabase error swallowing, useEffect data fetching) already have rules. Recurring violations indicate a compliance gap, not a rule gap.

**False positives:** none detected.

**Positive signals:**
- Code reviewer round 2 was clean — the useEffect/Zod fixes were correct and complete.
- 39 tests written is the largest single-cycle test output to date, covering analytics branch paths comprehensively.
- Doc-updater applied all 3 doc updates (database.md, plan.md, decisions.md) in the same cycle — no partial-doc-fix pattern recurrence.

---

### 2026-03-12 — Sprint 3 analytics full cycle review (commits 845923b → 86c8da4 → 1684618 → 7b824c2 → 385017a)

**Context:** Post-commit review across 5 commits on feat/sprint-3-analytics. Two rounds of agent findings. All issues fixed before the cycle closed.

**Code reviewer — Round 1:** 1 BLOCKING.
- `statistics-tab.tsx` used `useEffect` to call a Server Action — "no useEffect for data fetching" violation (code-style.md Section 6). Fixed with `useTransition` + explicit button trigger. This is the **second occurrence** of this pattern (first was in an earlier Sprint 2 commit). Rule already exists; compliance gap confirmed. Count in frequency table: 2.

**Code reviewer — Round 2:** clean.

**Semantic reviewer — Round 1:** 3 ISSUEs.
1. **Missing Zod validation in `fetch-stats.ts` Server Action** — input used without `.parse()`. Rule exists (security.md rule 4). Fixed in 86c8da4. Count in frequency table: 1. Watch.
2. **Supabase mutation errors silently dropped — 5 call sites** — `question-stats.ts` and `reports.ts`. Same root cause as prior occurrences (Supabase returns errors in `result.error`, never throws). Rule exists (code-style.md Section 5). Fixed in 86c8da4. Frequency table count: 3. Rule compliance is the gap, not rule clarity.
3. **`LANGUAGE sql` RPCs instead of `plpgsql`** — Sprint 3 analytics RPCs used `LANGUAGE sql` (cannot raise exceptions) for SECURITY DEFINER functions that need `auth.uid()` checks and `RAISE EXCEPTION`. Fixed via migration 014 in 86c8da4. Count: 1. Watch. A SECURITY DEFINER RPC that uses `IF/THEN` or `RAISE EXCEPTION` requires `LANGUAGE plpgsql`.

**Semantic reviewer — Round 2:** 2 ISSUEs.
1. **Missing identity guard in RPCs** — RPCs verified `auth.uid() IS NOT NULL` but did not compare `auth.uid() = p_student_id`. A student could pass another student's ID and pass the null check. Fixed via migration 015 in 7b824c2. Count: 1. Watch. `security.md` rule 7 covers null check only; it does not explicitly require the identity comparison. This is a gap in rule text — not a new rule, just an incomplete one. Clarify on second occurrence.
2. **`subjects ?? []` applied after explicit error guard** — `subjects ?? []` was applied downstream after an `if (error) return { subjects: null }` guard, turning a known error state into an empty array and hiding the failure from the caller. Fixed in 86c8da4. Count: 1. Watch. Anti-pattern: never use `?? []` on a value that is null because of an error (reserve `?? []` for values that are null because "no data yet" is a valid empty state).

**Doc updater:** `database.md` updated with Sprint 3 RPCs and migration notes. `plan.md` updated with sprint progress. `decisions.md` updated with Decision 24. All applied in 1684618. No partial-doc-fix pattern.

**Test writer:** 39 new tests written across Sprint 3 analytics components and Server Actions (385017a). All passing. No new hook/utility files shipped without tests in this cycle.

**Actions taken:**
- Frequency table updated: clarified "LANGUAGE sql vs plpgsql" entry with commit references (count still 1, watch).
- Frequency table updated: clarified "RPC missing identity guard" entry with note that security.md rule 7 text gap exists (count 1, watch — clarify rule on second occurrence).
- Frequency table updated: "Server Action without Zod" entry clarified with commit reference (count 1, watch).
- Frequency table updated: "?? [] after error guard" entry clarified with commit reference (count 1, watch).
- No rule changes proposed — all patterns in this cycle are single occurrences. The two recurring patterns (Supabase error swallowing, useEffect data fetching) already have rules; the remaining gap is compliance at authoring time.

**Rule gaps identified (not yet actionable — awaiting second occurrence):**
- `security.md` rule 7 says "raise if null" but is silent on the identity comparison (`auth.uid() = p_student_id`). If any SECURITY DEFINER RPC takes a student ID parameter and this guard is missing again, clarify rule 7 to require: (a) null check, (b) identity comparison when a student ID parameter is accepted.
- `security.md` has no mention of `LANGUAGE plpgsql` vs `LANGUAGE sql` for SECURITY DEFINER RPCs. If a second RPC ships with `LANGUAGE sql` and an `IF/THEN` block, add a note: "SECURITY DEFINER RPCs that use control flow or RAISE EXCEPTION must be written in `plpgsql`, not `sql`."

**False positives:** none detected.

**Positive signals:**
- `startTransition` misuse (`.then()` chain) was caught and fixed to `async/await` in the same cycle — correct pattern enforced.
- Both migration fixes (014 and 015) were applied without introducing new issues — fix commits were clean on code reviewer.
- Doc-updater completed all 3 doc targets in a single commit, no partial-doc-fix recurrence.
- 39 tests is the highest single-cycle output to date; analytics branches are well-covered going forward.

---

### 2026-03-13 — statistics-tab render guard + analytics boundParam tests (commits 53efbdd, b555b50)

**Code reviewer:** clean — 0 blocking, 0 warnings. Watch item noted: `statistics-tab.tsx` at 158 lines. The file was split in a prior cycle but the extraction of `FsrsSection` (53efbdd) brought in new lines. 158 > 150 limit. This is a watch item — no violation reported by code-reviewer (likely test file relaxation or component sub-split occurred), but the production component should be monitored.

**Semantic reviewer (53efbdd):** 1 ISSUE + 2 SUGGESTIONS.

1. **ISSUE — Unconditional `setIsLoading(false)` in render-path reset block:** In `statistics-tab.tsx`, the reset block that runs when `questionId` changes called `setIsLoading(false)` unconditionally. When `isLoading` was already `false`, this triggered a redundant state update, causing a spurious re-render on every `questionId` change. Fixed in b555b50 with a `if (isLoading) setIsLoading(false)` guard. Root cause: the reset block ran in the render body (not in a `useEffect`), so any unconditional `setState` there fires even when the value has not changed. **First occurrence of this specific pattern.** Logged as new watch item.

2. **SUGGESTION — useTransition + manual loading state hybrid fragility:** `statistics-tab.tsx` uses both `isPending` from `useTransition` (for the Server Action call) and a manual `isLoading` boolean state. These two signals can both be `false` simultaneously during a question-switch mid-fetch, briefly showing the "Load Statistics" button while a fetch is still in-flight. The generation counter prevents stale data from appearing, but the UI briefly reverts to the idle state. No fix applied — suggestion-level. **First occurrence.** Logged and watched.

3. **SUGGESTION — Silent `boundParam` fallback for non-finite inputs:** The `boundParam` helper in `analytics.ts` clamps non-finite values (NaN, ±Infinity) to the minimum without a `console.warn`. A caller passing `NaN` gets a valid-looking result with no server-side signal that something unexpected occurred. No fix applied — suggestion-level. **First occurrence.** Logged and watched.

**Semantic reviewer (b555b50):** 4 GOOD patterns noted. No issues or suggestions.

**Doc updater:** no changes needed — fixes were internal to existing components, no schema or API surface change.

**Test writer:** 7 new tests added across 2 files (b555b50).
- `analytics.test.ts`: 5 tests for `boundParam` non-finite inputs (NaN, +Infinity, -Infinity for both `getDailyActivity` and `getSubjectScores`). These directly exercised the silent-fallback suggestion.
- `statistics-tab.test.tsx`: 2 new tests covering (a) FSRS section hidden when `fsrsState` is null, (b) load button reappears immediately when `questionId` changes during an in-flight fetch (verifies the `if (isLoading)` guard is correct and the generation counter discards stale results). Well-targeted.

**Actions taken:**
- Frequency table: 3 new watch items added (all first occurrences): "Unconditional setState in render body", "useTransition + manual loading state hybrid fragility", "Silent boundParam fallback without logging".
- No rule changes proposed — all 3 patterns are first occurrences. Rule changes require 2+ occurrences across different commits.

**False positives:** none detected.

**Positive signals:**
- b555b50 was the fix commit for the ISSUE and it was clean on both semantic reviewer (4 GOOD patterns) and code-reviewer. Fix cycle closed in a single follow-up commit.
- The test for the mid-fetch `questionId` change (statistics-tab test 2) is a high-signal regression test — it locks in the `if (isLoading)` guard behavior and the generation counter discard. Any future regression will be caught immediately.
- The `boundParam` non-finite tests (5 total) are the kind of edge-case coverage that previously would have been missed until production. Test-writer identified and covered them proactively from the suggestion, even though no fix was applied to production code.

---

### 2026-03-13 — CodeRabbit follow-up + formatActivityData tests (commits f0f8d0e, 99c67d2)

**Code reviewer:** clean — 0 blocking, 0 warnings. All changes in f0f8d0e were targeted refactors (function splits, test renames); 99c67d2 was a test-only commit. Both correctly within line limits.

**Semantic reviewer:** 0 critical, 0 issues. 2 suggestions.

1. **SUGGESTION — useTransition + manual isLoading hybrid (f0f8d0e):** The semantic-reviewer flagged the same UI-state race in `statistics-tab.tsx` that was first flagged in 53efbdd. Both `isPending` (from `useTransition`) and `isLoading` (manual state) can briefly be `false` simultaneously during a question-switch mid-fetch, causing the "Load Statistics" button to flicker into view. Suggestion-level — no fix applied. **This is the second occurrence across different commits.** Count in frequency table: 2. Rule candidate status reached. A note in code-style.md (or agent memory) should capture the guidance: prefer a single authoritative loading signal; if using `useTransition`, derive all loading UI from `isPending` alone rather than maintaining a parallel manual flag.

2. **SUGGESTION — `waitFor` on `.not.toBeInTheDocument` delays failure diagnosis (f0f8d0e):** Using `waitFor(() => expect(el).not.toBeInTheDocument())` will poll until the assertion passes — but if the element is never removed, the test hangs until `waitFor`'s timeout (default 1000ms) expires rather than failing immediately. The semantic-reviewer noted the assertion form `expect(el).not.toBeInTheDocument()` outside `waitFor` gives faster failure feedback when the element is expected to be absent from the start. First occurrence — logged and watched.

**Doc updater:** no updates needed. Both commits changed only test/component internals with no schema, API, or routing surface changes.

**Test writer (99c67d2):** 3 new tests added to `activity-chart.test.tsx` (or equivalent) for `formatActivityData`:
- UTC date label formatting (prevents prior regression where local-timezone offset caused label drift)
- Data passthrough (no transformation of non-date fields)
- Multi-day data (ensures array ordering is preserved)

The test-writer generated code containing a TS2532 error — array index access without optional chaining (e.g., `result[0].label` instead of `result[0]?.label`). The error was caught and fixed (with `?.`) before the tests were committed. This is the **second occurrence** of test-writer-generated TS2532 errors across different commits. Count in frequency table: 2. Rule candidate status reached for test-writer memory.

**Actions taken:**
- Frequency table: "useTransition + manual loading state hybrid fragility" count updated 1 → 2. Status: RULE CANDIDATE. No rule change applied yet — suggestion-level finding; propose addition to code-style.md (Section 6 or new sub-section) if it surfaces again or if this component is refactored.
- Frequency table: "test-writer produces TS2532 (unchecked array index)" added as new entry at count 2. Status: RULE CANDIDATE. A note should be added to the test-writer's patterns memory instructing it to use optional chaining (`arr?.[i]`) or a length-gated assertion when accessing array indices in generated test code.
- Frequency table: "waitFor on .not.toBeInTheDocument delays failure diagnosis" added as new watch item (count 1). First occurrence — no rule change.

**Recommended changes (awaiting orchestrator approval before applying):**

1. **test-writer patterns memory** — add a note under the "Common TS compile errors" or equivalent section: when accessing array elements in test assertions, always use optional chaining (`result[0]?.label`) or assert the array length first (`expect(result).toHaveLength(3); result[0].label`). This prevents TS2532 on every generated test that indexes into a result array. The TS2532 pattern has now appeared twice in the test-writer's output — it is a systematic gap in the generation pattern, not a one-off.

2. **code-style.md (Section 6 — Next.js patterns) or new sub-section** — when `useTransition` is used to wrap a Server Action call, derive all loading UI from `isPending` alone. Do not introduce a parallel `isLoading` state unless `useTransition` is insufficient (e.g., multi-step async outside a transition). If both exist, ensure there is no window where both can be `false` while a fetch is in-flight. (Note: this is a SUGGESTION-level pattern only — do not propose this change until a third occurrence or until the existing hybrid is actually causing a user-visible bug.)

**False positives:** none detected.

**Positive signals:**
- Code reviewer clean on both commits — function splits (f0f8d0e) stayed within line limits.
- TS2532 error was caught by the pre-commit hook (type-check) before reaching git. The gate is working correctly. The goal of the test-writer memory update is to prevent the error from being generated in the first place, not to add a new gate.
- The 3 `formatActivityData` tests target the specific UTC regression that was previously a CodeRabbit finding. Proactive regression coverage for a known edge case.

---

### 2026-03-12 — Auth error destructuring cycle (commits 2190dd5, 67b24a6, 3a0d1e6, 78cb130)

**Context:** Four commits to apply and test a single cross-cutting fix — auth error destructuring from `getUser()` — across 7 sibling query files under `apps/web/lib/queries/`. The fix and its tests were correct, but the work was spread across 4 commits instead of 1 because the initial commit only covered 2 of the 8 files.

**Code reviewer:** clean on all 4 commits. The changes were targeted additions (destructure authError, add console.error, add early return, add test branches) with no style violations.

**Doc updater:** clean on all 4 commits. No schema, RPC, or route surface changed.

**Test writer:** found all 7 query files lacked an `authError` branch test. Tests were added across the 4 commits in this cycle alongside each source fix. All passing. No new source files were introduced without tests.

**Semantic reviewer findings:**

1. **ISSUE — Partial application of cross-cutting fix (2190dd5):** The auth error destructuring fix was applied to `analytics.ts` and `review.ts` but the remaining 6 sibling files (`dashboard.ts`, `progress.ts`, `question-stats.ts`, `reports.ts`, `quiz-report.ts`, `load-session-questions.ts`) were missed. Required 2 additional fix commits to close. This is the first occurrence of the meta-pattern: when a fix is a cross-cutting concern across a file family (a shared interface, a shared call site pattern), all siblings must be identified and fixed in the same commit. Cost: 3 extra commits and a second round of post-commit review. First occurrence — logged and watched.

2. **ISSUE — Auth error swallowed without logging in quiz-report.ts (78cb130):** `quiz-report.ts` destructured `authError` but returned early without calling `console.error`. Silent auth failures are harder to diagnose than explicit ones — a missing log leaves no trace in the server output when auth fails. Fixed in 78cb130. First occurrence of this specific sub-pattern (auth error silently discarded, not just not-destructured). Logged separately from the "mutation error silently dropped" pattern because the root cause differs: this is an explicit check that was made incomplete.

3. **ISSUE — Raw Supabase error message leaked to student UI (78cb130):** `load-session-questions.ts` returned `authError.message` directly to the caller (which ultimately surfaces to the student UI). Internal Supabase error strings are not safe to expose to end users — they may leak implementation details. Fixed in 78cb130 with a generic `'Authentication required'` message. First occurrence — logged and watched.

**Actions taken:**
- Frequency table: added 4 new watch items (all first occurrences): "Partial fix applied to sibling file group", "Auth error from getUser() not destructured", "Auth error from getUser() swallowed without logging", "Raw Supabase error message leaked to student UI".
- No rule changes proposed — all 4 patterns are first occurrences.

**Why no rule changes:**
- The partial-sibling-fix pattern (1 occurrence) needs a second occurrence before warranting a rule addition. If it recurs — same root cause, different file family — the correct fix is a rule in `code-style.md` or a note in agent-workflow: "when a fix addresses a shared call-site pattern, grep for all sibling files with the same pattern before committing."
- The auth error destructuring pattern (1 occurrence) is a sibling of the mutation-error-not-destructured rule already in `code-style.md` Section 5. If it recurs in a different query file or a different auth call site, the correct fix is to extend the existing rule to cover `getUser()` auth paths explicitly.
- The raw-error-to-UI pattern (1 occurrence) is a standard defense-in-depth concern. If it recurs, it warrants a note in `security.md` or `code-style.md`: "never return internal Supabase or DB error strings directly to client callers — return a generic message."

**False positives:** none detected.

**Positive signals:**
- Code reviewer was clean on all 4 commits — the fixes were mechanically correct (no style drift introduced while applying the cross-cutting change).
- Test coverage for auth error branches across 7 query files is now complete. The test-writer identified all 7 gaps in one pass, confirming its file-family awareness is working correctly.
- The 3 ISSUES (partial fix, silent log, raw error) were all caught and fixed within the same session — no deferred debt.

---

### 2026-03-13 — CodeRabbit triage cycle 6: ActivityBars extract + test reset (commit 8863926)

**Context:** This is the 6th consecutive CodeRabbit triage cycle on the same PR (feat/sprint-3-analytics). The commit addressed 3 findings from CodeRabbit review 5: extract `ActivityBars` presenter from `ChartBody` to bring the inner function under the 30-line cap, add `beforeEach` reset for a captured mock variable to prevent cross-test state coupling, and rename a test to match the sibling naming pattern.

**Code reviewer:** 0 blocking, 0 warnings. Noted `ActivityBars` at 38 lines — reviewer correctly classified this as acceptable (pure JSX array map with no logic). This is consistent with the existing documented exception for presenter components.

**Semantic reviewer:** 0 critical, 0 issues. 3 GOOD patterns noted: (1) `beforeEach` reset correctly wired to the hoisted capture variable — mock isolation improved; (2) `ActivityBars` extraction preserves the mock wiring for `BarChart` — no phantom test blindspot introduced by the split; (3) test rename to `renders X state` pattern is consistent with sibling tests.

**Doc updater:** no changes needed — refactor was internal to an analytics chart component, no schema, RPC, or route surface changed.

**Test writer:** no new tests needed. This was a pure presenter refactor and test-quality fix — existing tests already covered the logic. The test-writer's judgment was correct.

**Patterns checked this cycle:**

1. **useTransition + manual isLoading hybrid (count 2, RULE CANDIDATE):** Not flagged — the 8863926 commit touched only `activity-chart.tsx` (JSX presenter) and `activity-chart.test.tsx` / `statistics-tab.test.tsx`. No state logic was modified. The pattern has not spread to a new file and has not been flagged a third time. Rule candidate status remains — no rule change applied yet. Will trigger on the next commit that modifies state logic in `statistics-tab.tsx` or a sibling component using the same pattern.

2. **test-writer TS2532 unchecked index (count 2, RULE CANDIDATE):** Not triggered — the test edits were a `beforeEach` block addition and a `describe` rename, neither of which involved new array index access. Gate held.

3. **Function split to stay under 30-line cap:** `ChartBody` was split into `ChartBody` + `ActivityBars` specifically to satisfy the 30-line function rule. This is the rule working as intended. No violation — positive signal.

4. **Cross-test state coupling via shared capture variable (beforeEach fix):** The `capturedBarChartData` variable was shared across tests without reset, allowing a passing test to contaminate the next. Fixed by adding a `beforeEach(() => { capturedBarChartData = null })` (or equivalent reset). First occurrence of this specific pattern (hoisted mock capture not reset between tests). Logged as a new watch item.

**Actions taken:**
- Frequency table: added "Shared hoisted mock capture without beforeEach reset" as new watch item (count 1). First occurrence — no rule change. If it recurs, warrants a note in test-writer patterns memory.
- Updated "useTransition + manual isLoading hybrid" status note — not flagged this cycle, rule candidate status unchanged.
- Updated "test-writer TS2532" status note — not triggered this cycle, gate held.
- No rule changes proposed — no pattern crossed the 2+ threshold for the first time in this cycle.

**Positive signals:**
- **Sixth consecutive CodeRabbit cycle with no new BLOCKING or ISSUE findings.** The defect rate on this PR is trending toward zero as the triage cycles progress.
- **All 4 agents reported clean** — code-reviewer, semantic-reviewer, doc-updater, and test-writer all returned clean in a single pass. This has not happened before in a mid-session cycle on this branch; prior cycles always had at least one warning or suggestion requiring a follow-up commit.
- **The 30-line function rule caught a real structural issue** (`ChartBody` was doing layout + data mapping). The extraction of `ActivityBars` is a genuine improvement, not a mechanical compliance exercise.
- **The beforeEach reset fix** is a sign the test-writer's mock patterns are mature enough that test-quality issues are now being caught by CodeRabbit rather than going undetected in CI. Cross-test coupling via shared capture variables is subtle and easy to miss.

**False positives:** none detected.

---

### 2026-03-13 — feat/post-sprint-3-polish cycle (commits 6722e97, f6ba7a0, a09c6be, bba9800)

**Context:** Post-sprint-3 polish branch. Four agents reviewed 4 commits. Two CRITICALs from semantic-reviewer, both fixed before cycle closed.

**Code reviewer (6722e97):** 2 findings, both fixed in the same commit.
- `statistics-tab.tsx` exceeded 150-line component limit — fixed by extracting `useQuestionStats` hook. This is a **recurring pattern** (component file size overflows have appeared in quiz-config-form.tsx, use-quiz-state.ts, and now statistics-tab.tsx — 3 occurrences total across different file types). The root cause is the same each time: a component accumulates state logic that belongs in a hook.
- `useEffect` for data fetching in statistics-tab.tsx — **third occurrence** of this pattern. Rule exists. Compliance gap at authoring time, not a rule gap.

**Semantic reviewer — 2 CRITICALs + 3 ISSUEs, all fixed:**

1. **CRITICAL — `checkAnswer` directly SELECTed from `questions` table (f6ba7a0):** This is the **second occurrence** of correct-answer exposure via direct table query (first was the original lack of `get_quiz_questions()` RPC use). The fix replaced the direct query with a `check_quiz_answer` RPC. Rule exists in security.md rule 1 and CLAUDE.md. Compliance gap: the function was new code, authored without checking whether a question lookup needs to go through an RPC. This pattern suggests that any new function touching the `questions` table should be treated as a security gate, not just a data access pattern.

2. **CRITICAL — `student_responses` had no UNIQUE constraint; ON CONFLICT was dead code (a09c6be):** `ON CONFLICT ON (session_id, question_id)` was specified in an INSERT statement but the corresponding UNIQUE constraint was never created in the migration. The conflict clause silently had no effect, meaning duplicate rows could be inserted. Fixed by adding UNIQUE constraint via migration. First occurrence of this specific failure mode: a UNIQUE constraint referenced in application code but absent from the schema. Logged as new watch item.

3. **ISSUE — Draft count TOCTOU race:** Count was read, then checked, then INSERT issued — but no lock prevented two concurrent requests from both reading count < limit and both inserting. Fixed with a DB trigger that enforces the limit at write time. First occurrence. DB-level enforcement is the correct fix for count-gated writes — application-layer checks are always racy.

4. **ISSUE — `getFilteredCount` fetched unscoped `student_responses`:** The query returned counts across all students because it was missing a `WHERE student_id = auth.uid()` filter. First occurrence of this specific sub-pattern (query returning another student's data via missing scope clause). Distinct from the RPC identity-guard pattern (which is about SECURITY DEFINER functions accepting a student ID param). Logged separately.

5. **ISSUE — `handleSelectAnswer` had no re-entry guard:** The async handler could fire twice on rapid user interaction (double-tap), initiating two concurrent state transitions. Fixed with an `isSubmitting` ref checked at entry. First occurrence.

**Doc updater:** plan.md, decisions.md, database.md all updated in same cycle (bba9800 / 8be4dfd). No partial-doc-fix pattern. Clean.

**Test writer (bba9800):** 4 new test files, 56 tests total written. One test file initially had wrong fixture types (SubjectOption shape mismatch between what was constructed in the fixture and the actual exported TypeScript type). This is the **second occurrence** of a test fixture shape mismatch (first: missing `short` prop on 2026-03-11). Both caught by pre-commit type-check before reaching git. Frequency table updated: count 1 → 2, status RULE CANDIDATE.

**Actions taken:**
- Frequency table: "useEffect data fetching" count 2 → 3. Status: RULE EXISTS, compliance gap. No change.
- Frequency table: "Direct SELECT from questions bypassing RPC" count updated to 2. Status: RULE EXISTS, compliance gap — security.md rule 1, CLAUDE.md. No change to rules.
- Frequency table: "Test fixture shape mismatch" count updated from 1 (was "Missing short prop") to 2. Status: RULE CANDIDATE.
- Frequency table: 5 new watch items added (all first occurrences): ON CONFLICT without UNIQUE constraint, TOCTOU draft count race, query missing student_id scope, UI handler missing re-entry guard.

**Recommended changes (awaiting orchestrator approval before applying):**

1. **test-writer patterns memory** — add a note: always construct test fixtures by importing and satisfying the exported TypeScript type directly (e.g., `const fixture: SubjectOption = { ... }`), not by constructing a plain object and hoping the shape matches. The type annotation forces a compile-time check. This is distinct from the TS2532 array-index rule already pending — this is about fixture object construction, not array access. Two occurrences of fixture shape mismatch across different sessions warrant this addition.

**Rule gaps identified (not yet actionable — awaiting second occurrence):**
- Any new function that queries the `questions` table should require a code review checkpoint that it uses `get_quiz_questions()` or a designated RPC rather than a direct SELECT. The correct gate for this is the security-auditor agent (already checks for `SELECT *` violations) plus a note in `docs/security.md` or `security.md` that even non-`SELECT *` queries against `questions` exposing `correct`/`correct_explanation` fields are violations. If this recurs a third time, extend security.md rule 1 explicitly.
- The TOCTOU pattern (read count → check → insert) is a known race when implemented in application code. If it recurs on a different resource, add a rule note: "count-gated inserts must enforce the limit via a DB trigger or a row-level lock, not an application-layer count check."

**False positives:** none detected.

**Positive signals:**
- Both CRITICALs were caught by the semantic-reviewer post-commit (not discovered in production). The security gate is working at the right layer.
- The UNIQUE constraint finding is notable: the bug was fully invisible to lint, type-check, and unit tests. Only semantic review of the migration against the INSERT statement revealed the gap. This validates keeping the semantic reviewer focused on data correctness, not just code style.
- The test-writer's 56-test output covered all five fixed areas. Having test coverage land in the same session as the fixes is the correct pattern.
- Doc-updater updated all three documents in the same cycle — no partial-doc-fix recurrence.

---

### 2026-03-13 — Post-sprint-3-polish fix cycle (commits 7c2d7c5, 890a63b, 6d274fa, fe4ffff)

**Context:** Four commits polishing the feat/post-sprint-3-polish branch. Fixes included splitting `draft.ts` (166 lines → 114+37), stale-fetch race in a useEffect, draft update silent no-op, and wrapping all post-fetch setState calls in a cancellation guard.

**Code reviewer (6d274fa):** 1 BLOCKING watch item.
- `draft.ts` was 166 lines (Server Action limit: 100). Split into a 114-line primary file and a 37-line helper. The 114-line file still exceeds the 100-line limit. The root cause was a two-stage effect: the file was authored near the limit, then Biome auto-format on pre-commit expanded compact code from ~97 to 114 lines (multiline object/function formatting). **First occurrence of Biome expansion pushing a file over limit at commit time.** The authoring-time count is not a reliable pre-commit estimate — Biome's formatter can add 15–20% line count to compact code. Logged as new watch item.

**Semantic reviewer:** 3 findings.

1. **ISSUE — Stale-fetch race in useEffect (fe4ffff):** A `useEffect` that triggered an async fetch did not set a `cancelled` flag. If the component unmounted or the effect re-ran (deps changed) before the fetch resolved, the subsequent `setState` call would execute against an unmounted or stale component context. Fixed in fe4ffff with a `let cancelled = false` flag checked inside the fetch's `.then()` / `catch()` before any setState calls, and a cleanup function that sets `cancelled = true`. This is a distinct pattern from "useEffect data fetching in client component" (that rule bans server-action fetching in useEffect — this is a permitted client fetch with a missing cleanup guard). **First occurrence.** Logged as new watch item.

2. **ISSUE — Draft UPDATE returning zero rows treated as success (6d274fa):** The `updateDraft` Server Action called `.update()`, checked `{ error }`, found no error, and returned `{ success: true }` — but the update matched 0 rows because the draft ID did not belong to the current student. The Supabase client returns `{ error: null, count: 0 }` for a successful-but-no-op UPDATE. Callers received a success response for a write that did nothing. Fixed by checking the row count (`count === 0`) and returning `{ success: false, reason: 'not_found' }`. **First occurrence of this specific sub-pattern** — distinct from "Supabase mutation result not destructured" (that is about missing `{ error }` destructuring — this is about a successful query that silently updated nothing). Logged as new watch item.

3. **ACCEPTED (study mode by design) — `fetchExplanation` session gate:** semantic-reviewer suggested that `fetchExplanation` should not allow calls outside an active session. After review, this path is intentional: the explanation endpoint is used in study mode (reviewing past answers without an active session). Accepted as a design exception. **No action.**

**Test writer:** 2 findings.

1. **Cancelled flag path not testable in jsdom:** The `useEffect` cleanup path — where `setState` is skipped because `cancelled === true` — cannot be tested in jsdom. `act()` in `@testing-library/react` flushes all effects synchronously, so by the time assertions run, the cleanup function has already fired and the effect is no longer observable in its pre-cleanup state. This is an extension of the existing jsdom pre-hydration limitation. **First occurrence for this specific sub-pattern.** Logged as new watch item. Do not write tests for the cancelled flag path — document the constraint in code-style.md Section 7 (jsdom limitations) if this recurs.

2. **Count-error branch untested in existing file:** `draft.ts` had test coverage for the happy path but not for the case where the count query itself returned an error. The error path was reachable code. Test-writer wrote the missing branch test. **First occurrence of this specific sub-pattern** — distinct from "new file without test" (this is an existing tested file with an uncovered error branch). Logged as new watch item.

**Doc updater:** no changes needed — all changes were internal to existing modules, no schema, RPC, or route surface changed.

**Actions taken:**
- Frequency table: 6 new watch items added (all first occurrences): "Server Action file exceeding 100-line limit after Biome auto-format", "Biome auto-format expanding compact code past file-size limit", "Async fetch in useEffect without stale-result cancellation flag", "UPDATE returning zero rows treated as success (silent no-op)", "Error path in existing function untested (count-error branch)", "Async cleanup path untestable in jsdom (cancelled flag branch)".
- No rule changes proposed — all patterns are first occurrences. Rule changes require 2+ occurrences across different commits.

**False positives:**
- `fetchExplanation` session gate flagged by semantic-reviewer — accepted as by-design study mode path. Logged to avoid re-flagging.

**Positive signals:**
- All four commits were scoped correctly — no cross-feature drift, no partial fixes left open.
- The cancellation flag pattern (let cancelled = false + cleanup return) is a standard React/JS idiom for async effect cleanup. Good template for future useEffect-with-fetch patterns in the codebase.
- Splitting `draft.ts` was the correct call even though the primary file (114 lines) still sits over the 100-line limit — the alternative (one 166-line file) was worse. The Biome expansion watch item will prompt a more conservative split threshold next time.

---

### 2026-03-13 — use-quiz-state hook split + batch_submit_quiz SQL hardening (commits 741ae30 → 34a9352 → df5d354)

**Context:** Three-commit fix cycle on feat/post-sprint-3-polish. Commits 741ae30 (validation hardening), 34a9352 (hook split + SQL type cast fix), df5d354 (stale closure fix after split). Three rounds of post-commit review — all agents reported clean on round 3.

**Code reviewer (741ae30):** 1 BLOCKING.
- `use-quiz-state.ts` at 117 lines (hook limit: 80). This is the **fourth occurrence** of the hook-exceeds-80-lines pattern. Fixed in 34a9352 by splitting the hook. Frequency table count updated: 3 → 4. The 70-line watch threshold added in an earlier cycle was not acted on proactively — the file grew 37 lines past the 80-line limit before being caught post-commit. Rule and watch threshold both exist; compliance gap at authoring time persists.

**Code reviewer (34a9352):** clean — hook split brought use-quiz-state.ts under limit.

**Code reviewer (df5d354):** clean — stale closure fix was a targeted single-function change.

**Semantic reviewer (741ae30):** 1 ISSUE + 2 suggestions.

1. **ISSUE — Duplicate-answer check used text comparison instead of ::uuid cast:** In `batch_submit_quiz`, the duplicate-answer detection compared option/question IDs as plain text strings rather than casting to `::uuid`. UUID comparisons as text can fail on case variation or format differences (e.g., uppercase vs lowercase hex). Fixed in 34a9352 by adding `::uuid` casts to the comparison. **First occurrence.** Logged as new watch item.

2. **SUGGESTION — Malformed session config guard:** A guard condition in the session config check was improperly structured (likely a missing parenthesis or operator precedence issue). Fixed in 34a9352. First occurrence — suggestion level, no rule action.

3. **SUGGESTION — Lock ordering comment:** Semantic reviewer recommended adding a comment explaining the order in which row locks are acquired to prevent potential deadlocks if lock order is ever changed. No fix applied (suggestion only). First occurrence — logged for awareness.

**Semantic reviewer (34a9352):** 1 ISSUE.

1. **ISSUE — Stale `currentIndex` in `handleSave` after hook split:** When `use-quiz-state.ts` was split, `handleSave` captured `currentIndex` as a scalar in a closure rather than reading it via a ref. Because React state updates are async, the `currentIndex` value captured at the time `handleSave` was defined could be stale by the time the callback executed. Fixed in df5d354 by accessing `currentIndex` via a `useRef` or via a functional updater pattern. Root cause: the act of splitting the hook introduced a stale closure that did not exist in the monolithic version (where the value and its consumer were in the same closure scope). **First occurrence of the meta-pattern: hook split introducing a stale closure on a formerly-adjacent value.** Logged as new watch item.

**Semantic reviewer (df5d354):** clean — 0 issues, 0 suggestions.

**Doc updater:** database.md updated (batch_submit_quiz duplicate check change noted), plan.md updated (sprint progress), MEMORY.md updated. One minor database.md fix applied in a follow-up commit. No partial-doc-fix pattern.

**Test writer (741ae30):** Added double-click race test for handleSelectAnswer guard (first occurrence of this test pattern). Passing.

**Test writer (34a9352 + df5d354):** Added 6 tests covering handleDiscard and showFinishDialog behavior. All passing.

**Actions taken:**
- Frequency table: "Hook file exceeding 80-line limit" count updated 3 → 4. Status unchanged (RULE EXISTS, compliance gap).
- Frequency table: 2 new watch items added (both first occurrences): "Stale closure introduced by hook split (scalar vs ref)" and "SQL string comparison instead of ::uuid cast in duplicate check".
- No rule changes proposed — both new patterns are first occurrences. The recurring hook-oversizing pattern (count 4) already has a rule and a 70-line watch threshold; the compliance gap is at authoring time, not in rule coverage.

**Rule gaps identified (not yet actionable — awaiting second occurrence):**
- When a hook is split, the developer must audit all callbacks in the extracted portion for captured scalar state values — any `state` variable read inside a `useCallback`/handler that is not in the dependency array (or is in the dependency array but is a primitive) is a stale closure candidate. If this pattern recurs on a different hook split, add a note to code-style.md Section 2 (hooks) or agent-workflow about the split-induced stale closure risk.
- UUID comparisons in SQL should use `::uuid` casts, not plain text comparison. If this recurs in a different migration or RPC, add a note to `docs/security.md` or `docs/database.md`: "always cast UUID parameters and stored values to `::uuid` in comparison expressions."

**False positives:** none detected.

**Positive signals:**
- Round 3 (df5d354) was fully clean — all 4 agents returned clean in a single pass. The fix cycle closed correctly with no secondary issues on the fix commit.
- The stale closure in handleSave was caught by the semantic reviewer on the fix commit (34a9352), not in production. The agent caught a regression introduced by its own prior recommendation (hook split). This demonstrates the value of re-running semantic review on fix commits that modify production code.
- The double-click race test (741ae30) and the handleDiscard/showFinishDialog tests (df5d354) add concrete behavioral coverage for interaction-state edge cases that are easy to miss in manual testing.

---

### 2026-03-13 — Session ownership hardening + Array.isArray guards (commits 306f44a, a0d9973, 5b2864f)

**Context:** Three-commit fix cycle on feat/post-sprint-3-polish. Commit 306f44a addressed CodeRabbit findings (session ownership checks, answer error recovery, SQL field validation, hook split to use-answer-handler). Commit a0d9973 addressed two post-commit semantic-reviewer ISSUEs (Array.isArray guards, reactive lock clearing). Commit 5b2864f refined the lock-clearing approach (restore synchronous clear + keep useEffect as safety drain) and added Array.isArray test coverage.

**Code reviewer:** clean on all 3 commits — 0 blocking, 0 warnings. All file-size limits respected after the use-answer-handler extraction.

**Semantic reviewer (306f44a):** 2 ISSUEs.

1. **ISSUE — Missing Array.isArray guard on type-cast config data (→ fixed a0d9973):** In `check-answer.ts` and `fetch-explanation.ts`, the session config's `question_ids` field was cast `as unknown as string[]` and passed directly to `.includes()`. No runtime check verified the cast was valid. If the DB returned a non-array (corrupted config, null, string field), `.includes()` would throw at runtime. Fixed by wrapping the `.includes()` call in an `Array.isArray(questionIds)` guard. Root cause: a TypeScript cast (`as unknown as T`) creates no runtime guarantee — when the source is external data (DB/RPC), the cast assumption must also be validated at runtime. This is the **second occurrence** of a cast bypassing a needed runtime validation (first: batch_submit_quiz malformed config cast in a prior commit). Count in frequency table: 2. Status: RULE CANDIDATE.

2. **ISSUE — Imperative ref clear in catch block creating re-entry window (→ fixed a0d9973, refined 5b2864f):** `use-answer-handler.ts` cleared `lockedRef.current.delete(questionId)` in the catch block to allow retry after an error. However, the React `answers` state update (which also drives the lock) was enqueued asynchronously — there was a brief window between the synchronous ref clear and the state settling where a second call could enter before the first was fully resolved. Fixed in a0d9973 by replacing the imperative catch-block clear with a `useEffect` keyed on `answers` state. In 5b2864f, the synchronous clear was restored for immediate user retryability, with the `useEffect` kept as a safety drain. The final solution uses both: synchronous clear for speed, reactive drain as a correctness backstop. **First occurrence** of this specific async-lock re-entry window pattern. Logged as new watch item.

**Semantic reviewer (a0d9973 and 5b2864f):** clean — 0 issues, 0 suggestions on both fix commits.

**Doc updater:** `docs/database.md` and `docs/plan.md` updated in a0d9973 with migration 026 notes. Clean — no partial-doc-fix pattern.

**Test writer (306f44a):** `use-answer-handler.ts` was a new hook file created in the same commit without a co-located test file. This is the **fourth recurrence** of the "new hook file shipped without tests" pattern (code-style.md Section 7 rule was added on the second occurrence). 12 tests were written in the follow-up commit a0d9973. The compliance gap at authoring time persists — the rule is clear and in place, but hook extractions routinely ship without tests and are caught post-commit by the test-writer.

**Test writer (a0d9973):** 14 tests written total — 12 for `use-answer-handler.ts` (lock guard, error recovery, answer tracking) and 2 for `lookup.ts` empty-string UUID path. All passing.

**Test writer (5b2864f):** 6 tests added — Array.isArray guard paths (null question_ids, string question_ids, null config) in `check-answer` and `fetch-explanation`. All passing. These directly targeted the gap noted in the semantic reviewer's ISSUE on 306f44a.

**Actions taken:**
- Frequency table: "New hook/utility file shipped without a test file" count updated 3 → 4. Status unchanged (RULE EXISTS, compliance gap at authoring time).
- Frequency table: 3 new entries added: "Type cast bypassing runtime validation" (count 2, RULE CANDIDATE), "New hook file extracted without shipping tests in the same commit" (count updated in frequency table row), "Imperative ref clear in catch block leaving re-entry window" (count 1, Watch).

**Pattern analysis — type cast without runtime guard (count 2, RULE CANDIDATE):**

Both occurrences share the same structure:
- External data (DB/RPC result or config jsonb field) is cast using `as unknown as T[]`
- A method that requires the runtime type (`.includes()`, `jsonb_array_elements()`, iteration) is called immediately on the cast result
- No `Array.isArray()` / `typeof` / `instanceof` check validates the assumption before use

The TypeScript cast is a compile-time assertion only. When the underlying data is external (Supabase query result, jsonb field, RPC output), the cast does not guarantee the runtime shape. A rule clarification in `code-style.md` Section 5 (TypeScript Rules) is warranted.

**Recommended change (awaiting orchestrator approval):**

Add to `code-style.md` Section 5, after the "No Type Casting Unvalidated External Data" rule:

```
// ❌ WRONG — cast from external data with no runtime guard
const questionIds = config.question_ids as unknown as string[]
if (questionIds.includes(questionId)) { ... }   // throws if config is null/string/object

// ✅ CORRECT — cast paired with runtime guard
const questionIds = config.question_ids as unknown as string[]
if (Array.isArray(questionIds) && questionIds.includes(questionId)) { ... }
```

**Rule gaps identified (not yet actionable — awaiting second occurrence):**
- The imperative-ref-clear re-entry window (first occurrence) has no corresponding rule. If it recurs on a different handler that uses a ref-based lock, add a note to code-style.md about the two-mechanism pattern: synchronous ref clear for speed + reactive effect drain for correctness backstop.

**False positives:** none detected.

**Positive signals:**
- Semantic reviewer was clean on both fix commits (a0d9973 and 5b2864f) — the fixes were correct and introduced no secondary issues.
- The Array.isArray guard tests (5b2864f — 6 tests) were written to specifically target the guard paths identified by the semantic reviewer. The test cycle closed tightly: ISSUE found in 306f44a, guards added in a0d9973, guard paths tested in 5b2864f.
- The dual-mechanism lock-clearing solution (sync clear + reactive drain) is a good pattern for async locks where both speed (user retryability) and correctness (state consistency) matter.
- Code reviewer clean on all 3 commits confirms the use-answer-handler split and SQL hardening respected all file-size and style limits.

---

### 2026-03-13 — CodeRabbit PR #74 fixes + answeredCount counter (commits 675104e, 4798fdb)

**Context:** Two-commit cycle on feat/post-sprint-3-polish. 675104e addressed 8 CodeRabbit PR #74 findings (session-runner, session-summary, draft.ts, reports.ts, lookup.ts, load-draft.ts, seed-eval.ts). 4798fdb fixed a semantic-reviewer ISSUE from the first commit and added 14 new tests.

**Code reviewer (675104e):** clean — 0 blocking, 0 warnings.

**Code reviewer (4798fdb):** clean — 0 blocking, 0 warnings. (Changes were hook state addition + 2 new test files only.)

**Semantic reviewer (675104e):** 1 ISSUE + 1 SUGGESTION.

1. **ISSUE — `answeredCount` derived from `currentIndex + 1` (fixed 4798fdb):** In `use-session-state.ts`, the hook returned `answeredCount: currentIndex + 1`. This was introduced in 675104e as the CodeRabbit fix to stop computing the count in `session-runner.tsx`. However, using the navigation index as a proxy for "answers given" is semantically wrong: `currentIndex` represents which question is currently displayed, not how many answers have been submitted. Under normal linear flow these co-vary, but they diverge on non-linear navigation (e.g., jumping back), session restore with a mid-session index, or any future feature that changes index without answering. Fixed in 4798fdb with a dedicated `answeredCount` `useState` initialised to `0` and incremented via functional updater inside `handleSubmit`. Root cause: same family as the prior "SQL score aggregation over full table" issue — a value that co-varies with the target metric under happy-path conditions but is not semantically equivalent. **This is the second occurrence of the "derived value correct by coincidence" meta-pattern.** Count in frequency table: 2. Status: RULE CANDIDATE.

2. **SUGGESTION — `answers` cast in `load-draft.ts` unguarded:** The `rowToDraftData` function added a `isSessionConfig` runtime guard for the `session_config` field (correctly fixing a prior CodeRabbit finding), but left a second cast in the same function — `row.answers as Record<string, { selectedOptionId: string; responseTimeMs: number }>` — without a corresponding guard. Suggestion-level — not fixed in this cycle. **First occurrence of this specific sub-pattern: partial runtime guard coverage within a single function (one field guarded, sibling field unguarded).** Logged and watched.

**Semantic reviewer (4798fdb):** clean — 0 issues, 0 suggestions.

**Doc updater (675104e + 4798fdb):** no changes needed — both commits changed only component logic, hook state, and test files. No schema, RPC, or routing surface changed.

**Test writer (675104e):** `isSessionConfig` guard shipped in 675104e without a test file for `load-draft.ts`. DB error logging in `lookup.ts` also added without new tests. Both gaps filled in 4798fdb.

**Test writer (4798fdb):** 14 new tests across 2 new files.
- `load-draft.test.ts` (10 tests): `isSessionConfig` guard paths (null, non-object, missing sessionId, sessionId as non-string, valid minimal, valid with optional fields), malformed config fallback (returns empty sessionId, logs error), happy path (correct field mapping).
- `lookup.test.ts` (4 tests): DB error logging paths for the new `console.error` call sites added in 675104e.

All 14 tests passing before report.

**Pattern analysis — "derived value correct by coincidence" (count 2, RULE CANDIDATE):**

Both occurrences share the same structure: a metric that needs to be tracked is computed by reading a structural or positional value that co-varies under normal flow but is not semantically equivalent to the metric. Both are correct on the happy path and pass all tests. Both diverge on edge cases (non-linear navigation, partial operations, session restore).

Occurrences:
1. `batch_submit_quiz` SQL: score derived from full-table count rather than the current batch (f53eccf)
2. `answeredCount: currentIndex + 1` (675104e) — co-varies normally, breaks on non-linear navigation or session restore

**Recommended change (awaiting orchestrator approval):**

Add a note to the learner's patterns memory capturing the principle for future authoring guidance: when a metric needs to be tracked (count, score, progress), introduce a dedicated state variable incremented at the domain event. Do not derive the metric from a structural position (index, array length, loop counter) that co-varies under normal conditions but is not semantically equivalent. The derivation is "correct by coincidence" and will fail when an edge case changes the structural variable independently.

This note should also be flagged for the test-writer patterns memory: when reviewing a new hook or function, check whether an output value is derived from a positional or structural proxy rather than a dedicated accumulator. If so, flag it as a potential "correct by coincidence" derivation.

No rule change proposed for `code-style.md` at this time — two occurrences of a semantic anti-pattern is sufficient to log and recommend, but this does not map to a mechanically checkable rule. Agent memory is the right home.

**Actions taken:**
- Frequency table: "Derived value correct by coincidence (index used as count proxy)" added at count 2, status RULE CANDIDATE.
- Frequency table: "Partial runtime guard coverage within function (sibling cast unguarded)" added as new watch item at count 1.
- No rule changes applied to `code-style.md` or `security.md` this cycle.

**False positives:** none detected.

**Positive signals:**
- 675104e was clean on code-reviewer — all 8 CodeRabbit fixes respected file-size and style limits.
- The fix in 4798fdb is minimal and correct: 3 lines changed, no secondary effects, semantic reviewer confirmed clean.
- The `isSessionConfig` guard is a direct application of the "type cast + runtime guard" rule added in 22c3d5e. The remaining `answers` cast is a partial-compliance gap, not a rule gap.
- 14 new tests in 4798fdb tightly target the paths introduced in 675104e. Code added in one commit, tests backfilled in the next with no gaps escaping to git.

---

### 2026-03-13 — CodeRabbit PR #74 address-8-findings cycle (commits 33c1fa8, d06c25b)

**Context:** Two-commit cycle on feat/post-sprint-3-polish. 33c1fa8 addressed 4 CodeRabbit PR #74 findings (latest review round). d06c25b is the fix commit that resolved the semantic-reviewer ISSUE and the test-writer gap from the 33c1fa8 post-commit review.

**Code reviewer (33c1fa8):** clean — 0 blocking, 0 warnings.

**Semantic reviewer (33c1fa8):** 1 ISSUE.

1. **ISSUE — Silent `answeredCount` fallback in `reports.ts` (fixed d06c25b):** For completed sessions where no `quiz_session_answers` rows exist, `reports.ts` returned `answeredCount: 0` silently with no logging. A completed session with zero answer rows is anomalous — the fallback hides a data integrity gap from server logs, making it invisible during incident diagnosis. Fixed in d06c25b with `console.warn('[getReportData] answeredCount fallback triggered: completed session has no answer rows', { sessionId })`. Root cause: same family as the `boundParam` silent fallback (53efbdd) — a numeric fallback that produces a valid-looking result with no server-side observability signal. **This is the second occurrence of the "silent numeric fallback without logging" pattern.** Count in frequency table: 2. Status: RULE CANDIDATE.

**Doc updater (33c1fa8):** clean — no updates needed. Both commits changed only query logic and test files; no schema, RPC, or routing surface changed.

**Test writer (33c1fa8):** 1 gap — `draft.ts` users query error path had no test. When `getUser()` returns an error for the users query inside `draft.ts`, there was no test branch covering that path. Test added in d06c25b (20 lines, 28/28 pass). Root cause: a new error-return path was added to an existing function without updating the test file to cover the new branch. **This is the second occurrence of "error path in existing function untested."** Count in frequency table: 2. Status: RULE CANDIDATE.

**Code reviewer (d06c25b):** clean — 0 blocking, 0 warnings. (2 files changed: reports.ts +6 lines, draft.test.ts +20 lines. Both within limits.)

**Semantic reviewer (d06c25b):** clean — 0 issues, 0 suggestions.

**Doc updater (d06c25b):** clean — no updates needed.

**Test writer (d06c25b):** no gaps.

**Meta-pattern observed: CodeRabbit vs per-commit diff scope:**
The context for this cycle noted that CodeRabbit reviews the full PR diff while our per-commit agents review only the commit diff. CodeRabbit has caught cross-file consistency issues (test assertions not matching production code from earlier commits, doc matrix inconsistencies spanning multiple files) that our per-commit agents missed because the relevant context spanned commits. This is a structural gap in coverage, not a failure of individual agents. Logged as a system-level insight — no action to rules warranted, but worth noting for agent design: if a future improvement to the per-commit review pipeline is considered, cross-commit diff coverage would close this gap.

**Pattern analysis — "silent numeric fallback without logging" (count 2, RULE CANDIDATE):**

Both occurrences:
1. `boundParam` in `analytics.ts` (53efbdd): NaN/±Infinity input silently clamped to minimum, no console.warn. Suggestion-level, not fixed.
2. `answeredCount` in `reports.ts` (33c1fa8): completed session with no answer rows returned 0 silently, no console.warn. ISSUE-level, fixed in d06c25b.

Both share the structure: a numeric computation whose source data is empty, malformed, or anomalous falls back to a minimum/zero value, and the caller receives a structurally valid result with no server-side signal. The fix pattern is consistent: add a `console.warn` with context (function name, relevant IDs) before returning the fallback.

This is a RULE CANDIDATE. However, it is suggestion-level for the `boundParam` case (parameter clamping functions commonly clamp silently) and ISSUE-level for query functions that return business metrics (where an anomalous result should always be logged). The distinction matters:
- **Utility math helpers** (clamp, bound): console.warn is good practice, not required.
- **Query/data functions that return business metrics** (count, score, answeredCount): a fallback to 0 where non-zero is expected is always anomalous and must log.

No rule change to `code-style.md` proposed yet — the distinction between utility clamping and metric fallback is semantic, not mechanical. Log in agent memory. If a third occurrence in a data/query function surfaces, add a note to `code-style.md` Section 5 or the semantic-reviewer's checklist: "data functions returning numeric metrics must not silently fall back to 0 — add a console.warn with the relevant ID when the fallback fires."

**Pattern analysis — "error path in existing function untested" (count 2, RULE CANDIDATE):**

Both occurrences in `draft.ts`:
1. Count-error path (Cycle 1, 2026-03-13): `getCount()` error branch had no test.
2. Users-query error path (d06c25b): `getUser()` error return inside the same file had no test.

Both share the structure: a new error-return path is added to an existing file that already has a test file, but the test file is not updated in the same commit to cover the new branch. The test-writer catches the gap post-commit.

The root cause differs from "new hook file shipped without tests" (where an entire new file has no test). Here, the test file exists but is incomplete after new error paths are added. The correct fix is: whenever a new `if (error) return ...` path is added to a file that has a co-located test, add the corresponding test branch in the same commit.

This is the correct place for a test-writer patterns memory note (not a code-style.md rule — the existing "new file must have tests" rule does not cover existing files gaining new branches). Proposed addition to test-writer patterns memory: when reviewing a diff, check every new `if (error)` branch and every new early-return path in files that have an existing test file — those branches need test coverage in the same commit.

**Actions taken:**
- Frequency table: "Silent numeric fallback without observability logging" updated to count 2, status RULE CANDIDATE.
- Frequency table: "Error path in existing function untested" updated to count 2, status RULE CANDIDATE.
- Frequency table: new entry added for "CodeRabbit vs per-commit diff scope" as a system-level observation (not a code pattern — no frequency tracking needed, logged in lessons only).
- No rule changes applied to `code-style.md` or `security.md` this cycle — both new RULE CANDIDATE patterns are at the 2-occurrence threshold but the actionable guidance belongs in agent memory (test-writer patterns) rather than mechanically checkable code rules.

**Recommended changes (awaiting orchestrator approval before applying):**

1. **`.claude/agent-memory/test-writer/patterns.md`** — add a note: when reviewing a commit diff, check every new `if (error) return` or early-return path added to a file that already has a co-located test file. Each new error-return branch that has no corresponding test case in the same commit is a coverage gap. Write the test branch in the same commit as the production change, not as a post-commit backfill.

2. **`.claude/agent-memory/test-writer/patterns.md`** (secondary) — add a note: when a new query is added to an existing function (e.g., a second `supabase.auth.getUser()` call or a second `.from()` query), check whether the test file covers the error path for the new query. Adding a second query to a function that already has tests for the first query's error path does not automatically cover the second query's error path.

**False positives:** none detected.

**Positive signals:**
- Both agents (code-reviewer and semantic-reviewer) were clean on the fix commit (d06c25b) — the fix was minimal and correct.
- The `console.warn` fix pattern is consistent with prior fixes (auth error logging in query files, 78cb130). The project now has a clear convention: anomalous data states in server functions are logged with context before falling back.
- The test coverage for the users-query error path (draft.test.ts, 20 lines) is direct and well-targeted — it exercises exactly the branch that was missing.
- Cycle closed in 2 commits with all agents clean on the second commit.

---

### 2026-03-13 — Pre-cast validation + type guard tests (commits 274821b, 34c9b36)

**Context:** Two commits on feat/post-sprint-3-polish. 274821b added `isCheckAnswerRpcResult` type guard and pre-cast text validation in `batch_submit_quiz`. 34c9b36 fixed two semantic-reviewer findings from the prior round (bounded regex, case-insensitive dedup) and added 6 type guard tests via test-writer.

**Code reviewer:** clean — 0 blocking, 0 warnings on both commits.

**Semantic reviewer (274821b):** 1 ISSUE + 2 SUGGESTIONS. ISSUE fixed in 34c9b36. Suggestions addressed in 34c9b36.

1. **ISSUE — Unbounded `^\d+$` regex on response_time_ms permits int overflow:** The pre-cast text validation added in 274821b used `^\d+$` to gate the cast from text to INT in the `batch_submit_quiz` RPC. `^\d+$` imposes no upper digit count, so a payload with a 20-digit numeric string passes the regex check and then overflows PostgreSQL INT on cast. Fixed in 34c9b36 with `^\d{1,10}$` (10 digits = 9,999,999,999, safely within INT range). Root cause: the regex was written to validate "is numeric" but not "is in the target type's range." **First occurrence.** Logged as new watch item. The principle: any SQL regex that validates a value before casting to a bounded numeric type must also bound the digit count to match the target type's maximum.

2. **SUGGESTION — Duplicate-answer dedup compared text without `lower()`:** The text-based dedup check (introduced in 274821b to avoid a cast error on malformed UUIDs) compared raw text, which is case-sensitive. A client sending mixed-case UUID hex digits could bypass the dedup. Fixed in 34c9b36 with `lower(e->>'question_id')`. Defense-in-depth: standard UUID generators produce lowercase, but the guard should not assume that. **First occurrence.** Logged as new watch item. Distinct from the previously tracked "SQL string comparison instead of ::uuid cast" pattern (that is about using text vs. typed comparison — this is about normalising case before text comparison).

3. **SUGGESTION — Type guard tests missing for `isCheckAnswerRpcResult`:** The type guard was added in 274821b without a corresponding test. Fixed by test-writer in 34c9b36 (6 tests covering: non-null primitive, missing `is_correct`, `is_correct` as string, `correct_option_id` as null, `explanation_text` as number, `explanation_image_url` as number). All 6 tests passing. This is another recurrence of the "new function shipped without tests" compliance gap — the type guard was a new exported-equivalent function and should have shipped with tests in the same commit.

**Doc updater:** no changes needed — both commits modified existing modules with no schema, RPC signature, or route surface change. The database.md batch_submit_quiz documentation already reflected the pre-cast validation additions from the prior migration (027).

**Test writer (34c9b36):** 6 tests written for `isCheckAnswerRpcResult` type guard. All passing. These covered every branch of the guard function — both the happy path (all fields correct types) and 5 rejection cases (one per field or structural check). High-signal coverage.

**Pattern analysis — type cast bypassing runtime validation (closed):**

The "type cast bypassing runtime validation" pattern (count 2, RULE CANDIDATE as of the 306f44a/a0d9973 cycle) has now been resolved at the rule level: `code-style.md` Section 5 was updated with the runtime guard requirement, and `.coderabbit.yaml` was synced (commit 22c3d5e). Commit 274821b demonstrates the rule being applied correctly: `isCheckAnswerRpcResult` replaces the bare `!data` check with a full structural type guard. Status in frequency table updated from RULE CANDIDATE to RULE ADDED.

**Pattern analysis — unbounded regex + pre-cast validation (new, count 1):**

The unbounded regex issue is a sub-pattern of the broader "validate before cast" family. The prior "pre-cast validation" work (274821b) was correct in principle but missed the digit-count bound. The three sub-patterns now tracked separately:
- "SQL string comparison instead of ::uuid cast in duplicate check" (count 1, watch) — cast vs. text comparison
- "Unbounded numeric regex permitting int overflow" (count 1, watch) — regex validates type but not range
- "Case-sensitive UUID/text dedup (lower() missing)" (count 1, watch) — text comparison without normalisation

None of these have reached count 2. All logged and watched.

**Actions taken:**
- Frequency table: "Type cast bypassing runtime validation" status updated from RULE CANDIDATE to RULE ADDED.
- Frequency table: 2 new watch items added (both first occurrences): "Unbounded numeric regex permitting int overflow" and "Case-sensitive UUID/text dedup in SQL (lower() missing)".
- No new rule changes proposed — the 2 new patterns are first occurrences. The rule already added (code-style.md Section 5 runtime guard) covered the root issue.

**False positives:** none detected.

**Positive signals:**
- The semantic-reviewer correctly identified the regex overflow gap — a subtle correctness issue that lint and type-check cannot catch. The agent caught it post-commit, one cycle after the regex was written. The gate is working at the right layer.
- The test-writer produced 6 well-targeted tests covering every rejection branch of `isCheckAnswerRpcResult`. These are high-signal: they lock in the exact field-type expectations of the guard, so any future change to the RPC schema that relaxes a type constraint will break a test immediately.
- Code reviewer was clean on both commits — the additions stayed within all file-size limits.
- The "type cast + runtime guard" rule cycle is now complete: pattern identified (306f44a) → counted (a0d9973) → rule added (941d58c) → rule applied (274821b) → overflow fix (34c9b36) → tests written (34c9b36). This is the intended lifecycle.

---

### 2026-03-13 — QuizTabs TabButton extraction + badge isolation tests (commits 46113bf, 9c2a737)

**Context:** Two-commit cycle on feat/post-sprint-3-polish. 46113bf extracted a private `TabButton` helper from `QuizTabs` to bring the component function under the 30-line limit. 9c2a737 added 2 targeted tests covering the badge isolation and round-trip tab switch behaviors exposed by the extraction. All 4 agents reported clean on both commits.

**Code reviewer (46113bf):** clean — 0 blocking, 0 warnings. The `TabButton` helper is a pure JSX presenter (props in, markup out), well within the 30-line function limit. `QuizTabs` itself dropped from 43 lines to ~15 lines. `TabButton` is file-private (not exported), which is correct for a component used only within the parent file.

**Code reviewer (9c2a737):** clean — 0 blocking, 0 warnings. Test-only commit; relaxed line limits apply.

**Semantic reviewer (46113bf):** 0 critical, 0 issues. 1 SUGGESTION.

1. **SUGGESTION — Pre-existing ARIA gap on tab buttons:** `TabButton` renders `<button>` elements without `role="tab"`, `aria-selected`, or an enclosing `role="tablist"`. The component functions as a tab UI but uses plain buttons, which means screen readers cannot announce the tab context. The suggestion was flagged as pre-existing (the original buttons also lacked ARIA tab attributes) — the extraction did not introduce the gap. No fix applied. **First occurrence** of this specific ARIA tab pattern gap being explicitly flagged. Logged and watched.

**Semantic reviewer (9c2a737):** clean — 0 issues, 0 suggestions.

**Doc updater (both commits):** clean — no changes needed. Both commits changed only component internals and co-located tests; no schema, RPC, or routing surface changed.

**Test writer (46113bf):** The test-writer noted 2 behavioral gaps introduced by the `TabButton` extraction that the existing 6 tests did not cover:
1. Badge isolation — with the badge logic now parameterised via the `badge` prop, it was possible (and worth verifying) that the "New Quiz" tab could never receive a badge even when `draftCount > 0`. The original implementation hardcoded the badge inside the "Saved Quizzes" block; the extracted version passes `badge` only to the saved tab — but this was implicit, not asserted.
2. Round-trip tab switch — the extraction converted a single conditional render into a pure `tab === 'new' ? newQuizContent : savedDraftContent` ternary. Worth asserting that switching Saved → New correctly restores new content.

Both tests were written in 9c2a737. All existing 6 tests continued to pass unchanged.

**Test writer (9c2a737):** no gaps — all new tests passing, test-writer confirmed clean.

**Pattern checks this cycle:**

1. **Function extraction to meet 30-line limit (general):** The refactor is the pattern working as intended. `QuizTabs` had two nearly identical button blocks — the "Extract at 3 repetitions" rule from code-style.md Section 2 did not technically apply (only 2 instances), but the 30-line function rule did (43 lines > 30). The extraction resolved both issues simultaneously. **Positive signal — rule caught a structural smell before it accumulated further.**

2. **New component-level helper without tests:** `TabButton` was not directly tested in isolation. It is file-private and has no exported surface — the correct testing approach is through the parent `QuizTabs` tests, which is what 9c2a737 did. This is NOT a recurrence of the "new hook/utility file shipped without tests" pattern — that pattern applies to exported utilities and hooks with standalone contracts. File-private presenters tested indirectly through the parent are the expected pattern. **No action.**

3. **ARIA accessibility pattern gap (count 1, WATCH):** The semantic-reviewer flagged missing `role="tab"` / `aria-selected` on buttons used as tabs. This is a pre-existing gap (not introduced by the extraction), and the suggestion is a first occurrence. Logged. If a second component is flagged for missing semantic ARIA tab attributes (role="tablist", role="tab", aria-selected), a note should be added to code-style.md Section 2 (component rules) or a project accessibility checklist.

4. **Test coverage added post-extraction (positive signal):** The test-writer identified 2 behavioral properties that became implicit after the refactor (badge isolation, tab switch round-trip) and covered them explicitly. This is the correct response to a refactor that changes how a behavior is implemented — even when all existing tests pass, the refactor may have made previously explicit behavior implicit, which warrants new explicit assertions.

**Actions taken:**
- Frequency table: "ARIA tab role missing on button-based tab UI" added at count 1, status WATCH.
- No rule changes proposed — the ARIA gap is a first occurrence and pre-existing, not introduced by the refactor. All other patterns are either working as intended or already tracked.

**False positives:** none detected.

**Positive signals:**
- All 4 agents reported clean on both commits. First clean cycle on this branch since the review-gate hook was added (f7ef0f8). Confirms the gate is not generating false friction.
- The 30-line function rule caught a structural duplication that would otherwise have grown — two near-identical button blocks in a 43-line function is the exact smell the rule is designed to surface.
- `TabButton`'s `badge` prop API is clean: `badge?: number`, rendered only when `badge != null && badge > 0`. The optional-prop convention avoids the need for callers to pass explicit `0` or `undefined` to suppress the badge — the "New Quiz" tab simply omits the prop.
- 9c2a737 demonstrates the correct post-refactor test pattern: run existing tests first (all pass), then add tests for any behavior the refactor made implicit. Refactors should always be evaluated for "what was explicit that is now implicit?"

---

### 2026-03-13 — Shift-left plan validation protocol (commit 9257ccb)

**Context:** Single docs-only commit on feat/post-sprint-3-polish. Added a new workflow section to CLAUDE.md documenting the shift-left plan validation protocol (user approval before orchestrator commits to approach). No code changes, no test changes.

**Code reviewer (9257ccb):** clean — 0 blocking, 0 warnings. (Docs-only commit outside code-review scope.)

**Semantic reviewer (9257ccb):** 2 SUGGESTIONS (both fixed post-commit by doc-updater).

1. **SUGGESTION — Stale workflow section in CLAUDE.md:** The existing "Workflow" section (lines 115–125) was not updated to reference the new plan validation protocol. The new section (lines 88–101) documented the protocol, but the high-level workflow ordering did not include a pointer back to it. Fixed in 320986f (commit following 9257ccb) with an updated "Workflow" section clarifying that "Plan Mode" is the first step and links to the new section.

2. **SUGGESTION — Missing cross-reference in push protocol:** The new "Push protocol" section (added in 9257ccb as the last section) documented user approval requirement, but the `agent-workflow.md` file in `.claude/rules/` already documented pre-push expectations. The two should cross-reference each other to prevent drift. Fixed in 0c7e7e7 (docs: cross-reference pre-push PR sweep in CLAUDE.md push protocol) with bidirectional links added between CLAUDE.md and `.claude/rules/agent-workflow.md`.

Root cause: docs-only commits that add new sections without updating cross-references elsewhere in the same file or in related rule files can introduce internal inconsistency. **This is the first occurrence of a "docs-only cross-reference drift" pattern.** Both instances involved CLAUDE.md and a related rule file — the patterns share a structure (newly added section not linked from existing section that covers related territory) and were caught by semantic-reviewer's consistency checks.

**Doc updater (9257ccb):** Noted 2 suggestions from semantic-reviewer but did not auto-fix them (the agent is scoped to checking schema/RPC/routing surface changes, not internal CLAUDE.md cross-reference consistency).

Then (320986f): Doc updater fixed the stale workflow section reference with a 3-line addition to the "Workflow" section of CLAUDE.md, ensuring the new plan validation protocol is mentioned alongside the existing workflow steps.

Then (0c7e7e7): Semantic reviewer's second suggestion prompted a manual doc fix (not by doc-updater) adding cross-references between CLAUDE.md push protocol and `.claude/rules/agent-workflow.md`.

**Test writer (9257ccb):** no gaps — docs-only commit, no test changes needed.

**Pattern analysis — docs-only cross-reference drift (count 1, WATCH):**

The pattern: a new section is added to `CLAUDE.md` (or related doc) that covers a workflow or process change. The new section is self-contained and correct. However, existing sections that overlap or relate to the new content are not updated to cross-reference it, creating the appearance of two separate, potentially conflicting workflows in the same doc. The inconsistency is caught by semantic-reviewer during post-commit review, not before commit.

Both occurrences in this cycle:
1. New "plan validation protocol" section added without updating the existing "Workflow" section to mention it (120 lines apart, both about workflow orchestration).
2. New "push protocol" section added without cross-referencing the existing `.claude/rules/agent-workflow.md` rule file that also documents push expectations.

Root cause: `CLAUDE.md` is a narrative doc that grew to cover multiple layers (high-level philosophy → workflow → agent rules → deployment). New sections added to different layers can create redundant or orphaned documentation without automatic linking. The doc updater's current scope is code-surface changes (schema, RPC, routes), not doc structure consistency.

No rule change proposed yet — this is a first occurrence. If a second "docs-only section added without cross-references" instance appears, the pattern is confirmed and a note should be added to `.claude/agent-memory/doc-updater/patterns.md`: when a new section is added to `CLAUDE.md`, scan for existing sections with overlapping keywords (workflow, protocol, agent, rules) and add cross-references if they exist within ±5 lines or cover the same domain.

**Actions taken:**
- Frequency table: "Docs-only cross-reference drift (new section not linked from existing section)" added at count 1, status WATCH.
- No rule or memory updates applied — pattern not yet at recurrence threshold.
- Logged findings for semantic-reviewer's two suggestions in this session.

**False positives:** none detected.

**Positive signals:**
- Both semantic-reviewer suggestions were immediately actionable and low-friction to fix (3 lines + cross-links).
- The doc-updater correctly noted the suggestions but stayed within its scope (code-surface changes only).
- The fixes were applied in two follow-on commits (320986f and 0c7e7e7), both clean on all agents.
- CLAUDE.md cross-reference fixes demonstrate the orchestrator reading and acting on agent suggestions — the workflow is functioning at the intended speed.
- Docs-only commits are now a regular pattern (3 in the past 5 commits), suggesting the project is in a documentation-stabilization phase post-code-feature-completion.

---

### 2026-03-14 — batch_submit_quiz idempotent retry + soft-delete fix (commits d057128, ce35a31, 45da072)

**Context:** Three-commit fix cycle on feat/post-sprint-3-polish. d057128 fixed two CodeRabbit PR #74 findings in `batch_submit_quiz` via migration 031: (1) idempotent retry for already-completed sessions, (2) allow scoring soft-deleted questions mid-quiz. ce35a31 addressed two semantic-reviewer findings from the prior post-commit round. 45da072 added a test for the new error branch.

**Code reviewer:** clean — 0 blocking, 0 warnings on all 3 commits.

**Semantic reviewer (d057128):** 2 ISSUEs.

1. **ISSUE — Error message stale after control flow change (fixed ce35a31):** The original session-not-found error path in `batch_submit_quiz` raised `'session not found or already completed'`. After adding the idempotent replay path, completed sessions are handled before reaching that RAISE EXCEPTION, so the message was now reachable only for sessions that are genuinely missing or deleted — not completed. The client-side string match in `batch-submit.ts` also used the old message. Fixed in ce35a31: message updated to `'session not found or not accessible'`; client match updated to the new string. Root cause: when a control flow change eliminates a code path (completed sessions now take the replay branch), error messages that referenced that path by name become stale. **First occurrence of this specific sub-pattern.** Logged as new watch item.

2. **ISSUE — FOR UPDATE lock held through read-only replay path (accepted trade-off):** The `FOR UPDATE` lock on the session `SELECT` in migration 031 is acquired unconditionally — meaning a pure replay read (already-completed session) also holds the lock briefly while reading existing `quiz_session_answers`. The semantic-reviewer flagged that this serializes concurrent replay reads unnecessarily. After review, accepted as a documented trade-off: removing the unconditional lock would require a two-phase read (lock-free probe, then lock-and-write), adding complexity without meaningful benefit (replay reads are fast, concurrency is low). A comment was added in ce35a31 documenting the trade-off explicitly. **First occurrence of this accepted-trade-off pattern.** Logged as new watch item. Key lesson: accepted trade-offs must be documented inline with a comment explaining the reasoning — the semantic reviewer will not re-flag a commented trade-off.

**Semantic reviewer (ce35a31, 45da072):** clean — 0 issues, 0 suggestions on both fix commits.

**Doc updater (d057128):** `docs/database.md` updated with migration 031 notes in the same commit. `docs/plan.md` updated with migration entry in ce35a31. Clean — no partial-doc-fix pattern.

**Doc updater (ce35a31, 45da072):** clean.

**Test writer (d057128 — gap found):** `batch-submit.ts` already had a test file but the new `'session not found or not accessible'` error branch (added via the updated control flow in migration 031) had no test. This is the **third occurrence** of the "error path in existing function untested" pattern. Test was written and committed in 45da072.

**Test writer (45da072):** 1 new test added to `batch-submit.test.ts` covering the `'session not found or not accessible'` RPC error string mapping to the user-facing message `'This session could not be found.'`. Passing.

**Pattern analysis — "error path in existing function untested" (count 3):**

All three occurrences share the same structure: an existing function with a co-located test file gains a new error-return path in a commit. The test file is not updated in the same commit. The test-writer catches the gap post-commit and writes the test in a follow-up commit.

Occurrences:
1. Count-error path in `draft.ts` (2026-03-13, cycle 1)
2. Users-query error path in `draft.ts` (d06c25b, 2026-03-13)
3. `'session not accessible'` error branch in `batch-submit.ts` (d057128, 2026-03-14) — this cycle

Three occurrences confirms this is a systemic gap. The correct home for the fix is the test-writer patterns memory (not `code-style.md` — this is not a mechanically checkable style rule). Recommendation: when reviewing a commit diff, the test-writer should explicitly scan for new `if (error) return` or early-return branches in files that already have co-located test files. Each new branch needs a test.

**Actions taken:**
- Frequency table: "Error path in existing function untested" count updated 2 → 3. Status: RULE CANDIDATE (actionable — 3 occurrences).
- Frequency table: 2 new watch items added (both first occurrences): "Error message not updated after control flow change" and "FOR UPDATE lock scope wider than write path (read-only replay serialization — accepted trade-off)".
- No changes proposed to `code-style.md` or `security.md`.

**Recommended changes (awaiting orchestrator approval before applying):**

1. **`.claude/agent-memory/test-writer/patterns.md`** — add a note (3rd occurrence warrants action): when reviewing a commit diff, scan every file that already has a co-located test file for new error-return paths (`if (error) return`, `if (!data) return`, new early-return-on-error branches). Each new error branch in an existing tested file must have a corresponding test case. This is distinct from "new file without test" — the test file exists but becomes incomplete after the change.

**False positives:** none detected.

**Positive signals:**
- All 4 agents were clean on ce35a31 and 45da072 — the fix cycle closed in 3 commits with no secondary issues.
- The semantic-reviewer correctly flagged the stale error message one commit after the control flow change. String-consistency issues of this kind are invisible to type-check and lint.
- The FOR UPDATE trade-off comment in ce35a31 is a good template: when a locking decision has a non-obvious scope implication, document the trade-off inline rather than restructuring the code.
- The test in 45da072 covers both the RPC string match and the user-facing message text — two assertions for one new branch. Well-targeted.

---

### 2026-03-14 — Test naming overhaul + PR 2 completion (commits 15ad393, b3ab893)

**Context:** Two-commit cycle on fix/pr2-test-naming. 15ad393 renamed ~80 test titles across 14 files, split the monolithic `quiz/actions.test.ts` (300 lines) into 3 co-located per-action files (`start.test.ts`, `submit.test.ts`, `complete.test.ts`), fixed a `question-stats` mock to use distinct counts, and added `try/finally` cleanup for a consoleSpy in `quiz-submit.test.ts`. b3ab893 updated `docs/tech-debt-batches.md` to mark PR 2 as DONE and appended a future integration-test expansion roadmap section. All 4 agents reported clean on both commits.

**Code reviewer:** 0 BLOCKING, 0 WARNING — clean. Test-only commits benefit from relaxed line limits; the 3 new test files split from the 300-line monolith are all within limits.

**Semantic reviewer:** 0 CRITICAL, 0 ISSUE. 3 SUGGESTIONs — all pre-existing, none introduced by this commit.

1. **SUGGESTION — consoleSpy created without try/finally in start.test.ts (15ad393):** A single test creates `vi.spyOn(console, 'error')` and calls `consoleSpy.mockRestore()` at the end of the test body. If the test throws before reaching `mockRestore()`, the spy persists into subsequent tests and silently suppresses their console output. The correct pattern is `try { ... } finally { consoleSpy.mockRestore() }`. The fix was applied to `quiz-submit.test.ts` in the same commit but not propagated to `start.test.ts` (1 spy) or `check-answer.test.ts` (8 spies). Suggestion-level — no fix in this commit. **First occurrence as a named pattern.** Logged and watched.

2. **SUGGESTION — consoleSpy try/finally missing in check-answer.test.ts (15ad393):** Same pattern as above — 8 `consoleSpy` instances in `check-answer.test.ts` call `mockRestore()` inline after assertions without a `finally` guard. Pre-existing code, not introduced in this commit (15ad393 only added test name changes to that file). Counted as the same occurrence as the `start.test.ts` instance (same commit, same pattern).

3. **SUGGESTION — submitQuizAnswer dual failure modes (pre-existing):** The semantic-reviewer noted that `submitQuizAnswer` in `submit.test.ts` distinguishes between a Supabase error and a zero-row insert but the user-facing message is identical for both paths, making incident diagnosis harder. Pre-existing gap not introduced by this commit. First occurrence of this specific sub-pattern. Logged and watched.

**Doc updater:** Updated `docs/tech-debt-batches.md` to mark PR 2 DONE, added completion note and the integration test roadmap section. No schema, RPC, or route surface changed. Clean — no partial-doc-fix pattern.

**Test writer:** Clean. 22 tests preserved and remapped correctly through the split (actions.test.ts → start, submit, complete). No coverage gaps introduced by the split. The question-stats mock fix (distinct counts total=8, correct=5) makes the test correctly fail if the `is_correct` filter is dropped — a meaningful behavioral assertion improvement.

**Pattern analysis — consoleSpy try/finally (count 1, first occurrence):**

The pattern: a test creates a `vi.spyOn(console, 'error').mockImplementation(() => {})` inline at the top of an `it()` body. The spy suppresses console output during the test. `consoleSpy.mockRestore()` is called at the end of the test body after assertions. If any assertion throws (test failure), `mockRestore()` is never reached, and the spy leaks console suppression to all subsequent tests in the same file, hiding their error output.

The correct pattern, used in `quiz-submit.test.ts`:
```ts
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
try {
  const result = await action(...)
  expect(consoleSpy).toHaveBeenCalledWith(...)
} finally {
  consoleSpy.mockRestore()
}
```

This is a suggestion-level finding (not ISSUE): the 8 instances in `check-answer.test.ts` are type-guard rejection tests that currently pass reliably — the spy is unlikely to leak in practice because the assertions are simple equality checks that do not throw. But the pattern is fragile.

**Decision:** Log and watch. Do not update test-writer patterns memory on a single occurrence. If a second commit introduces new consoleSpy instances without try/finally, or if a test failure is caused by a leaked spy, update `.claude/agent-memory/test-writer/patterns.md` with the guidance: always wrap consoleSpy usage in `try { ... } finally { consoleSpy.mockRestore() }`.

**Pattern check — previously-pending RULE CANDIDATEs:**

- **"Error path in existing function untested" (count 3, RULE CANDIDATE):** Not triggered — this commit touched only test files (renames, splits). No new production code paths were introduced.
- **"consoleSpy try/finally" (new, count 1):** Logged above.
- **"useTransition + manual loading state hybrid" (count 2, RULE CANDIDATE):** Not flagged — no state logic touched.
- **"test-writer TS2532 unchecked array index" (count 2, RULE CANDIDATE):** Not triggered — no new array index access in generated test code.

**Pending recommended changes (carried forward — not yet applied):**

These recommendations from prior cycles are still awaiting orchestrator approval:

1. **`.claude/agent-memory/test-writer/patterns.md`** — add note: scan every new `if (error) return` / early-return branch in files that already have a co-located test file; write the branch test in the same commit (3rd occurrence, actionable).
2. **`.claude/agent-memory/test-writer/patterns.md`** — add note: always construct test fixtures by annotating with the exported TypeScript type (e.g., `const fixture: SubjectOption = { ... }`) to force compile-time shape validation (2nd occurrence, actionable).
3. **`.claude/agent-memory/test-writer/patterns.md`** — add note: use optional chaining (`arr?.[i]`) or a length-gated assertion when accessing array indices in generated test assertions (2nd occurrence, actionable).

**Actions taken:**
- Frequency table: "consoleSpy created without try/finally cleanup" added at count 1, status WATCH.
- No rule or memory changes applied — single occurrence, no threshold reached.

**False positives:** none detected.

**Positive signals:**
- All 4 agents clean on both commits. This is the second consecutive fully-clean cycle.
- The test split (300-line monolith → 3 co-located files) is the correct structural response to a large test file and directly follows the project's co-location rule. Each new file is scoped to a single action's behavior.
- The question-stats mock fix (distinct total=8 vs correct=5) transforms a coincidentally-passing test into a test that would fail under a real regression. This is a meaningful improvement: the original mock used identical values, so dropping the `is_correct` filter would still produce the same count and the test would not catch the bug.
- The `try/finally` fix in `quiz-submit.test.ts` demonstrates the correct pattern being actively applied — the pattern is known and correct, just not yet propagated to all spy sites.

---

### 2026-03-14 — PR 3 test coverage gaps (commits cb0395c, e4bedef)

**Context:** Two-commit cycle on fix/pr3-test-coverage. cb0395c tightened assertions across 11 test files, added coverage gaps (batch-submit, check-answer, explanation-tab, fetch-explanation, fetch-stats, lookup, start), and split `draft.test.ts` (166 lines) into `draft.test.ts` + a new co-located `draft-delete.test.ts` (119 lines). e4bedef updated `docs/tech-debt-batches.md` to mark PR 3 as DONE.

**Code reviewer:** 0 BLOCKING, 0 WARNING — clean. Test-only commits benefit from relaxed line limits; the new `draft-delete.test.ts` and the tightened assertion files are all within limits.

**Semantic reviewer:** 0 CRITICAL, 0 ISSUE. 4 SUGGESTIONS:

1. **SUGGESTION — consoleSpy without try/finally in draft-delete.test.ts (cb0395c):** The newly created `draft-delete.test.ts` creates `vi.spyOn(console, 'error').mockImplementation(() => {})` and calls `mockRestore()` inline at the end of the test body without a `finally` guard. If the test throws, the spy leaks into subsequent tests. The correct pattern (try/finally) was previously applied to `quiz-submit.test.ts` but not propagated to new spy sites. **This is the 3rd occurrence of this pattern across different commits (1st: start.test.ts/check-answer.test.ts at 15ad393; 2nd: flagged again at 841bc93 cycle; 3rd: draft-delete.test.ts at cb0395c).** Threshold reached — update test-writer patterns memory.

2. **SUGGESTION — Zod error message pinned to exact internal text (cb0395c):** A test assertion in an action test file pins to an exact Zod internal error message string (e.g., `'Expected string, received number'`). Zod's internal message text is not part of its public API and has changed between minor versions. Pinning to the exact string makes the test brittle. More stable: assert `error instanceof ZodError` or check the `.issues[0].code` field (e.g., `'invalid_type'`). Suggestion-level — no fix in this cycle. **First occurrence as a named pattern.** Logged and watched.

3. **SUGGESTION — NEGATIVE_INFINITY test covers same branch as POSITIVE_INFINITY (cb0395c):** In `analytics.test.ts`, both `POSITIVE_INFINITY` and `NEGATIVE_INFINITY` input tests exercise the same `!isFinite()` branch in `boundParam`. The two tests provide no additional branch coverage over a single test. Suggestion-level — redundant coverage at the branch level does not cause failures but wastes test budget. **First occurrence.** Logged and watched. If a second redundant-twin-test pattern surfaces in a different file, add a note to the test-writer's patterns memory: when testing a boolean guard (e.g., `!isFinite()`), a single non-finite input covers the branch; the second symmetric case is documentation value only — note it as such or omit it.

4. **SUGGESTION — mockChain loop initialisation overridden by every caller (cb0395c):** The `buildChain` helper initialises all chain methods in a loop, but each test caller overrides the relevant methods explicitly anyway. The loop-initialised defaults are never observed in any test — they are dead code in the helper. Suggestion-level — not a correctness issue, but the dead initialisation adds noise. **First occurrence.** Logged and watched.

**Doc updater:** Updated `docs/tech-debt-batches.md` to mark PR 3 as DONE (e4bedef). No schema, RPC, or route surface changed. Clean.

**Test writer:** No gaps found. cb0395c itself was the test-coverage-gap commit. All additions were test-only.

**Pattern analysis — consoleSpy try/finally (count 3, threshold reached):**

Three occurrences confirmed:
1. `start.test.ts` + `check-answer.test.ts` — 15ad393 (2026-03-14, first flag)
2. Pattern carried forward — noted in 841bc93 cycle review (PR 2 fix applied try/finally to quiz-submit.test.ts only, not to the two pre-existing spy sites)
3. `draft-delete.test.ts` — cb0395c (2026-03-14, newly created file missing the pattern from the start)

Root cause: the try/finally pattern is known (it exists in quiz-submit.test.ts) but is not in test-writer's institutional memory. New test files and new spy sites are authored without it. Pre-commit type-check and lint cannot catch missing finally blocks. The only gate is the semantic-reviewer post-commit.

The correct fix is to document the required pattern in test-writer patterns memory so that new consoleSpy sites are authored correctly from the start.

**Recommended change (3rd occurrence warrants action):**

**`.claude/agent-memory/test-writer/patterns.md`** — add a note under a "Console spy cleanup" heading or the equivalent mock patterns section:

```
// ❌ WRONG — mockRestore() called inline, leaks spy if test throws
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const result = await action(...)
expect(consoleSpy).toHaveBeenCalledWith(...)
consoleSpy.mockRestore()

// ✅ CORRECT — try/finally guarantees cleanup even on test failure
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
try {
  const result = await action(...)
  expect(consoleSpy).toHaveBeenCalledWith(...)
} finally {
  consoleSpy.mockRestore()
}
```

This pattern applies to all `vi.spyOn(console, ...)` usage inside `it()` bodies. It does not apply when `mockRestore()` is called in an `afterEach` or `afterAll` (those are inherently in finally-equivalent scope).

**Actions taken:**
- Frequency table: "consoleSpy created without try/finally cleanup" count updated 1 → 3, status updated to RULE ADDED TO TEST-WRITER MEMORY.
- Frequency table: 3 new watch items added (all first occurrences): "Zod error message pinned to exact internal text", "Redundant twin test covering same branch with symmetric input", "mockChain loop initialisation overridden by every caller (dead default code)".

**Pending recommended changes (carried forward — not yet applied):**

The following recommendations from prior cycles are still awaiting orchestrator approval:

1. **`.claude/agent-memory/test-writer/patterns.md`** — add note: scan every new `if (error) return` / early-return branch in files that already have a co-located test file; write the branch test in the same commit (3rd occurrence, actionable — from d057128 cycle).
2. **`.claude/agent-memory/test-writer/patterns.md`** — add note: always construct test fixtures by annotating with the exported TypeScript type to force compile-time shape validation (2nd occurrence, actionable — from bba9800 cycle).
3. **`.claude/agent-memory/test-writer/patterns.md`** — add note: use optional chaining (`arr?.[i]`) or a length-gated assertion when accessing array indices in generated test assertions (2nd occurrence, actionable — from 99c67d2 cycle).
4. **`.claude/agent-memory/test-writer/patterns.md`** — add note: consoleSpy must use try/finally (3rd occurrence — this cycle, actionable).

**False positives:** none detected.

**Positive signals:**
- All 4 agents clean on both commits. Third consecutive fully-clean cycle (code-reviewer, semantic-reviewer, doc-updater, test-writer all reporting clean or suggestion-only).
- The draft test split (draft.test.ts → draft.test.ts + draft-delete.test.ts) is the correct structural response to a growing test file. Each file now tests one action's behavior.
- PR 3's coverage additions (tighter assertions, failure-path coverage across 11 files) improve the test suite's regression-detection strength without adding noise.
- The consoleSpy threshold was reached and actioned in the same cycle it was crossed — the pattern detection is working at the intended cadence.

---

### 2026-03-14 — Red-team spec alignment + post-commit review (commits a396438, a1335ff)

**Context:** Two-commit fix cycle on fix/pr3-test-coverage. a396438 corrected RPC signatures, schema column names, and table names in red-team Playwright specs. a1335ff addressed post-commit review findings from the first commit (further spec alignment, session-race-condition test correction). Both commits touched only `apps/web/e2e/redteam/` — no production code changed.

**Code reviewer (a396438, a1335ff):** 1 WARNING.
- Non-null assertion `org!.id` without an explanatory comment. However, the assertion is inside an `if (org && bank && user)` guard block — the `!` is fully redundant (TypeScript narrowing already guarantees non-null at that point) but not unsafe. **FALSE POSITIVE** — the code-reviewer flagged the pattern, but the context makes the assertion safe by construction. The `!` is unnecessary style noise rather than a real risk. Logged to the false-positive tracker below. If the code-reviewer flags this pattern again in a similarly narrowed context, propose a suppression note in agent-code-reviewer.md.

**Semantic reviewer (a396438, a1335ff):** 2 ISSUEs, 2 SUGGESTIONs.

1. **ISSUE — session-race-condition.spec.ts passes because it accepts the security gap (a1335ff):** A test in the race-condition spec asserted the behavior produced by the unguarded path as "acceptable," effectively encoding the security gap into the passing baseline. A security spec that passes by accepting wrong behavior is worse than a failing spec — it creates a false sense of coverage. **First occurrence of a test encoding a security gap as a passing assertion.** Logged as new watch item. The correct form: assert the hardened post-fix behavior; the spec must fail if the unguarded path succeeds.

2. **ISSUE — `complete_quiz_session` and `submit_quiz_answer` RPCs missing `AND deleted_at IS NULL` guard on session fetch (flagged by both semantic-reviewer and test-writer):** Both RPCs fetch a session row with `WHERE id = p_session_id` but do not filter soft-deleted sessions. A soft-deleted session can be replayed or have answers submitted against it. `security.md` rule 6 requires soft-delete semantics at the application layer ("never hard DELETE") but does not explicitly require that query-level session fetches exclude deleted rows. **First occurrence of this specific sub-pattern.** Logged as new watch item. If a second RPC ships without this guard, add the requirement explicitly to `security.md` or `docs/database.md`.

3. **SUGGESTION — Add seed verification assertion before test actions (a1335ff):** The spec's `beforeAll` seeds test data but does not assert the seed succeeded before running test cases. A silent seed failure would cause all subsequent assertions to fail with misleading errors. Suggestion-level — first occurrence. Logged and watched.

4. **SUGGESTION — Add a type guard narrowing `originalScore` before arithmetic (a1335ff):** A value from a query result is used in arithmetic without an explicit numeric type guard. Suggestion-level — first occurrence. Logged and watched.

**Doc updater:** no updates needed — changes were limited to E2E red-team spec files. No schema, RPC, or route surface changed.

**Test writer:** 2 gaps found.
- `complete_quiz_session` missing `AND deleted_at IS NULL` guard on session fetch — no spec assertion covering this behavior.
- `submit_quiz_answer` missing the same guard — same gap.
Both gaps are in the same family as the semantic-reviewer ISSUE above. First occurrence of this pattern being flagged by test-writer.

**Pattern analysis — non-null assertion inside a narrowing guard (code-reviewer false positive):**

The code-reviewer flagged `org!.id` as a non-null assertion without a comment. However, the assertion is inside an `if (org && bank && user)` block. TypeScript's control-flow narrowing guarantees `org` is non-null at that point — the `!` is redundant style noise, not a real risk. The reviewer correctly applies the rule, but the context makes this a false positive: the existing narrowing guard is the justification comment, just implicit rather than written inline.

**Decision:** Log as a false positive. The rule in code-style.md Section 5 is: "No Non-Null Assertions Without Comment." In this case, the comment is the surrounding guard. If the code-reviewer flags this pattern again in a narrowed context, add a note to `agent-code-reviewer.md` Known Suppressions: "non-null assertion inside an explicit narrowing guard (`if (x && ...)`) is acceptable without a comment — the guard is the justification."

**Pattern analysis — red-team spec written against wrong schema (count 2):**

Two consecutive sets of commits (f278d5c, then a396438/a1335ff) required multiple alignment passes to bring red-team specs in sync with actual migration files and RPC signatures. Both were caught by CI failures before merge, so no broken spec reached the main branch. The root cause is consistent: the red-team agent writes specs speculatively from memory of the schema rather than reading the actual migration file before asserting column names, parameter names, and table names.

This pattern has now appeared across two separate commit rounds. It does not yet cross the "2+ occurrences across different commits" threshold for a rule change to `code-style.md` or `security.md`, but it does warrant a watch entry and a note for the red-team agent's authoring guidance: when writing a new spec or modifying an existing one, always read the relevant migration file(s) before asserting against column names, RPC parameter names, or table names.

**Pattern analysis — hard DELETE in test cleanup:**

The session-race-condition spec used `DELETE FROM` in `afterAll` cleanup. This is acceptable in test code (test cleanup is not student data, and the soft-delete rule is an application-level data-integrity rule). However, the habit of writing hard DELETEs in spec files runs counter to the broader project convention and could accidentally propagate to a production code path. **First occurrence.** Logged as watch item. No action — the test cleanup exception is intentional.

**Actions taken:**
- Frequency table: "RPC missing `AND deleted_at IS NULL` guard on session fetch" added at count 1, status WATCH.
- Frequency table: "Hard DELETE in test/spec cleanup code" added at count 1, status WATCH (acceptable in test cleanup; watch for propagation to production paths).
- Frequency table: "Red-team spec written against wrong schema column or RPC signature" added at count 2 (two commit rounds required to align), status WATCH.
- Frequency table: "Test spec encodes a security gap as a passing assertion" added at count 1, status WATCH.
- False positive logged: "non-null assertion inside a narrowing guard flagged as missing comment" — code-reviewer is correct to apply the rule; context makes it safe; propose suppression note in agent-code-reviewer.md on second occurrence.
- No changes proposed to `code-style.md` or `security.md` — all patterns are first occurrences or at count 1. Rule changes require 2+ occurrences across different commits.

**Pending recommended changes (carried forward — not yet applied):**

1. **`.claude/agent-memory/test-writer/patterns.md`** — consoleSpy try/finally (3rd occurrence — from cb0395c cycle, actionable).
2. **`.claude/agent-memory/test-writer/patterns.md`** — scan every new `if (error) return` branch in files with existing tests; write the branch test in the same commit (3rd occurrence — from d057128 cycle, actionable).
3. **`.claude/agent-memory/test-writer/patterns.md`** — always construct test fixtures by annotating with the exported TypeScript type (2nd occurrence — from bba9800 cycle, actionable).
4. **`.claude/agent-memory/test-writer/patterns.md`** — use optional chaining (`arr?.[i]`) when accessing array indices in generated test assertions (2nd occurrence — from 99c67d2 cycle, actionable).

**False positives detected:**
- Non-null assertion `org!.id` inside `if (org && bank && user)` guard — code-reviewer flagged missing comment; surrounding guard is the implicit justification. Safe by construction. Do not fix — the `!` is noise but not a violation in a narrowed context.

**Positive signals:**
- Both commits were limited to red-team spec files only — no production code changed, no doc changes needed.
- CI caught the schema mismatches before merge. The gate (type-check + CI) is working at the correct layer for spec-level alignment issues.
- After two rounds of alignment, the four red-team specs (quiz-draft-injection, rpc-question-membership, session-race-condition, session-replay) are now consistent with actual migration files and RPC signatures.

---

### 2026-03-14 — PR 4 security & auth hardening (commits 83ae098, 08abee0, e2fc840)

**Context:** Three-commit cycle on fix/pr4-security-auth-hardening. 83ae098 was the main hardening commit — getUser() checks added to all 10 Server Actions, auth callback rewritten with signOut on all error paths, error messages sanitised, RPC guards added to migrations 036 and 037. 08abee0 was the semantic-reviewer fix commit — addressed 4 ISSUEs found post-83ae098. e2fc840 was the test-writer commit — added 12 authError path tests across 11 files.

**Code reviewer:** 0 BLOCKING, 0 WARNING — clean on all 3 commits.

**Semantic reviewer (83ae098):** 4 ISSUEs, all fixed in 08abee0.

1. **ISSUE — quiz/session/page.tsx missed in getUser hardening sweep (fixed 08abee0):** The hardening commit added `getUser()` auth checks to all 10 Server Actions but missed `apps/web/app/app/quiz/session/page.tsx`, which also calls into the auth-dependent data path. The fix added the required guard. Root cause: the sweep was applied to files matching a `quiz/actions/` pattern but did not include pages that also perform authenticated data fetching. **This is the second occurrence of the "missed file in bulk sweep" meta-pattern** (first: auth error destructuring applied to 2 of 8 sibling query files in 2190dd5; fixed across 3 extra commits). The pattern: when a cross-cutting security change is applied to a file family, one or more files that belong to the same logical group but are in a different directory or file type are missed. Count in frequency table updated: 1 → 2. Status: RULE CANDIDATE.

2. **ISSUE — Auth callback missing signOut on auth_failed path (fixed 08abee0):** After `exchangeCodeForSession` + `getUser()` failure, the callback returned an error redirect without calling `supabase.auth.signOut()`. A partial session (OAuth code exchanged, but user not in the registered users table) could leave a stale auth cookie for a user that should not be admitted. Fixed by adding `await supabase.auth.signOut()` before the `auth_failed` redirect. Root cause: the original callback was written before the registered-users-only guard was added — the signOut step was never needed when the only failure was a bad code exchange. Adding the users-table check created a new partial-auth failure path that the existing cleanup did not cover. **First occurrence** of this specific "stale cookie from partial auth flow" pattern. Logged as new watch item. Any multi-step auth flow that can fail after session cookies are set must clean up the session before redirecting to an error page.

3. **ISSUE — Migration 036 missing NULL correct_option guard, inconsistent with 037 (fixed 08abee0):** `submit_quiz_answer` RPC in migration 036 did not guard against `correct_option IS NULL` before comparing the student's selected option to the correct one. Migration 037 (`check_quiz_answer`) was authored with the guard. The inconsistency left 036 able to silently accept a NULL correct_option as "correct" depending on PostgreSQL's NULL comparison semantics. Fixed by adding the same guard to migration 036. Root cause: the guard was written into 037 first; when 036 was reviewed, the sibling guard was not cross-checked. **This is the second occurrence of the "inconsistent guard between related RPCs" pattern** (first occurrence: RPC missing identity guard in analytics RPCs, Sprint 3 cycle, 845923b — one RPC had the `auth.uid() = p_student_id` check, sibling did not). Count in frequency table: 1 → 2. Status: RULE CANDIDATE.

4. **ISSUE — discard.ts auth pattern diverged from standard (fixed 08abee0):** `discard.ts` used a different auth call pattern than the other 9 Server Actions in the same directory (all of which were updated to the new standard in 83ae098). The fix aligned `discard.ts` with the standard. Root cause: `discard.ts` was created later in the development timeline and was not included in the 83ae098 sweep. This is the same class of failure as finding 1 — a file that is logically part of the group but was missed in the bulk sweep. Counted under the same "missed file in bulk sweep" entry (count 2).

**Semantic reviewer (08abee0, e2fc840):** clean — 0 issues, 0 suggestions on both fix commits.

**Doc updater:** `docs/database.md`, `docs/tech-debt-batches.md`, and `docs/plan.md` all updated in the same cycle. Clean — no partial-doc-fix pattern.

**Test writer:** 12 new tests for authError paths across 11 files (e2fc840). All passing. No new hook/utility files shipped without tests in this cycle.

**Pattern analysis — "missed file in bulk sweep" (count 2, RULE CANDIDATE):**

Both occurrences share the same structure: a cross-cutting fix is identified and applied to a primary file group (e.g., all files in `quiz/actions/`). One or more files that belong to the same logical responsibility but live in a different location (a page component, a later-added action file, a different directory sibling) are missed. The gap is caught by the semantic-reviewer post-commit, requiring a fix commit.

Occurrences:
1. Auth error destructuring sweep (2190dd5): 2 of 8 query files patched; 6 missed; required 3 extra fix commits.
2. PR4 getUser hardening sweep (83ae098): `quiz/session/page.tsx` and `discard.ts` missed; required 1 fix commit.

Both share root cause: the sweep was scoped by directory pattern rather than by semantic ownership (all files that perform authenticated data access). A directory pattern misses files that participate in the same responsibility from adjacent locations.

No rule change proposed for `code-style.md` — this is a process/checklist gap, not a style rule. The correct fix is a note in agent memory about sweep verification: before committing a cross-cutting security or pattern change, grep the full repository for any call sites that match the pattern being fixed, not just files in the expected directory. Two occurrences confirm the note belongs in agent memory.

**Pattern analysis — "inconsistent guard between related RPCs" (count 2, RULE CANDIDATE):**

Both occurrences: a guard is introduced in one RPC but its sibling RPC (which operates on the same data or shares the same security assumption) does not receive the same guard.

Occurrences:
1. Sprint 3 analytics RPCs (845923b): `auth.uid() = p_student_id` identity guard added to one RPC, sibling RPC missing it; fixed in 7b824c2.
2. Migrations 036/037 (83ae098 → 08abee0): NULL correct_option guard in 037 (`check_quiz_answer`), missing from 036 (`submit_quiz_answer`); fixed in 08abee0.

Root cause: guards are written into one RPC during authoring, then sibling RPCs are either not reviewed for the same gap or are authored before the guard is established as a convention. The gap is invisible to lint and type-check — only semantic review catches it.

No rule change to `code-style.md` or `security.md` yet — the pattern is at count 2 but both involve different guard types (identity check vs. NULL data guard). The common principle is: when a guard is added to one RPC in a family (RPCs operating on the same table or shared auth assumption), all sibling RPCs in that family must be audited for the same gap in the same commit. This belongs in the semantic-reviewer's checklist or in a note about migration authoring. Will propose a `docs/security.md` addition if a third occurrence surfaces.

**Pattern analysis — "stale cookie after partial auth flow" (count 1, WATCH):**

The auth callback's multi-step flow (exchange code → get user → check registered users table) created a partial-auth failure mode: the session cookie is set by `exchangeCodeForSession` before the users-table check runs. If the users-table check fails, the session must be explicitly torn down via `signOut()` before redirecting to the error page. The original code did not do this.

This is distinct from "auth error from getUser() swallowed without logging" (that pattern is about missing console.error — this is about missing session cleanup before an error redirect). First occurrence — logged and watched. The principle: in any multi-step auth flow where a session can be partially established, the error paths that occur after session establishment must explicitly clean up the session before returning an error to the caller.

**Actions taken:**
- Frequency table: "Missed file in bulk sweep (cross-cutting change applied to primary group, sibling in adjacent location missed)" count updated 1 → 2. Status: RULE CANDIDATE.
- Frequency table: "Inconsistent guard between related RPCs (sibling RPC missing guard introduced in first)" count updated 1 → 2. Status: RULE CANDIDATE.
- Frequency table: "Stale cookie from partial auth flow (session set before guard check, not cleaned up on guard failure)" added at count 1, status WATCH.
- No changes proposed to `code-style.md` or `security.md` — both RULE CANDIDATEs are semantic/process patterns without a mechanically checkable form. Agent memory is the correct home. One-off patterns logged at count 1.

**Pending recommended changes (carried forward — not yet applied):**

1. **`.claude/agent-memory/test-writer/patterns.md`** — consoleSpy try/finally (3rd occurrence — from cb0395c cycle, actionable).
2. **`.claude/agent-memory/test-writer/patterns.md`** — scan every new `if (error) return` branch in files with existing tests; write the branch test in the same commit (3rd occurrence — from d057128 cycle, actionable).
3. **`.claude/agent-memory/test-writer/patterns.md`** — always construct test fixtures by annotating with the exported TypeScript type (2nd occurrence — from bba9800 cycle, actionable).
4. **`.claude/agent-memory/test-writer/patterns.md`** — use optional chaining (`arr?.[i]`) when accessing array indices in generated test assertions (2nd occurrence — from 99c67d2 cycle, actionable).

**False positives detected:** none.

**Positive signals:**
- Code reviewer was clean on all 3 commits — the hardening changes (add 3 lines per action file) stayed well within all file-size limits.
- Both fix commits (08abee0 and e2fc840) were clean on semantic review. The fix cycle closed in 3 commits total with no tertiary issues.
- 12 authError path tests (e2fc840) give direct regression coverage for the new getUser() early-return branches across all 11 affected files. Any future accidental removal of a getUser() check will immediately fail a test.
- The pattern detection correctly identified the "missed file in sweep" pattern on its second occurrence and escalated it to RULE CANDIDATE. The system is working at the intended cadence: log → watch → detect recurrence → escalate.

---

### 2026-03-14 — PR 5 race conditions & async bugs (commits 1b38542, 9ea234b, 43ec916)

**Context:** Three-commit cycle on fix/pr5-race-conditions. 1b38542 was the main fix commit — added an in-flight guard (`submittingRef` + `setSubmitting`) to `handleNext` in `use-session-state.ts` to prevent double-fire on rapid interaction, and fixed a navigation guard false positive in `use-quiz-state.ts` by replacing the `answers.size > 0` condition with `answers.size > initialSize.current` (where `initialSize` is a `useRef` snapshot taken at mount). 9ea234b was the semantic-reviewer fix commit — replaced a `useMemo` + `// biome-ignore` approach for the initial-size snapshot with a `useRef` (cleaner, no lint suppression needed), and added `use-session-state.test.ts` (11 tests). 43ec916 added 4 navigation guard condition tests to `use-quiz-state.test.ts` covering the resumed-draft scenario. Branch diff vs master: 404 insertions in 4 files — all test additions plus the small production code changes.

**Code reviewer:** 0 BLOCKING, 0 WARNING — clean on all 3 commits.
- Noted `use-session-state.ts` at 131 lines (hook limit: 80), but correctly classified as acceptable: the file is an orchestrator hook (not a UI hook) and the 131 lines are composed of focused callback definitions; no rule change warranted.

**Semantic reviewer (1b38542):** 1 ISSUE + 1 SUGGESTION + 3 GOOD.

1. **ISSUE — `useMemo` used for mount-time snapshot instead of `useRef` (fixed 9ea234b):** The initial fix used `useMemo(() => initialAnswers ? Object.keys(initialAnswers).length : 0, [])` with an empty dependency array to capture the initial answer count. The semantic-reviewer correctly flagged that `useMemo` is a performance hint whose result is not guaranteed to be stable — React may discard and recompute memoized values in concurrent mode. `useRef` is the correct tool for a value that must be initialised once and never change. Fixed in 9ea234b with `useRef(initialAnswers ? Object.keys(initialAnswers).length : 0)`. **First occurrence of this specific sub-pattern: useMemo with empty deps used as a stability guarantee rather than as a performance optimisation.** Logged as new watch item.

2. **SUGGESTION — `handleNext` sync branch not guarded by `submittingRef` (1b38542):** The in-flight guard added to `handleNext` applies when the function takes the async path (calling `onComplete`). The sync early-return branches (state reset to 'answering', `setError`) are not reachable during a concurrent second call because the guard fires before any branch. The semantic-reviewer noted this as a harmless gap due to UI state preventing concurrent access. No fix applied — suggestion-level, accepted by design. **First occurrence.** Logged.

3. **3 GOOD patterns** noted by semantic-reviewer: `submittingRef` + `setSubmitting` dual-mechanism (ref for synchronous guard, state for UI feedback); `initialSize` useRef with descriptive comment; nav guard condition expressed as `answers.size > initialSize.current` (semantically precise).

**Semantic reviewer (9ea234b, 43ec916):** clean — 0 issues, 0 suggestions on both commits.

**Doc updater:** `docs/tech-debt-batches.md` updated in the same cycle to note PR 5 progress. No schema, RPC, or route surface changed. Clean.

**Test writer (9ea234b — use-session-state.test.ts, 11 tests):** Covered `handleSubmit` (happy path, error, retry), `handleNext` (forward navigation, reverse navigation, in-flight guard, state transitions), and `handleNext` with pre-existing answers. The test-writer initially generated `vi.fn()` calls using the older two-argument generic syntax (`vi.fn<[ArgTypes], ReturnType>()` — deprecated in Vitest v4). The correct form is `vi.fn<(input: SubmitInput) => Promise<AnswerResult>>()` (single function type argument). The orchestrator corrected the syntax before committing. **First occurrence of test-writer generating deprecated vi.fn generic syntax.** Logged as new watch item. The fix is in test-writer patterns memory (or vitest version note): use `vi.fn<(args) => ReturnType>()` not `vi.fn<[ArgTypes], ReturnType>()`.

**Test writer (43ec916 — 4 nav guard tests):** Covered: (1) guard inactive on fresh mount with no answers; (2) guard activates after first new answer; (3) guard inactive when mounted with pre-loaded answers matching initialSize; (4) guard activates when a new answer is added beyond the pre-loaded count. All 4 are behaviorally precise — they test the exact condition introduced in the fix, not internal state.

**Pattern checks this cycle:**

1. **"Hook file exceeding 80-line limit" (count 4, RULE EXISTS):** `use-session-state.ts` is 131 lines. The code-reviewer correctly noted this as an acceptable orchestrator hook rather than flagging it as a violation. The exception is consistent with the documented "Server Action orchestrators" boundary in code-style.md Section 3. **Not a recurrence — correct application of existing exception.**

2. **"New hook file extracted without shipping tests in the same commit" (count 4+, RULE EXISTS):** `use-session-state.ts` was created in 1b38542 and its tests arrived in 9ea234b (the next commit). This is another recurrence of the same compliance gap. Count updated to 5. Rule exists; compliance gap at authoring time persists.

3. **"useMemo with empty deps as stability guarantee" (count 1, WATCH):** New sub-pattern from this cycle. First occurrence — log and watch.

4. **"Deprecated vi.fn generic syntax" (count 1, WATCH):** New pattern from test-writer output. First occurrence — log and watch. The correct Vitest v4 form is the single function-type argument: `vi.fn<(a: A) => B>()`.

5. **Pending RULE CANDIDATE patterns (carried forward):** All four test-writer memory recommendations from prior cycles remain pending orchestrator approval. No new threshold crossings this cycle for those patterns.

**Actions taken:**
- Frequency table: "New hook file extracted without shipping tests in the same commit" count updated 4 → 5. Status unchanged (RULE EXISTS, compliance gap).
- Frequency table: 2 new watch items added (both first occurrences): "useMemo with empty deps used as stability guarantee (should be useRef)" and "test-writer generates deprecated vi.fn generic syntax (two-arg form)".
- No rule changes proposed — new patterns are both first occurrences.

**Pending recommended changes (carried forward — not yet applied):**

1. **`.claude/agent-memory/test-writer/patterns.md`** — consoleSpy try/finally (3rd occurrence — from cb0395c cycle, actionable).
2. **`.claude/agent-memory/test-writer/patterns.md`** — scan every new `if (error) return` branch in files with existing tests; write the branch test in the same commit (3rd occurrence — from d057128 cycle, actionable).
3. **`.claude/agent-memory/test-writer/patterns.md`** — always construct test fixtures by annotating with the exported TypeScript type (2nd occurrence — from bba9800 cycle, actionable).
4. **`.claude/agent-memory/test-writer/patterns.md`** — use optional chaining (`arr?.[i]`) when accessing array indices in generated test assertions (2nd occurrence — from 99c67d2 cycle, actionable).
5. **`.claude/agent-memory/test-writer/patterns.md`** — add vi.fn generic syntax note: use `vi.fn<(arg: A) => R>()` (single function-type arg, Vitest v4 form), not the deprecated two-argument `vi.fn<[ArgTypes], ReturnType>()` form (1st occurrence — this cycle, watch — do not add until 2nd occurrence).

**False positives:** none detected.

**Positive signals:**
- All 3 agents reported clean (or suggestion-only) on the final commit (43ec916). Cycle closed correctly.
- The semantic-reviewer correctly distinguished `useMemo` from `useRef` for a stability guarantee — a subtle correctness issue that lint and type-check cannot catch. The fix (9ea234b) is minimal and correct: 4 lines changed.
- The 4 navigation guard tests (43ec916) are high-signal: they directly encode the invariant that "pre-loaded answers at mount must not trigger the navigation guard." Any future change to the guard condition that breaks this invariant will immediately fail a test.
- The dual-mechanism `submittingRef` + `setSubmitting` pattern (ref for synchronous guard, state for UI feedback) is the same correct approach used in `use-answer-handler.ts`. The pattern is becoming a consistent convention in the codebase for in-flight guards on user interaction handlers.

---

### 2026-03-15 — PR 6 split oversized files (commits 44f9232, 69273cf, 4a1e1b8)

**Context:** fix/pr6-split-oversized-files branch. 44f9232 was the main refactor commit — split oversized files to meet code-style limits. 69273cf added unit tests for new session-operations helpers (test-writer output, 10 tests). 4a1e1b8 updated docs/tech-debt-batches.md to mark PR 6 complete.

**Code reviewer:** CLEAN — 0 BLOCKING, 0 WARNING. No violations found across any of the three commits.

**Semantic reviewer (44f9232):** 0 CRITICAL, 0 ISSUE, 1 SUGGESTION.
- **SUGGESTION — QuizState prop coupling in quiz-main-panel.tsx:** The component receives an opaque `QuizState` object and accesses internal fields rather than accepting explicit typed props. Suggestion-level only; not fixed this cycle. First occurrence of this specific prop-coupling pattern in this component.

**Doc updater:** `docs/tech-debt-batches.md` updated to mark PR 6 complete. No schema, RPC, or route surface changed. Clean.

**Test writer (69273cf — session-operations.test.ts, 10 tests):** Test-writer again generated `vi.fn()` calls using the old two-argument generic syntax (`vi.fn<[SubmitInput], Promise<AnswerResult>>()`). The orchestrator corrected the syntax to `vi.fn<(input: SubmitInput) => Promise<AnswerResult>>()` before the commit landed. **This is the second occurrence across different commits (first was 9ea234b, 2026-03-14).** Two-occurrence threshold met — rule added.

**Pattern checks this cycle:**

1. **"Deprecated vi.fn generic syntax" (count 2, RULE ADDED):** Second occurrence confirmed. Frequency table updated. Rule added to `.claude/agent-memory/test-writer/patterns.md`: use `vi.fn<(arg: A) => R>()` (single function-type argument, Vitest v4 form). Stale wrong-syntax code example on line 238 of that file also corrected. No change to `code-style.md`, `security.md`, or `biome.json` — this is a test-authoring pattern, correctly placed in test-writer memory only.

2. **"QuizState prop coupling" (count 1, NEW):** First occurrence — semantic-reviewer suggestion, not an issue. Logged and watching.

3. **Pending RULE CANDIDATE patterns (carried forward — still awaiting orchestrator action):**
   - consoleSpy try/finally (3rd occurrence, actionable)
   - scan new error-return branches for missing test coverage (3rd occurrence, actionable)
   - construct test fixtures from exported TypeScript type (2nd occurrence, actionable)
   - optional chaining on array index access in tests (2nd occurrence, actionable)

**Actions taken:**
- Frequency table: "Deprecated vi.fn generic syntax" escalated from count 1/WATCH to count 2/RULE ADDED.
- `test-writer/patterns.md` updated: new section "vi.fn Generic Typing — Vitest v4 Syntax (RULE ADDED 2026-03-15)" added; stale wrong-syntax example corrected.
- No changes to `code-style.md`, `security.md`, `biome.json`, or any `.claude/agents/*.md` file.

**False positives:** none detected.

**Positive signals:**
- Code reviewer reported fully clean — the file splits in PR 6 were structurally correct with no violations introduced.
- The two-occurrence threshold enforcement worked as designed: the pattern was logged at first occurrence (9ea234b) and escalated exactly when it recurred (69273cf). The system caught it before it became a persistent habit in the test-writer's output.

---

### 2026-03-15 — PR 7 type safety cleanup (commits b46b0bf, 199e927)

**Context:** fix/pr7-type-safety-cleanup branch. b46b0bf was the main cleanup commit — removed `as string & keyof never` casts introduced by `Supabase .returns<T>()`, standardised query result casting, and cleaned up type patterns across query files. 199e927 was the semantic-reviewer fix commit — added `student_id` ownership filter to `getQuizReport` and wrapped `checkAnswer`'s `parse()` call in a try/catch.

**Code reviewer:** CLEAN — 0 BLOCKING, 0 WARNING on both commits.

**Semantic reviewer (b46b0bf):** 1 CRITICAL + 1 ISSUE, both fixed in 199e927. 3 SUGGESTIONS (non-blocking).

1. **CRITICAL — `getQuizReport` missing `student_id` ownership filter (fixed 199e927):** The `quiz_sessions` query fetched a session by `id` only (`.eq('id', sessionId)`), without scoping to `.eq('student_id', user.id)`. Any authenticated student could view any other student's quiz report by guessing or knowing a session UUID. Fixed in 199e927 by adding `.eq('student_id', user.id)` to the query chain. Root cause: the auth check (`getUser()`) was present, but the query itself did not enforce ownership. Auth != ownership scoping — both are required. **This is the second occurrence of "Query missing student_id scope"** (first: `getFilteredCount` in feat/post-sprint-3-polish, where `student_responses` was fetched without a student_id filter). Count in frequency table: 1 → 2. Status: RULE CANDIDATE.

2. **ISSUE — `checkAnswer` ZodError uncaught (fixed 199e927):** `checkAnswer` called `CheckAnswerSchema.parse(raw)` directly without a try/catch. All other Server Actions in the directory handle parse failures explicitly (returning a typed error response). An uncaught `ZodError` from `checkAnswer` would propagate as an unhandled exception rather than returning `{ success: false, error: 'Invalid input' }` as the caller expects. Fixed in 199e927 by wrapping `parse()` in a try/catch that returns the standard error shape. Root cause: the ZodError handling convention is not uniformly applied — some actions use `.parse()` directly (relying on a top-level boundary to catch it), while others explicitly try/catch. The inconsistency means the caller contract is not predictably met on bad input. **First occurrence of this specific sub-pattern (ZodError escaping a Server Action that has a typed error return type).** Logged as new watch item. Distinct from "Server Action shipped without Zod validation" (that pattern is about missing validation entirely — this is about validation present but exceptions escaping the return-type contract).

3. **3 SUGGESTIONS (non-blocking):** All pre-existing concerns, not introduced by PR #7. No action taken.

**Semantic reviewer (199e927):** clean — 0 issues, 0 suggestions.

**Doc updater:** `docs/plan.md` and `docs/tech-debt-batches.md` updated to record PR #7 completion. No schema, RPC, or route surface changed. Clean.

**Test writer:** No new tests needed. All 836 tests passing. The PR #7 changes were type cleanup (no behavior change) + the two post-commit fixes (ownership filter + parse try/catch). The ownership filter is covered by the existing session-access red-team specs. The parse try/catch is covered by existing check-answer error-path tests.

**Pattern analysis — "Query missing student_id scope" (count 2, RULE CANDIDATE):**

Both occurrences share the same structure: an authenticated query fetches rows by a non-user identifier (session ID, response ID) without scoping the WHERE clause to `student_id = auth.uid()`. The auth check confirms the user is logged in, but the query does not restrict which user's data is returned. Any authenticated user could access another user's data.

Occurrences:
1. `getFilteredCount` in `feat/post-sprint-3-polish` (2026-03-13): `student_responses` fetched without `WHERE student_id = auth.uid()` filter. Fixed by scoping query.
2. `getQuizReport` in PR #7 (b46b0bf → 199e927, 2026-03-15): `quiz_sessions` fetched by `id` only, no `student_id` scope. Classified CRITICAL. Fixed in 199e927.

Root cause: developers correctly add `getUser()` auth checks, then write the query scoped to the resource ID (which they have), but forget that another student could know that ID and invoke the same query. The pattern is: fetching by resource ID is not equivalent to fetching by (resource ID + student ownership). Both are required for any query on student-owned data.

Two occurrences across different commits and different query files confirm this is a systemic gap. The correct home for a note is `docs/security.md` or the semantic-reviewer's memory, not `code-style.md` (it is a security rule, not a style rule). The existing `security.md` rules cover RLS (`USING` policies) and auth checks, but do not explicitly state the application-layer scoping requirement for queries on student-owned tables.

No rule change to `security.md` proposed yet — both occurrences were caught post-commit by the semantic-reviewer, not by RLS failures (RLS did enforce ownership at the DB level, but the application query was still wrong). The semantic-reviewer should continue checking ownership scoping on all queries against student-owned tables. If a third occurrence surfaces, add an explicit note to `security.md`: "queries on student-owned tables (quiz_sessions, student_responses, quiz_drafts) must always include AND student_id = [auth user id] in the WHERE clause, even when RLS is enabled."

**Pattern analysis — Supabase `.returns<T>()` causing forced type casts (count 1, NEW):**

PR #7's primary cleanup was removing the `as string & keyof never` casts that Supabase's `.returns<T>()` chain method generates when the inferred column types don't match the expected return type. The fix pattern adopted throughout: drop `.returns<T>()`, execute the query, then cast the result directly via `const typed = data as TargetType | null`. This is cleaner because the cast is explicit and co-located with the variable declaration, not hidden in a chain method that silently emits incorrect intermediate types.

First occurrence of this specific antipattern being systematically cleaned up. Logged as a watch item. If new query files are written with `.returns<T>()` causing forced casts, note that the correct pattern is to cast the result, not the chain.

**Actions taken:**
- Frequency table: "Query missing student_id scope (returns wrong student's data)" count updated 1 → 2. Status: RULE CANDIDATE. No rule change to `security.md` yet — awaiting third occurrence or explicit orchestrator approval.
- Frequency table: 2 new watch items added (both first occurrences): "ZodError escaping Server Action with typed error return type (parse() without try/catch)" and "Supabase `.returns<T>()` causing forced intermediate type casts (use result-cast pattern instead)".
- No changes to `code-style.md`, `security.md`, or `biome.json`.

**Pending recommended changes (carried forward — still awaiting orchestrator action):**

1. **`.claude/agent-memory/test-writer/patterns.md`** — consoleSpy try/finally (3rd occurrence — from cb0395c cycle, actionable).
2. **`.claude/agent-memory/test-writer/patterns.md`** — scan every new `if (error) return` branch in files with existing tests; write the branch test in the same commit (3rd occurrence — from d057128 cycle, actionable).
3. **`.claude/agent-memory/test-writer/patterns.md`** — always construct test fixtures by annotating with the exported TypeScript type (2nd occurrence — from bba9800 cycle, actionable).
4. **`.claude/agent-memory/test-writer/patterns.md`** — use optional chaining (`arr?.[i]`) when accessing array indices in generated test assertions (2nd occurrence — from 99c67d2 cycle, actionable).

**False positives:** none detected.

**Positive signals:**
- Code reviewer clean on both commits — the type cleanup did not introduce any style violations.
- The CRITICAL ownership gap was caught by the semantic-reviewer one commit after the PR landed, not in production and not by a user accessing another student's data.
- The Supabase result-cast pattern (drop `.returns<T>()`, cast result directly) is now consistently applied across all query files that were cleaned up. Future readers have a clear model to follow.
- 836 tests all passing confirms the type cleanup was non-behavioral — no regressions introduced.

---

### 2026-03-15 — Admin Syllabus Manager (commits 6b49021, cebf441)

**Context:** Two-commit cycle for the Admin Syllabus Manager feature. 6b49021 was the main feature commit — added EASA syllabus admin UI (subjects/topics/subtopics CRUD), admin RLS migration, `require-admin` auth helper, proxy 403 guard, 5 Server Actions with full test suites, and nav updates. cebf441 was the semantic-reviewer fix commit — fixed proxy cookie copy, profile error logging, sort_order stale prop, and added action/query tests. 42 files changed, 2301 insertions.

**Code reviewer (6b49021 + cebf441):** CLEAN — 0 BLOCKING, 0 WARNING. Clean pass on both commits.

**Semantic reviewer (6b49021):** 1 CRITICAL + 3 ISSUEs + 3 SUGGESTIONs. CRITICAL and 2 ISSUEs fixed in cebf441. 1 ISSUE deferred (single-org acceptable). All 3 SUGGESTIONs accepted as-is or deferred.

1. **CRITICAL — Proxy 403 response dropping refreshed session cookies (fixed cebf441):** The new admin path guard in `proxy.ts` returned `new NextResponse('Forbidden', { status: 403 })` as a bare response. The proxy's `redirectWithCookies()` helper copies refreshed Supabase session cookies from the upstream `response` object onto every outgoing response. The bare 403 bypassed this helper, silently dropping any token refresh that occurred during the `getUser()` call. The affected user's next request would see an expired token. Fixed in cebf441 by copying `response.cookies.getAll()` onto the 403 response before returning. Root cause: the `redirectWithCookies()` helper makes cookie copying prominent for redirects; it is invisible for non-2xx responses where the developer's mental model is "it's an error, no session needed." **First occurrence as a named pattern in learner memory.** The semantic-reviewer memory already recorded this (first seen 6b49021). Logged.

2. **ISSUE — `requireAdmin()` profile error swallowed without logging (fixed cebf441):** `require-admin.ts` destructured only `{ data }` from the Supabase profile lookup, silently discarding `{ error }`. Because the fallback behavior (access denied) is safe, the bug is invisible in production — but it produces no log signal when the DB has a connectivity problem. Fixed in cebf441 with `{ data, error }` destructure and `console.error` before the guard. Root cause: same family as the "Supabase mutation result not destructured" pattern — the query variant (not just mutations) drops errors. **This is the second occurrence of "Supabase query error silently swallowed in an auth helper."** The semantic-reviewer memory records the prior occurrence as commit 83ae098 (2026-03-14). Count: 2. Status: RULE CANDIDATE — confirm actionability with orchestrator.

3. **ISSUE — `sort_order` trusts stale client prop instead of computing server-side (fixed cebf441):** `subject-row.tsx` passed `sort_order` as a prop to the upsert Server Action, allowing a stale or client-modified value to be written to the DB. The correct approach computes `sort_order` from the current sibling count at the Server Action level (a fresh DB query), guaranteeing the value reflects actual DB state. Fixed in cebf441 by removing the client prop and computing sort_order in the action. Root cause: treating sort_order as a client-computed value that is passed back on save, rather than a server-authoritative value that is derived fresh on write. **First occurrence of this specific pattern: a server-authoritative ordering value computed client-side and trusted on submission.** Logged as new watch item.

4. **ISSUE — `getQuizQuestions`-style scoping: question count not scoped to org (deferred — single-org acceptable):** The question count query in `queries.ts` counts all questions in the bank without filtering to the current admin's organisation. For a single-org deployment (current state), this returns correct data. Deferred: the product operates as single-org; org-scoping is tracked as a future concern. No action taken in this cycle. Logged as a design note.

5. **SUGGESTION — Hard delete on admin syllabus items (accepted — admin exception documented):** `delete-item.ts` uses hard DELETE for syllabus items (subjects, topics, subtopics). The semantic-reviewer noted this diverges from the project's soft-delete policy. After review, accepted: admin-managed reference data (syllabus structure) is distinct from student-owned immutable records; hard delete is appropriate for admin CRUD on schema-like content. The design exception was documented in the PR. No action to rules — the soft-delete rule in `security.md` covers student records and audit data, not admin reference data.

6. **SUGGESTION — `is_admin` NULL guard safe as-is:** `require-admin.ts` checks `profile.is_admin !== true` which safely treats NULL as not-admin. The semantic-reviewer noted this is intentionally strict. No action.

7. **SUGGESTION — JWT claims approach deferred:** Adding `is_admin` to the JWT custom claims would save a DB lookup on every admin request. Deferred as a future optimisation; not blocking. No action.

**Semantic reviewer (cebf441):** CLEAN — 0 issues, 0 suggestions.

**Doc updater (6b49021 + cebf441):** 3 doc updates needed — `docs/database.md` (new migration 039, admin RLS policies), `docs/security.md` (admin guard pattern, proxy cookie rule), `docs/plan.md` (Admin Syllabus Manager completion entry). Updates applied in the same cycle. Clean — no partial-doc-fix pattern.

**Test writer:** 5 test files written (45 tests) covering `require-admin.ts`, all 3 upsert actions, `delete-item.ts`, and `queries.ts`. One mock complication: `subject-row.tsx` originally passed `sort_order` as a prop; after cebf441 moved sort_order computation to the Server Action, the test mocks for the upsert actions needed adjustment (remove the sort_order prop from call assertions). Tests were fixed and all 45 passing. No new hook/utility files shipped without tests — all co-located test files landed alongside their source files in the feature commit itself.

**Pattern checks this cycle:**

1. **Proxy 403 dropping cookies (count 1, NEW):** The bare `new NextResponse(...)` path in proxy.ts is a recurrence risk whenever the proxy gains a new non-redirect response path. The semantic-reviewer memory (patterns.md) already recorded this at first occurrence. Logged in learner memory now as well. The fix pattern is: any response returned after a `getUser()` call in proxy.ts must copy `response.cookies.getAll()` onto it before returning.

2. **Supabase query error silently swallowed in auth helper (count 2, RULE CANDIDATE):** The second occurrence (requireAdmin profile lookup) matches the first occurrence (83ae098 Server Action sweep). Both involve a secondary DB lookup in an auth helper that discards `{ error }` silently. The fix is consistent: destructure `{ data, error }`, log the error. Two occurrences across different commits confirm the pattern. This is distinct from the "Supabase mutation result not destructured" rule (code-style.md Section 5, which covers insert/update/delete calls) — this is about SELECT queries in auth helper functions. The existing code-style.md rule reads "All Supabase mutation calls must destructure { error }." It does not explicitly mention queries. A clarification note is warranted on the next orchestrator approval cycle.

3. **`@ts-expect-error` for Supabase TypeScript inference depth limit on easa_* tables (PARTIAL RESOLUTION 2026-03-16):** First seen 2026-03-15 (6b49021). Upgrading `@supabase/ssr` 0.5.0 → 0.9.0 (commit 225a163) removed the 2 suppressions in `draft-helpers.ts` (quiz_drafts table). However, the 3 suppressions in `upsert-subject.ts`, `upsert-subtopic.ts`, and `upsert-topic.ts` still apply — the TypeScript inference depth limit persists for the easa_* generated types on `.insert()` calls. Validated as still-needed (false positive) when semantic-reviewer flagged them in the 603b36c cycle and orchestrator confirmed the remaining suppressions are legitimate. The suppressions carry JSDoc comments explaining the root cause. Status: watch — not closed.

4. **Server-authoritative ordering value computed client-side (count 1, NEW):** `sort_order` was passed as a client prop and trusted on submission. Fixed to compute server-side. First occurrence. Watch for other cases where a server-authoritative derived value (order, position, rank) is passed from the client as a prop to a Server Action.

5. **New feature's tests co-located and shipped in the same commit (POSITIVE SIGNAL):** Unlike many prior cycles where tests were backfilled post-commit by the test-writer, this feature shipped all 5 test files alongside their source files in commit 6b49021. The test-writer's role was to verify correctness and catch one mock adjustment needed after cebf441. This is the intended pattern from code-style.md Section 7.

6. **Hard delete exception for admin reference data (design note — not a pattern violation):** `delete-item.ts` uses hard DELETE. The soft-delete rule covers student data and audit records, not admin-managed reference schema. The semantic-reviewer's suggestion was accepted as by-design and documented. No change to security.md — the existing rule text already limits the soft-delete requirement to the relevant tables. FALSE POSITIVE risk: the semantic-reviewer will likely flag hard deletes in admin actions in future commits. No suppression needed — the reviewer correctly flags it, and the orchestrator correctly accepts it with documentation.

**Actions taken:**
- Frequency table: "Non-redirect response in proxy.ts dropping session cookies" added at count 1, status WATCH. (The semantic-reviewer memory already has this as first-seen 6b49021.)
- Frequency table: "Supabase query error silently swallowed in auth/query helper (SELECT path)" added at count 2, status RULE CANDIDATE. Distinct from the existing "Supabase mutation result not destructured" entry.
- Frequency table: "Server-authoritative ordering value computed client-side and trusted on submission" added at count 1, status WATCH.
- Frequency table: "`@ts-expect-error` for Supabase inference depth limit on easa_* tables" partially resolved 2026-03-16; status updated to PARTIAL RESOLUTION — quiz_drafts suppressions removed by @supabase/ssr upgrade, but easa_* table suppressions persist (confirmed still needed by semantic-reviewer false-positive validation on 603b36c cycle).
- No changes proposed to `code-style.md`, `security.md`, or `biome.json` in this cycle — the Supabase query-error pattern is at count 2 but the action (clarifying the existing code-style.md rule to cover queries, not just mutations) should await orchestrator approval.

**Recommended changes (awaiting orchestrator approval):**

1. **`.claude/rules/code-style.md` Section 5 (TypeScript Rules — Supabase destructuring):** Extend the "Destructure Supabase Mutation Results" rule to cover Supabase SELECT/query calls in auth helper functions. The current rule reads "All Supabase mutation calls (.insert(), .update(), .delete(), .upsert()) must destructure { error }." Add: "The same applies to `.select()` queries in auth-related helpers (e.g., require-admin.ts, require-auth patterns) — always destructure { data, error } and log the error before returning a guard decision." Two occurrences across different commits (83ae098 and 6b49021) confirm this is a recurring pattern that the current rule text does not cover.

**Pending recommended changes (carried forward — still awaiting orchestrator action):**

1. **`.claude/agent-memory/test-writer/patterns.md`** — consoleSpy try/finally (3rd occurrence — from cb0395c cycle, actionable).
2. **`.claude/agent-memory/test-writer/patterns.md`** — scan every new `if (error) return` branch in files with existing tests; write the branch test in the same commit (3rd occurrence — from d057128 cycle, actionable).
3. **`.claude/agent-memory/test-writer/patterns.md`** — always construct test fixtures by annotating with the exported TypeScript type (2nd occurrence — from bba9800 cycle, actionable).
4. **`.claude/agent-memory/test-writer/patterns.md`** — use optional chaining (`arr?.[i]`) when accessing array indices in generated test assertions (2nd occurrence — from 99c67d2 cycle, actionable).

**False positives:**
- Semantic-reviewer flagged hard DELETE on syllabus items — accepted as by-design. Admin reference data is not covered by the soft-delete rule. No suppression added; the reviewer is correct to flag it and the orchestrator is correct to accept it with documentation. The pattern review note above captures the reasoning for future cycles.

**Positive signals:**
- Code reviewer was fully clean on both commits — the feature was written within all file-size limits from the start.
- cebf441 was clean on semantic review — the fix cycle closed in exactly one follow-up commit with no tertiary issues.
- The proxy cookie fix is a clean, minimal pattern: copy `response.cookies.getAll()` onto the outgoing response. Any future non-redirect path in proxy.ts will have this commit as a reference.
- 45 tests co-located with source in the feature commit is the best test-discipline outcome seen in any feature commit to date.

---

### 2026-03-16 — Dependency update batch (commits 225a163, 603b36c)

**Context:** Dependency update PR — minor/patch bumps across `package.json` files (225a163), followed immediately by a targeted type fix (603b36c) triggered by the semantic-reviewer ISSUE finding. No new features or migrations. Code reviewer and doc-updater reported clean. Test writer confirmed no gaps.

**Code reviewer:** CLEAN — 0 BLOCKING, 0 WARNING. Dependency updates contain no style-reviewable code changes. The type annotation fix in 603b36c is a single-line import addition in two files; within all line limits.

**Semantic reviewer (225a163 → 603b36c):** 1 ISSUE + 1 SUGGESTION.

1. **ISSUE — `Record<string, unknown>` instead of `CookieOptions` type annotation (225a163 → fixed 603b36c):** `packages/db/src/middleware.ts` and `packages/db/src/server.ts` both typed the `options` field in the `cookiesToSet` array as `Record<string, unknown>`. After the `@supabase/ssr` upgrade to 0.9.0 the `CookieOptions` type became publicly available from `@supabase/ssr`. Using the correct named type rather than a structural approximation gives better IDE support and ensures any future breaking change to the cookie options shape is caught by TypeScript at the call site. Fixed in 603b36c by importing `type { CookieOptions }` from `@supabase/ssr` in both files and replacing the `Record<string, unknown>` annotations. **First occurrence of this specific pattern (upstream type available but structural approximation used instead).** Logged as new watch item.

2. **SUGGESTION — Remaining `@ts-expect-error` suppressions on `easa_*` `.insert()` calls (225a163):** Semantic-reviewer flagged that three `@ts-expect-error` comments remain in `upsert-subject.ts`, `upsert-subtopic.ts`, and `upsert-topic.ts` after the `@supabase/ssr` upgrade. After investigation, confirmed these suppressions are still legitimately required — the TypeScript inference depth limit for the `easa_*` generated types on `.insert()` was not resolved by the `@supabase/ssr` upgrade (which only fixed the `quiz_drafts` inference path). The reviewer's suggestion to remove them would introduce a TS2769 compile error. **FALSE POSITIVE — the suppressions are correct and necessary.** Frequency table entry for `@ts-expect-error` on easa_* tables updated from RESOLVED to PARTIAL RESOLUTION. The suppressions carry JSDoc comments explaining the root cause; no further action needed.

**Doc updater:** CLEAN — no doc changes needed. Dependency bumps and a type annotation fix do not affect schema, routes, or architecture docs.

**Test writer:** CLEAN — no new test gaps. The type annotation change in 603b36c is a compile-time-only fix with no behavioral surface; no new tests needed. `packages/db/src/server.test.ts` and `middleware.ts` tests remain adequate.

**Pattern checks this cycle:**

1. **Upstream named type available but structural approximation used (count 1, NEW):** `Record<string, unknown>` was used for a cookie options shape that `@supabase/ssr` now exports as `CookieOptions`. After a library upgrade, any `Record<string, unknown>` or hand-rolled structural type annotation should be cross-checked against the updated library's public exports to see if a named type is now available. First occurrence — logged and watched. If a second instance appears (e.g., another `Record<string, X>` approximating a library type), add a note to code-style.md Section 5 about preferring named library types over structural approximations.

2. **`@ts-expect-error` on easa_* tables (PARTIAL RESOLUTION confirmed 2026-03-16):** Frequency table entry corrected — the @supabase/ssr upgrade only resolved the `quiz_drafts` suppressions. The `easa_*` suppressions persist and are necessary. The semantic-reviewer's suggestion to remove them is a false positive; the orchestrator correctly rejected it after validating that removing the comments causes TS2769 compile errors. False positive risk going forward: any semantic-reviewer pass over these three files will likely re-flag the suppressions. The JSDoc comments on each suppression explain the root cause and should be treated as authoritative justification.

**Actions taken:**
- Frequency table: "Upstream named type available but structural approximation used after library upgrade" added at count 1, status WATCH.
- Frequency table: "`@ts-expect-error` for Supabase inference depth limit on easa_* tables" corrected from RESOLVED to PARTIAL RESOLUTION — easa_* suppressions confirmed still needed.
- No changes proposed to `code-style.md`, `security.md`, or `biome.json` in this cycle — all patterns are first occurrences or confirmed false positives.

**False positives:**
- Semantic-reviewer suggested removing `@ts-expect-error` on `easa_*` insert calls — validated as false positive. The suppressions are still legitimately required; removing them causes TS2769. The `@supabase/ssr` upgrade fixed the inference depth for `quiz_drafts` but not the more complex `easa_*` type chain. This pattern of the semantic-reviewer re-flagging these suppressions is expected on any future diff that touches these files.

**Positive signals:**
- Code reviewer clean on both commits — the dependency update introduced no style drift.
- Semantic-reviewer caught a real type improvement opportunity (CookieOptions) that the dependency upgrade made possible but the original author of `middleware.ts`/`server.ts` could not have anticipated at write time. This is the intended value of the post-commit reviewer.
- Fix cycle closed in exactly one follow-up commit (603b36c) targeting exactly the two affected files. Minimal, correct fix.
- doc-updater and test-writer both clean — the cycle produced zero deferred debt.

---

### 2026-03-15 — Tech Debt PR #10 infrastructure & scripts (commits f2357a0, 4363a34, 8e918bc)

**Context:** Three-commit cycle on tech-debt/pr10-infrastructure-scripts. f2357a0 was the main commit — hardened CI config and infrastructure scripts. 4363a34 fixed two semantic-reviewer findings from the first commit. 8e918bc updated `docs/plan.md` to record PR #10 completion.

**Code reviewer:** CLEAN — 0 BLOCKING, 0 WARNING. No violations across any commit.

**Semantic reviewer (f2357a0):** 2 ISSUEs, both fixed in 4363a34.

1. **ISSUE — `seed-admin-eval.ts` topic/subtopic lookups used `.single()` where zero rows is a valid outcome (fixed 4363a34):** The seed script looked up topics and subtopics with `.single()`. The `.single()` Supabase client method raises a `PGRST116` error when the query returns zero rows — and that error is silently swallowed unless the caller explicitly destructures and checks `{ error }`. In a seed script that creates data conditionally (insert if not found), finding zero rows is an expected success path, not a DB error. The correct method is `.maybeSingle()`, which returns `{ data: null, error: null }` on zero rows and reserves `{ error }` for genuine DB-level failures. Fixed in 4363a34 by replacing both `.single()` calls with `.maybeSingle()`. Root cause: `.single()` vs `.maybeSingle()` distinction is non-obvious — `.single()` conflates "found exactly one row" with "query success," which is wrong for conditional-existence patterns. **First occurrence as a named pattern.** Logged and watched. Distinct from the existing "Supabase mutation result not destructured" rule (that is about `.insert()/.update()/.delete()` calls — this is about `.select()` lookups where zero rows is a valid state).

2. **ISSUE — Security auditor script had two diverged copies of the same grep fallback logic (fixed 4363a34):** The security auditor had separate implementations of the same grep fallback in two paths: the timeout-fallback branch and the agent-failure-fallback branch. The two copies had drifted out of sync — one had been updated with a bug fix that the other did not receive. Fixed in 4363a34 by extracting the shared logic to a single helper function called by both paths. Root cause: copy-paste duplication in shell/infrastructure scripts is harder to spot than in application code — there is no shared abstraction layer and no type-checker to flag divergence. **First occurrence as a named pattern.** Logged and watched. The principle: in scripts (shell or TS) with multiple error-handling code paths, shared logic must be extracted to a function rather than duplicated, for the same reason as application code.

**Semantic reviewer (4363a34):** 1 SUGGESTION (non-blocking).

- **SUGGESTION — Redundant outer grep guard in security auditor:** A guard condition in the security auditor was technically redundant given the surrounding control flow — the condition could never be false at that point. Non-functional, not worth fixing. Logged.

**Semantic reviewer (8e918bc):** Not run — docs-only commit with no production or script changes.

**Doc updater (8e918bc):** Updated `docs/plan.md` with PR #10 completion entry. Clean — no partial-doc-fix pattern.

**Test writer:** No new tests needed. The files changed (infrastructure scripts, CI config, seed script) are in the `scripts/` directory, which is explicitly excluded from the co-located test requirement per the code-reviewer agent's known suppressions. No behavioral logic was added — only hardening and bug fixes in operational tooling.

**Pattern analysis — `.single()` where `.maybeSingle()` is correct (count 1, NEW):**

The `.single()` vs `.maybeSingle()` distinction matters for any SELECT lookup where zero rows is an expected valid state (conditional existence checks, "find or create" patterns, optional resource lookups). `.single()` treats zero rows as an error (PGRST116). `.maybeSingle()` treats zero rows as `{ data: null, error: null }`.

The seed script pattern is the canonical case: looking up a topic that may or may not exist in order to decide whether to insert it. Using `.single()` here means a first-run seed (where no data exists yet) generates silent PGRST116 errors that appear as DB failures in the error log. If the caller does not check `{ error }`, the seed silently proceeds with `data: null` and may produce incorrect inserts.

**First occurrence — log and watch.** Rule change requires 2+ occurrences across different commits. If a second lookup using `.single()` on a "may or may not exist" query is found, add a note to `code-style.md` Section 5 or the semantic-reviewer's checklist: "use `.maybeSingle()` for optional-existence lookups; reserve `.single()` only for queries where zero rows is a bug (e.g., fetching a record by primary key that is guaranteed to exist by prior business logic)."

**Pattern analysis — duplicated error/fallback code in scripts that drifts (count 1, NEW):**

Scripts (shell, seed, infrastructure) are the lowest-enforcement-density code in the project: no type-checker, no Biome formatting for shell, no test coverage. When error-handling branches are copy-pasted between two code paths (e.g., two catch blocks, two timeout handlers), they drift silently — one receives a fix, the other does not. The result is inconsistent behavior under failure conditions.

**First occurrence — log and watch.** The correct prevention: any script with two or more similar error-handling or fallback sections must extract the shared logic to a named function. If a second script-level copy-paste drift appears in a later commit, add a note to code-style.md Section 3 (Function Rules): the DRY rule applies equally to scripts and infrastructure files — duplicated fallback logic must be extracted.

**Actions taken:**
- Frequency table: "`.single()` used where no-row is a valid outcome (silently swallows PGRST116 error)" added at count 1, status WATCH.
- Frequency table: "Duplicated fallback/error-handling code in same file that drifts out of sync" added at count 1, status WATCH.
- No changes proposed to `code-style.md`, `security.md`, or `biome.json` — both patterns are first occurrences.

**False positives:** none detected.

**Positive signals:**
- Code reviewer was clean on all commits — the infrastructure hardening stayed within all structural rules.
- The semantic reviewer caught both ISSUEs (`.single()` and diverged fallback copy) on the first pass. Both were targeted, one-function fixes in 4363a34. The fix cycle closed in exactly one follow-up commit.
- Scripts directory exemption from co-located test rule was correctly applied by the test-writer — no false "missing test" flag generated.
- PR #10 is the cleanest tech-debt batch to date: 1 ISSUE round, both fixed in a single follow-up commit, all agents clean after that.

---

### 2026-03-16 — FSRS removal (commit b41ffa8)

**Context:** Single commit removing all ts-fsrs library remnants from the codebase. Deleted `lib/fsrs/update-card.ts` and its test, removed the `ts-fsrs` npm dependency, deleted caller code in `submit.ts`, `review/actions.ts`, and associated test assertions. Migration 040 moved `last_was_correct` tracking atomically into `submit_quiz_answer` RPC, putting single-answer mode on parity with batch mode.

**Code reviewer:** CLEAN — 0 BLOCKING, 0 WARNING. The commit was a deletion-heavy refactor with no new file size violations. All surviving files within limits.

**Semantic reviewer:** 0 CRITICAL, 0 ISSUE. 2 SUGGESTIONS.

1. **SUGGESTION — `submit_quiz_answer` DEPRECATED label in docs/database.md is now misleading:** Migration 040 rehabilitates the RPC to parity with `batch_submit_quiz` on `last_was_correct` tracking. The DEPRECATED label was appropriate before migration 040 when single-answer mode silently skipped `last_was_correct` writes; it is misleading now. Doc-updater follow-up commit resolved this in the same session. Non-blocking.

2. **SUGGESTION — Stale FSRS references in agent memory files:** The semantic-reviewer flagged that `.claude/agent-memory/code-reviewer/patterns.md` and `.claude/agent-memory/test-writer/patterns.md` contain session entries referencing deleted files (`lib/fsrs/update-card.ts`, `updateFsrsCard`, `@repo/db/fsrs` mock patterns). These entries are historically accurate but the code no longer exists. Deferred to the learner cycle (this entry) for annotation rather than immediate file edits by the semantic-reviewer, which is outside its scope.

**Doc updater:** Updated 4 docs in the same commit cycle — `docs/plan.md`, `docs/decisions.md`, `docs/database.md` (DEPRECATED label fix), `MEMORY.md`. Clean — no partial-doc-fix pattern.

**Test writer:** No coverage gaps. 876 tests passing. `lib/fsrs/update-card.test.ts` was deleted alongside `lib/fsrs/update-card.ts` in the commit, so the test suite correctly shrank by those tests. No new source files introduced.

---

**Pattern analysis — Migration-based consolidation (count 1, NEW):**

Migration 040 is the third instance of moving TypeScript-side logic into a Postgres RPC for atomicity (prior examples: `consecutive_correct_count` tracking in `batch_submit_quiz`, `draft_count` enforcement via DB trigger). The pattern: when a TypeScript post-call update can be lost on connection failure (best-effort try/catch), moving the write into the RPC transaction eliminates the loss window entirely. The trade-off is that the SQL must replicate the logic — but for simple `ON CONFLICT DO UPDATE SET` patterns the SQL is less complex than the try/catch wrapper it replaces.

**First occurrence as an explicitly named pattern.** Logged and watched. If a third instance of TypeScript best-effort post-RPC writes appears, propose a note in `code-style.md` or agent memory: "writes that must be atomic with a preceding DB operation belong in the RPC, not in TypeScript caller code."

---

**Pattern analysis — Clean library removal discipline (count 1, NEW):**

The FSRS removal was executed as a single atomic commit: dependency deleted, wrapper file deleted, callers updated, tests deleted/updated, docs updated, agent memory stale references flagged for annotation. No step was deferred to a follow-up commit. This is the first time this full removal checklist was observed in a single commit. The positive outcome: code reviewer and test writer both reported clean, confirming the removal was complete.

The checklist for a clean library removal:
1. Delete the npm dependency from `package.json`.
2. Delete all wrapper/adapter files in `lib/` or `packages/`.
3. Update all callers — remove import lines, remove call sites, adjust return-type handling.
4. Delete or update co-located test files for deleted/changed source files.
5. Update docs (plan.md, decisions.md, database.md) in the same commit.
6. Annotate agent memory files that reference the deleted code as stale (or flag to learner).

**First occurrence as a named positive pattern.** No rule change needed — this is a positive exemplar to reference in future removal work.

---

**Pattern analysis — Behavioral gap silently fixed by migration (count 1, NEW):**

Migration 040 fixed a latent behavioral gap: `last_was_correct` was never written in single-answer practice mode. The `filter:incorrect` mode in the quiz trainer therefore never showed questions answered wrong via the single-answer path. This gap had existed since the feature shipped — it was never flagged by any post-commit agent because no test existed for the cross-path consistency of `last_was_correct`. The fix was a side-effect of the FSRS removal, not a targeted bugfix.

**Implication:** When a migration adds a column write path to an RPC that previously lacked it, the semantic-reviewer should check whether any query-side consumers (filters, analytics) depend on that column being populated by all write paths. If only one write path populates a column that multiple paths should populate, the filter silently returns incomplete results.

**First occurrence as a named pattern.** Logged and watched.

---

**Stale FSRS references in agent memory — annotation:**

The following agent memory entries reference code that no longer exists after commit b41ffa8. They remain historically accurate but the code paths are gone:

- `code-reviewer/patterns.md`: Multiple session entries reference `apps/web/lib/fsrs/update-card.ts`, `updateFsrsCard()` 4-param exception, FSRS best-effort try/catch pattern. These are historical records, not active watch items. The 4-param exception entry on line 721 ("`updateFsrsCard uses 4 params`") should NOT be removed — it is the canonical justification for why 4-param utility functions are an acceptable exception to the 3-param rule. The file is deleted but the rule exception remains valid.

- `test-writer/patterns.md`: Entries referencing `lib/fsrs/update-card.ts`, the `@repo/db/fsrs` mock pattern, and "non-fatal FSRS" test cases. These are historical records. The mock pattern for `@repo/db/fsrs` is now unused (the package export is gone), but the general principle (vi.hoisted + vi.mock for module-level deps) is still valid and documented elsewhere in test-writer memory.

---

### 2026-03-16 — CodeQL + Dependabot CI configuration (commits 5838947, 83b4844)

**Context:** Two commits. First (5838947) added `.github/workflows/codeql.yml` and `.github/dependabot.yml`. Second (83b4844) applied fixes from the semantic-reviewer round. Changes were YAML configuration only — no TypeScript, no migrations, no production code.

**Code reviewer:** CLEAN — 0 BLOCKING, 0 WARNING. YAML config files are exempt from file-size limits (config file relaxation documented in agent suppressions).

**Doc updater:** 2 updates applied — `docs/plan.md` (progress tracking) and `docs/decisions.md` (new decision entry for CodeQL/Dependabot addition). Both applied in the same cycle. No partial-doc-fix pattern.

**Test writer:** No coverage gaps. YAML config files produce no testable TypeScript surface. Correct — no action taken.

**Semantic reviewer (5838947):** 2 ISSUEs + 3 SUGGESTIONs.

1. **ISSUE — `cancel-in-progress: true` wrong for CodeQL SARIF workflows (5838947 → fixed 83b4844):** CodeQL uploads SARIF results to GitHub Security dashboard on every run. Using `cancel-in-progress: true` in `concurrency` settings kills in-flight runs, which GitHub interprets as missing SARIF uploads — suppressing security alerts for the cancelled commit. Fixed in 83b4844 by removing `cancel-in-progress: true` from the CodeQL workflow (the group key was also removed). **First occurrence of this CodeQL-specific pattern.** Logged as new watch item.

2. **ISSUE — Missing `pull_request` trigger on CodeQL workflow (5838947 → deferred by plan):** CodeQL workflow lacked a `pull_request` trigger, so code scanning would not run on PRs — defeating the primary use case of catching vulnerabilities before merge. Acknowledged during review as an intentional deferral: the current workflow only runs on push/schedule while the project is pre-multi-contributor. The trigger will be added when PR-based review workflow is established. **Not a false positive — genuine gap accepted as a documented trade-off.** Logged as watch item.

3. **SUGGESTION — `autobuild` step unnecessary for TypeScript (5838947 → fixed 83b4844):** The CodeQL workflow included a `uses: github/codeql-action/autobuild@v3` step. For interpreted/transpiled languages (TypeScript/JavaScript), CodeQL does not require a build step — it analyzes source files directly. The `autobuild` step added noise and potential failure surface. Fixed in 83b4844 by removing the step. **First occurrence.** Logged as new watch item.

4. **SUGGESTION — `major` version group ungrouped in Dependabot (5838947 → intentional):** Dependabot config did not define a separate group for `major` version bumps, meaning major updates would be batched with minor/patch in the same PR. Acknowledged as intentional — major updates require individual review and manual grouping is preferable. No action taken. **Not a false positive — intentional design choice.**

5. **SUGGESTION — Maintenance comment on schedule block (5838947 → skipped):** Minor suggestion to add an inline comment explaining the CodeQL weekly schedule. Skipped as low value for a small team. **First occurrence — log and watch.**

**Actions taken:**
- Frequency table: added "cancel-in-progress misapplied to SARIF workflow" as new watch item (count 1). First occurrence — no rule change. If a second CI workflow ships with this misconfiguration, add a note to CI workflow authoring guidance.
- Frequency table: added "CodeQL autobuild step unnecessary for TypeScript" as new watch item (count 1). First occurrence — no rule change.
- Frequency table: "missing PR trigger on CodeQL" logged as intentional deferral, not a violation. Status: accepted trade-off, add trigger when multi-contributor PR workflow begins.
- No changes to `code-style.md`, `security.md`, or `biome.json` — all patterns are first occurrences and neither pattern is the type enforced by those files (CI config authoring is outside their scope).

**False positives:** none detected. The semantic-reviewer's 2 ISSUEs were both real — one fixed, one intentionally deferred with documentation.

**Positive signals:**
- Code reviewer correctly exempted YAML config from line-limit checks. Suppression is working.
- Test writer correctly produced no output for a YAML-only diff. Agent scope boundaries held.
- Doc updater applied both doc targets (plan.md + decisions.md) in the same cycle — no partial-doc-fix pattern.
- Fix commit (83b4844) was clean on all agents. Two targeted removals (autobuild step, cancel-in-progress) closed the ISSUE and SUGGESTION without introducing new findings.

No edits needed to those files beyond this notation. The entries are accurate historical records.

---

**Actions taken:**
- Frequency table: "Array positional pairing instead of Map lookup (FSRS)" — status updated to RESOLVED (the entire FSRS TS layer is removed; the Map lookup pattern in `updateFsrsCards` was the last call site and that code is now gone).
- Frequency table: "Migration-based consolidation (TS logic moved to RPC)" added at count 1, status WATCH.
- Frequency table: No other frequency table changes — all findings this cycle are first occurrences.
- No changes proposed to `code-style.md`, `security.md`, or `biome.json` — all patterns are first occurrences.

**False positives:**
- Semantic-reviewer flagged stale DEPRECATED label for `submit_quiz_answer` — this was a real doc gap, not a false positive. Fixed by doc-updater in the same session.

**Positive signals:**
- Code reviewer and test writer both clean — the library removal was executed completely in one commit with no dangling references.
- Migration 040 closes the single-answer `last_was_correct` gap, making the `filter:incorrect` mode reliable across both submission paths for the first time. This is a behavioral improvement that shipped as a side-effect, not an oversight.
- The FSRS removal is the cleanest dependency removal to date: single commit, all agents clean first pass, no follow-up fix commit needed.

---

### 2026-03-16 — GH Actions version bump (commit 13ce663)

**Context:** Single commit bumping GitHub Actions versions across CI/CD workflows — `actions/checkout` v4→v6, `actions/upload-artifact` to v7, `actions/github-script` to v7, `github/codeql-action` to v4. YAML-only diff, no TypeScript, no migrations, no production code.

**Code reviewer:** CLEAN — 0 findings. YAML config files are exempt from file-size limits (config file relaxation in agent suppressions). Correct.

**Doc updater:** No updates needed. No schema changes, no new routes, no architectural decisions. Correct.

**Test writer:** No tests needed. YAML config files produce no testable TypeScript surface. Correct.

**Semantic reviewer:** 1 ISSUE + 3 GOOD.

1. **ISSUE — `actions/checkout` v4→v6 credential isolation change (assessed as inert):** The semantic-reviewer flagged that `actions/checkout@v6` changed credential scope/isolation semantics versus v4. After assessment: the change is inert for this repo's workflow structure — no steps in any workflow rely on cross-job credential sharing or the specific credential persistence behavior that changed between versions. The ISSUE was reviewed and accepted with no fix needed. **Logged as an intentional no-action decision, not a false positive.** The reviewer's flag was technically correct (behavior did change) but the change does not affect this repo's workflows in practice.

2. **3 GOOD findings:** Semantic-reviewer noted clean patterns in the version bump — consistent pinning strategy, no mixed version states across workflows, and the bump did not introduce any workflow trigger changes. Positive signals acknowledged.

**Actions taken:**
- Frequency table: no changes. No new patterns introduced — this was a clean infrastructure maintenance commit.
- No changes to `code-style.md`, `security.md`, or `biome.json`.
- The `actions/checkout` v6 credential isolation assessment logged here as reference for future GH Actions upgrades — when bumping `actions/checkout` past v4, verify no workflow relies on cross-job credential sharing.

**False positives:** none. The semantic-reviewer ISSUE was a real behavior change; the no-action decision was based on assessment of the specific repo's workflow structure, not dismissal of the finding.

**Positive signals:**
- All 4 agents correctly handled a YAML-only diff with no spurious findings. Agent scope boundaries held cleanly.
- Code reviewer, doc updater, and test writer all produced correct "nothing to do" outputs — zero noise for a maintenance commit.
- The semantic-reviewer ISSUE was assessed and consciously accepted rather than silently ignored — the validate-before-fixing protocol working as intended.

---

### 2026-03-16 — Zod 3 → 4 migration (commits 559bf9e + 5ad3c16)

**Context:** `apps/web` and `packages/db` upgraded from Zod 3 to Zod 4 (559bf9e). A follow-up commit (5ad3c16) was required to fix E2E red-team sentinel UUIDs that were invalid under Zod 4's stricter UUID validation. The migration touched 29 files — 27 test files and 2 production source files (`draft.ts`, `start.ts`). Both production file changes were one-line error-message string updates.

**Code reviewer:** CLEAN — 0 blocking, 0 warnings. Correct: the changes were test fixture constant replacements and one-line string updates, all within file limits.

**Semantic reviewer:** 0 CRITICAL, 0 ISSUE, 1 SUGGESTION, 5 GOOD. The SUGGESTION (E2E redteam UUID sentinels were invalid under Zod 4 RFC 4122 enforcement) was addressed in the follow-up commit 5ad3c16 before the learner ran.

**Doc updater:** No updates needed. No schema, RPC, route, or architecture surface changed.

**Test writer:** No coverage gaps. All affected test files were already being updated as part of the migration.

**Patterns detected this cycle:**

1. **[NEW] Test fixtures using zeroed UUID format (`00000000-0000-0000-0000-*`) invalid under Zod 4 RFC 4122 enforcement**
   - Zod 4 validates version bits (nibble 13 must be 4–5) and variant bits (nibble 17 must be 8–b) per RFC 4122. Zeroed-suffix UUIDs like `00000000-0000-0000-0000-000000000001` have `0000` in version position — they pass Zod 3 but fail Zod 4.
   - Impact: 27 test files required UUID constant replacements to `00000000-0000-4000-a000-*` format.
   - Also affected: E2E red-team sentinel UUIDs hardcoded in spec files (5ad3c16).
   - First occurrence as a named pattern. Logged and watched.
   - Action: log and watch. If a new test file is added with zeroed-suffix UUIDs after this migration, add a note to test-writer patterns memory: "always use RFC 4122-compliant UUID fixtures — version nibble must be 4 or 5, variant nibble must be 8–b. Safe constant: `00000000-0000-4000-a000-000000000001`."

2. **[NEW] Zod 4 error message strings changed from Zod 3 (breaking string-pinned test assertions)**
   - Two production source files had error message strings pinned to Zod 3 internal text that changed in Zod 4: `"Invalid uuid"` → `"Invalid UUID"` (capitalisation); `"Required"` → `"Invalid input: expected string, received undefined"` (full message rewrite).
   - Root cause connection: This is the second occurrence of the broader "Zod error message pinned to exact internal text" pattern (first logged in cb0395c, 2026-03-14 — test file pinning to Zod internal strings). That pattern is now at count 2 across different commits. **Status promoted from WATCH to RULE CANDIDATE.**
   - Count in frequency table: 1 → 2. See "Zod error message pinned to exact internal text" entry.
   - Action: frequency table updated. Propose rule note for test-writer patterns memory and/or code-style.md: never assert on the `.message` text of a Zod error directly in tests or production code — assert on `error instanceof ZodError`, `issues[0].code`, or a controlled message you set yourself via `.message()` or a `.catch()` transform.

3. **[NEW] `err.errors` property access silently returning `undefined` after Zod 4 removal**
   - Zod 4 removed the `.errors` property (Zod 3 alias for `.issues`). Accessing `err.errors` on a ZodError in Zod 4 returns `undefined` rather than throwing, causing code paths that destructure or iterate `.errors` to silently fall through to fallback strings rather than surfacing the actual validation failures.
   - Two production source files were affected; both required updating to `.issues`. Because Zod's TypeScript types correctly track the removal, the changes were caught by the pre-commit `tsc --noEmit` gate — no silent runtime failures reached git.
   - First occurrence as a named pattern. Logged and watched.
   - Action: log and watch. The pre-commit type-check gate is the correct mechanical gate here — no additional rule needed unless a second occurrence slips through (which would indicate a gap in type-check coverage, not just authoring habit).

**Patterns checked from frequency table:**

- **"Zod error message pinned to exact internal text" (count 1 → 2, RULE CANDIDATE):** The prior occurrence (cb0395c) was a test file. This occurrence is production source files. Both involve pinning to Zod's internal message strings that are not part of the public API. Count: 2. Status: RULE CANDIDATE.

**Recommended changes (awaiting orchestrator approval before applying):**

1. **test-writer patterns memory** — add a note: when generating test fixtures that include UUID values, always use RFC 4122-compliant constants. Safe form: `00000000-0000-4000-a000-000000000001` (version nibble = 4, variant nibble = a). The zeroed form `00000000-0000-0000-0000-000000000001` is not RFC 4122-compliant and will fail Zod's `.uuid()` validator.

2. **test-writer patterns memory / code-style.md Section 5** — when asserting on Zod validation errors, do not pin to `.message` text. Prefer: `expect(error).toBeInstanceOf(ZodError)` and/or `expect(error.issues[0].code).toBe('invalid_type')`. Zod's internal message strings changed between v3 and v4 and are not part of its public API contract. This is the second occurrence across different commits — rule candidate threshold met.

**Actions taken:**
- Frequency table: "Zod error message pinned to exact internal text" count updated 1 → 2. Status: RULE CANDIDATE.
- Frequency table: 2 new watch items added (both first occurrences): "Test fixtures using zeroed UUID format invalid under Zod 4 RFC 4122 enforcement" and "`err.errors` property access silently undefined after Zod 4 removal."

**False positives:** none. The semantic-reviewer SUGGESTION on E2E sentinel UUIDs was valid and fixed in 5ad3c16.

**Positive signals:**
- The pre-commit `tsc --noEmit` gate caught every `err.errors` access (removed in Zod 4) at commit time — none reached git as a runtime silent failure. The mechanical gate worked exactly as intended.
- All 4 agents reported clean or near-clean on a 29-file migration — signal that the migration was well-scoped and the codebase has good test coverage.
- The semantic-reviewer's GOOD patterns (5 total) reflect consistent Zod 4 adoption: `.parse()` still in try/catch, schema definitions structurally unchanged, no regressions in Server Action input validation.
- The follow-up UUID commit (5ad3c16) was small and targeted — 1 file, 9 constant replacements. The E2E gate caught the gap cleanly.

---

### 2026-03-16 — Biome 1→2 migration + batch minor/patch deps + Escape double-fire fix (commits a9930ac, 7a93e37, 03fada1, 4439640)

**Context:** Four commits processed in this learner cycle. a9930ac migrated Biome from v1 to v2 (biome.json restructured, `globals.css` formatting updated). 7a93e37 was a batch minor/patch dependency update (Dependabot). 03fada1 addressed a semantic-reviewer finding from the Biome migration cycle — the initial fix for the Escape double-fire in `finish-quiz-dialog.tsx`. 4439640 was the corrected fix (stopPropagation() moved before the key check). The Escape double-fire bug was originally present in the codebase before these commits and was first surfaced by the PR-level semantic review sweep, not by the per-commit round on the individual commit that contained the component.

**Code reviewer:** CLEAN — 0 BLOCKING, 0 WARNING.

**Doc updater:** `docs/plan.md` updated (sprint/phase progress). No schema, RPC, or route changes.

**Test writer:** No coverage gaps found. The `finish-quiz-dialog.tsx` fix was a 1-line change to event propagation ordering — the behavioral change is the absence of a double-fire, which is not directly testable via vitest unit tests (requires DOM event bubbling through a real or simulated backdrop, which is outside the jsdom unit test scope for this component).

**Semantic reviewer:** 0 CRITICAL, 1 ISSUE (Escape double-fire, fixed), 2 SUGGESTIONS. The ISSUE was caught in the PR-level diff sweep (`git diff master...HEAD`), not in the per-commit round on the commit that introduced the component change. This confirms the PR-level sweep provides qualitatively different coverage than per-commit review.

**Patterns detected this cycle:**

1. **[REPEAT] UI event handler double-fire — Escape key in dialog (count 2)**
   - The `finish-quiz-dialog.tsx` `onKeyDown` handler called `e.stopPropagation()` only in the non-Escape branch, allowing Escape events to bubble from the inner dialog `div` to the outer backdrop handler, triggering `handleClose()` twice. The correct fix: call `e.stopPropagation()` unconditionally before the key check.
   - First occurrence: `handleSelectAnswer` had no guard preventing a second async call while first was in-flight (feat/post-sprint-3-polish, 2026-03-13). Second occurrence: `finish-quiz-dialog.tsx` Escape double-fire (this cycle).
   - Both involve a UI interaction path that can fire twice due to missing event or state guard. Both were caught post-commit rather than at authoring time.
   - Count in frequency table: 1 → 2. Status: RULE CANDIDATE.
   - The two occurrences are different mechanisms (async in-flight guard vs. DOM event bubbling), so a single mechanical rule is not obvious. The common principle: any interactive component with a close/submit/complete action must be audited at authoring time for re-entry paths — both async double-invocation (use a ref lock) and DOM event double-fire (use stopPropagation before guard check).

2. **[POSITIVE SIGNAL] PR-level sweep catching a bug that per-commit review missed**
   - The Escape double-fire was present in code that was committed and passed per-commit review. It was caught only when the semantic-reviewer saw the full PR diff (`git diff master...HEAD`). The specific context that revealed the bug: the relationship between `finish-quiz-dialog.tsx`'s `onKeyDown` on the inner div and the backdrop's `onClick`/`onKeyDown` handlers — cross-component event interaction that is invisible when reviewing a single commit.
   - This is the second explicit validation of the PR-level sweep's value (first was documented as a system-level insight in the 2026-03-13 CodeRabbit meta-pattern observation). The PR-level sweep requirement in `agent-workflow.md` is confirmed necessary and working.
   - No action needed — the rule already requires PR-level sweep before push. This is a positive confirmation.

**Patterns checked from frequency table:**

- **"UI event handler missing re-entry guard (double-fire on fast interaction)" (count 1 → 2, RULE CANDIDATE):** Count updated. The two occurrences use different mechanisms. No single mechanically checkable rule emerges; log as RULE CANDIDATE for agent memory guidance rather than code-style.md addition.

**Actions taken:**
- Frequency table: "UI event handler missing re-entry guard (double-fire on fast interaction)" count updated 1 → 2. Status: RULE CANDIDATE.
- No changes to `code-style.md`, `security.md`, or `biome.json` — the double-fire pattern spans two different mechanisms and does not map to a single mechanical rule. The guidance belongs in semantic-reviewer checklist awareness or agent memory, not a style rule.

**False positives:** none.

**Positive signals:**
- All 4 agents clean on the Biome migration (a9930ac) — a large-footprint config migration (74 files) with zero code-style violations or test gaps. Signal: the migration was purely mechanical.
- The Biome 2 migration required no production logic changes — all deltas were formatting (globals.css) and config restructuring (biome.json). The pre-commit Biome gate confirmed correctness on the first attempt.
- The PR-level sweep caught a real interaction bug invisible to per-commit review. Fix was minimal (1 line, move stopPropagation before key check). This is the intended sweet spot for PR-level review: catches cross-component behavioral assumptions that single-commit diff review cannot see.
- The dependency batch (7a93e37) was processed cleanly — code reviewer correctly applied config file relaxation, test writer correctly produced no output. Agent scope boundaries held.

---

### 2026-03-16 — Pure devDependency bump (commit c5025f6)

**Commit:** chore: bump commitlint 20, jsdom 29, @types/node 22
**Files changed:** `apps/web/package.json`, `package.json`, `pnpm-lock.yaml`

**Code reviewer:** 0 BLOCKING, 0 WARNING. Clean. Config/lockfile changes only; relaxed file-size limits apply.

**Semantic reviewer:** 0 CRITICAL, 0 ISSUE. 1 SUGGESTION: turbo type-check cache does not invalidate on `@types/*` package bumps, so `pnpm check-types` on dep-bump commits may serve a cached pre-bump result. Workaround: run `pnpm check-types --force`. This is the second occurrence of this observation (first was PR #211 documented in semantic-reviewer memory).

**Doc updater:** no changes needed. Pure devDependency bump; no schema, API, or architecture changes.

**Test writer:** no tests needed. No production source files changed.

**Pattern analysis:**

1. **[REPEAT — 2nd occurrence] Turbo type-check cache masking new compile errors after dependency bumps**
   - First occurrence: PR #211 batch dep bump (@supabase/ssr, @supabase/supabase-js, vitest) — semantic-reviewer logged in its own memory as "1st occurrence, SUGGESTION."
   - Second occurrence: c5025f6 commitlint 20 / jsdom 29 / @types/node 22 bump — semantic-reviewer flagged the same SUGGESTION again.
   - Count is now 2 across different commits. Threshold for RULE CANDIDATE met.
   - Recommended action: add a workflow note to CLAUDE.md (or agent memory) stating that after any dep-bump commit, `pnpm check-types --force` must be run to bypass the turbo cache before treating type-check as green. This is not a code-style rule and not a Biome/Lefthook enforcement concern — it is a workflow habit for dep-bump commits specifically.
   - Frequency table updated: "Turbo type-check cache masking new compile errors after dependency bumps" count 1 → 2, status RULE CANDIDATE.

**Recommended changes:**
- [ ] `CLAUDE.md` — add note to the "Commands" or "QA pipeline" section: "After any dep-bump commit, run `pnpm check-types --force` (bypasses turbo cache) to confirm new type definitions do not introduce errors."

**Actions taken:**
- Frequency table: added "Turbo type-check cache masking new compile errors after dependency bumps" as new row, count 2, status RULE CANDIDATE.
- No changes to `code-style.md`, `security.md`, or `biome.json` — this is a workflow habit, not a mechanical lint rule.
- Proposed CLAUDE.md change above; orchestrator decides whether to apply it.

**False positives:** none.

**Positive signals:**
- All 4 agents fully clean on a pure devDependency bump. Agent scoping is working correctly: code-reviewer applied config relaxation, test-writer correctly produced no output, doc-updater correctly found nothing to update.
- The semantic reviewer's SUGGESTION (turbo cache) was handled correctly via `--force` at authoring time — no type errors were silently masked in this commit. The SUGGESTION is about future dep-bump commits, not a gap in this one.

---

### 2026-03-20 — Security patch bump (commit 2d1901a)

**Commit:** fix(deps): bump next 16.1.6 → 16.1.7 to resolve 12 security alerts
**Files changed:** `apps/web/package.json`, `pnpm-lock.yaml`

**Code reviewer:** 0 BLOCKING, 0 WARNING. Clean. Lockfile and single package.json version bump; config file relaxation applies.

**Semantic reviewer:** 0 CRITICAL, 0 ISSUE, 0 SUGGESTIONS. Clean. Patch bump with no API surface changes; no behavioral analysis needed.

**Doc updater:** no changes needed. Pure runtime dependency patch; no schema, API, or architecture changes.

**Test writer:** no tests needed. No production source files changed.

**Pattern analysis:**

No new patterns. No repeat occurrences triggered.

**Patterns checked from frequency table:**

- "Turbo type-check cache masking new compile errors after dependency bumps" (count 3, RULE APPLIED): CLAUDE.md rule was applied at authoring time — no action needed. This is a Next.js runtime bump, not a type-definition package, so the turbo cache risk is lower. No type errors surfaced. Rule continues to hold.

**Actions taken:** none. All agents clean; no frequency table entries updated; no rule changes.

**False positives:** none.

**Positive signals:**
- All 4 agents clean on a security patch bump resolving 12 Dependabot alerts. This is the expected behavior for a patch-level runtime dep update with no source file changes.
- Agent scope boundaries held correctly: code-reviewer applied config relaxation (lockfile + package.json), test-writer correctly produced no output, doc-updater correctly found nothing to update, semantic-reviewer found no behavioral concerns.
- Clean cycles on dep-only commits are healthy signals that the agent pipeline is not over-flagging. No false positives introduced.

---

### 2026-03-20 — feat(quiz): add question_comments table + flag/comment Server Actions (commits 6520962, b71eb18)

**Context:** New feature commit adding the `question_comments` table migration, `comments.ts` and `flag.ts` Server Actions, regenerated types, and updated database.md. Post-commit agents found 1 BLOCKING and 2 ISSUEs. A fix commit (b71eb18) resolved all findings. test-writer produced 56 tests.

**Code reviewer:** 1 BLOCKING.
1. `toggleFlag` in flag.ts — 52 lines (limit: 30). Fixed by extracting `unflagQuestion()` and `flagQuestion()` helpers in b71eb18.

**Doc updater:** database.md already updated in the feature commit. No further changes needed. Clean.

**Test writer:** 56 tests written (27 for comments.ts, 29 for flag.ts). All passing.

**Semantic reviewer:** 2 ISSUEs, 3 SUGGESTIONs.
1. **deleteComment silent no-op — ISSUE.** RLS enforces ownership, but a delete on a wrong `commentId` or a cross-user attempt returns 200 with 0 affected rows, and the caller receives `{ success: true }`. Fixed in b71eb18 by adding `.eq('user_id', user.id)` to the query and checking that at least one row matched.
2. **toggleFlag read-then-write race — ISSUE.** SELECT to check current flag state followed by UPDATE or UPSERT; two concurrent toggle calls from different tabs could leave the flag in the wrong state. Fixed in b71eb18 by adding `.is('deleted_at', null)` to the UPDATE predicate, making the unflag conditional and atomic at the DB level.
3. **Suggestion 1:** RLS SELECT subquery should be commented to explain orphaned-user defense intent. Deferred.
4. **Suggestion 2:** `getComments` returns `{ success: true, comments: [] }` on unauthenticated call instead of `{ success: false, error: 'Not authenticated' }`. Inconsistent with established pattern. Proxy makes the path unreachable in production. Deferred.
5. **Suggestion 3:** `createComment` uses `.single()` after insert; trigger-suppressed insert would return PGRST116 logged as a generic error. Deferred.

**Patterns detected this cycle:**

1. **[REPEAT — 2nd occurrence] Function exceeding 30-line limit in Server Action file (count 1 → 2)**
   - First occurrence: `getFilteredCount` in lookup.ts (d93f924) — 58 lines. Fixed by extracting `buildQuestionQuery`.
   - Second occurrence: `toggleFlag` in flag.ts (6520962) — 52 lines. Fixed by extracting `unflagQuestion`/`flagQuestion`.
   - Common root cause: Server Action functions with 2+ distinct conditional branches are written as a single function. Each branch alone may look manageable, but the combined function body exceeds 30 lines.
   - Count in frequency table: 1 → 2. Status: RULE CANDIDATE.
   - Threshold met. Actionable at authoring time: any Server Action function with 2+ branches (e.g., toggle/flag/unflag) should have each branch extracted as a named helper before writing the orchestrator. This is already implied by code-style.md Section 3 ("Extract steps into named helper functions") but that section does not call out the 2-branch toggle pattern specifically.
   - No mechanical rule change proposed — the 30-line limit already exists in code-style.md Section 3. The compliance gap is at authoring time, not in the rule text. Logging in code-reviewer memory as a watch pattern for the next toggle/conditional Server Action.

2. **[REPEAT — 2nd occurrence] UPDATE/DELETE returning zero rows treated as success (count 1 → 2)**
   - First occurrence: draft UPDATE (6d274fa, 2026-03-13) — wrong ownership, 0 rows updated, success returned.
   - Second occurrence: deleteComment DELETE (6520962) — wrong commentId or cross-user, 0 rows deleted, `{ success: true }` returned.
   - Both share the same root cause: the caller does not verify that the mutation affected at least one row.
   - Count in frequency table: 1 → 2. Status: RULE CANDIDATE.
   - Threshold met. Proposed addition to code-style.md Section 5 (TypeScript Rules / Supabase patterns): for any ownership-scoped DELETE or UPDATE, chain `.select('id')` (or equivalent) and check that at least one row was returned before returning success. This sub-case is not currently covered by the existing "Destructure Supabase Mutation Results" rule, which only covers missing `{ error }` destructuring.
   - Proposed change: `code-style.md` — add a sub-note under the Supabase mutation section: "For ownership-scoped DELETE and UPDATE calls, verify that at least one row was affected (chain `.select('id')` and check the returned array length) before returning success. A zero-row result is a silent no-op, not an error — it will not surface via `{ error }` destructuring."

3. **[NEW] Read-then-write race on state-change UPDATE (count 1)**
   - toggleFlag performed a SELECT to read current flag state, then issued UPDATE or UPSERT based on the result. Concurrent calls could both observe the "flagged" state and both issue the unflag UPDATE, leaving the flag in the wrong final state.
   - Distinct from "TOCTOU race on count-gated INSERT" (that is an INSERT guard — this is a conditional UPDATE on a mutable state column).
   - Fix pattern: include the expected current column value in the WHERE predicate (`.is('deleted_at', null)` for soft-deleted state) to make the UPDATE conditional and atomic without a separate SELECT.
   - Count: 1. Status: log and watch. No rule change on first occurrence.

**Patterns checked from frequency table (no count change):**

- "Supabase mutation result not destructured (error silently dropped)" (count 3, RULE EXISTS): both comments.ts and flag.ts correctly destructure `{ error }` throughout. No new violation. Rule holding.
- "Hook file exceeding 80-line limit" (count 4, RULE EXISTS): not applicable to this commit. No new hooks added.
- "New hook file extracted without shipping tests in the same commit" (count 5, RULE EXISTS): no new hook files. No violation.

**Recommended changes:**

- [ ] `code-style.md` Section 5 — add sub-note under the Supabase mutation destructuring rule: "For ownership-scoped DELETE and UPDATE calls, verify at least one row was affected by chaining `.select('id')` and checking the returned array length. A zero-row result returns no error — it must be checked explicitly."

**Actions taken:**
- Frequency table: "UPDATE returning zero rows treated as success" count updated 1 → 2. Status: RULE CANDIDATE.
- Frequency table: "Function exceeding 30-line limit in Server Action file" added as new row, count 2. Status: RULE CANDIDATE.
- Frequency table: "Read-then-write race on state-change UPDATE" added as new row, count 1. Status: watching.
- code-reviewer/patterns.md: "Function > 30 lines in Server Actions" count updated 1 → 2.

**False positives:** none.

**Positive signals:**
- Semantic reviewer caught both ISSUEs in a single pass on the first post-commit review — no multi-round security fix cycle needed.
- test-writer produced 56 tests covering both new Server Action files in full. No test gaps reported.
- Fix commit b71eb18 addressed all 3 findings (1 BLOCKING + 2 ISSUEs) in a single commit. No deferred work.
- deleteComment and toggleFlag hardening both follow established Supabase patterns from the project (`.select()` + row-count check; atomic predicate on UPDATE). No novel patterns introduced.

---
### 2026-03-21 — feat(reports): redesign with session table, mode badge, color-coded scores (commits b104ae4, 9258769, ca55c3c)

**Context:** Reports page redesign (issue #179). b104ae4 was the feature commit introducing a session history table, mode badge, and color-coded score utilities (`score-color.ts`, `reports-utils.ts`). Post-commit agents found 2 warnings (missing utility tests) and 1 ISSUE (misleading test name). 9258769 was a first fix attempt; ca55c3c was the final fix commit resolving all findings and adding 13 tests.

**Code reviewer:** 0 BLOCKING, 2 WARNINGS.
1. `score-color.ts` — new utility file shipped without a co-located test.
2. `reports-utils.ts` — new utility file shipped without a co-located test.
Both fixed in ca55c3c.

**Doc updater:** `docs/plan.md` updated with reports redesign progress. Clean.

**Test writer:** `score-color.test.ts` (6 tests) and `reports-utils.test.ts` (7 tests) written and passing. No further gaps after ca55c3c.

**Semantic reviewer:** 0 CRITICAL, 1 ISSUE, 4 SUGGESTIONs.
1. **Misleading test name — ISSUE, real, fixed in ca55c3c.** A test described the wrong behavior — the name said one thing but the assertion checked a different condition. Test names are the first line of documentation; a misleading name is worse than no test because it actively misdirects. Fixed by aligning the test name to match the actual assertion.
2. **a11y: multiple `<a>` tags per table row (same destination) — SUGGESTION, fixed in ca55c3c.** Each report row rendered two separate links (session name + detail icon) pointing to the same URL. Screen readers and keyboard users hit the same destination twice, which is noisy and confusing. Fixed by consolidating to a single link per row with appropriate `aria-label` context.
3. **3 further SUGGESTIONs** — deferred (tests written for a11y fix; other suggestions were minor).

**Pattern analysis:**

1. **[REPEAT — 6th occurrence] New utility file shipped without a co-located test (count 5 → 6)**
   - Prior occurrences tracked under frequency table rows 17 and 58. This cycle: `score-color.ts` and `reports-utils.ts` both shipped in b104ae4 without tests.
   - The code-reviewer flagged both as WARNINGs (not BLOCKING under current rules), and the test-writer filled the gap in the fix commit.
   - The rule has been in `code-style.md` Section 7 since the 2nd occurrence. The compliance gap persists at authoring time — new utility files routinely ship without tests and are caught post-commit.
   - Note: the code-reviewer treats missing utility tests as WARNING (non-blocking), which means there is no hard gate preventing the commit from landing without tests. The gap is caught post-commit only. This is by design — test-writer is the designated gap-filler. No rule change warranted; compliance gap is structural.
   - Count updated: frequency table row 58 → 6.

2. **[NEW] Misleading test name — test name contradicts actual assertion (count 1)**
   - A test name claimed to test one behavior but the assertion body tested a different condition. This is a first-class documentation failure: a test that passes gives false confidence if the name does not accurately describe what it asserts.
   - Distinct from "test describes implementation instead of behavior" (code-style.md Section 7 rule on naming conventions). This is specifically a contradiction between name and assertion, not just a style preference.
   - Caught by semantic-reviewer as an ISSUE-level finding — correctly severity-calibrated (a misleading passing test is an active gap, not just a style concern).
   - First occurrence — log and watch. If a second occurrence surfaces across a different commit, add a note to the test-writer patterns memory: after generating each test, verify the test name accurately describes the assertion's postcondition, not an adjacent behavior.

3. **[NEW] Multiple anchor links per table row pointing to same destination (count 1)**
   - A session history table row rendered two `<a>` tags (session name text + an icon button) both linking to the same detail URL. Redundant same-destination links in a repeated row pattern cause screen reader and keyboard-navigation noise.
   - The fix is to use a single link with an `aria-label` that provides full context, or wrap the entire row in a single link.
   - First occurrence — log and watch. If a second component renders duplicate same-destination links in a repeated row, add a note to code-style.md Section 2 (Component Rules / accessibility): "In repeated row patterns (tables, lists), use a single `<a>` per row per destination. Do not render parallel links to the same URL — consolidate with `aria-label` for screen reader context."

**Patterns checked from frequency table (no count change):**

- **"New hook/utility file shipped without a test file" (count 6, RULE EXISTS):** Count updated 5 → 6 (row 58 updated above). No new rule change — rule already in code-style.md Section 7. Compliance gap at authoring time is the ongoing issue.
- **"ARIA tab role missing on button-based tab UI" (row 63, count 1, Watch):** The a11y multi-link finding is a different pattern (duplicate destination in repeated rows, not tab role semantics). No count change to row 63.
- **"Silent error drop on non-critical secondary query" (count 1, Watch):** Not triggered this cycle. No update.

**Recommended changes:** None. Both new patterns are first occurrences; rule change requires 2+ occurrences across different commits.

**Actions taken:**
- Frequency table row 58 updated: count 5 → 6, date updated to 2026-03-21, description expanded to include b104ae4 + ca55c3c as the 6th occurrence.
- Frequency table: "Misleading test name (name contradicts actual assertion)" added as new watch row, count 1, 2026-03-21.
- Frequency table: "Multiple anchor tags per table row pointing to same destination" added as new watch row, count 1, 2026-03-21.

**False positives:** none detected.

**Positive signals:**
- Code reviewer produced 0 BLOCKING on the reports redesign feature commit. Both warnings were non-blocking and caught in the same post-commit cycle, fixed before push.
- Semantic reviewer's 1 ISSUE (misleading test name) was real and correctly severity-calibrated — a contradictory test name is an active gap. Fixed in the same session.
- The a11y multi-link fix improved keyboard navigation quality without any layout changes — minimal, targeted improvement.
- 13 new tests (6 + 7) written for the two new utilities in the fix commit. All passing. Test-writer gap-filling is functioning as designed.
- All agents clean on ca55c3c — fix commit resolved all findings on the first pass.

---

### 2026-03-27 — GDPR consent gate (commits 75ffa51, b92ff08, 5fce448)

**Context:** Three-commit sequence for GDPR consent gate feature. 75ffa51 introduced the `user_consents` table (migration), `consent-form.tsx` component, `record-consent` Server Action, and consent seeding across E2E helpers. b92ff08 was the fix commit addressing all post-commit agent findings. 5fce448 was a doc-only commit updating database.md, decisions.md, plan.md, and security.md.

**Commit hash (HEAD at learner run):** 5fce448

**Code reviewer (75ffa51):** 1 BLOCKING.
- `consent-form.tsx`: nesting depth at 5 levels, limit 3. Root cause: the consent-form repeated a checkbox+label+description JSX pattern three times; each repetition added nesting, compounding to 5 levels. Fixed in b92ff08 by extracting `ConsentCheckbox` sub-component. Clean after fix.

**Semantic reviewer (75ffa51):** 1 CRITICAL, 1 ISSUE (noted for follow-up), 3 SUGGESTION.
1. **ensureAdminTestUser() not updated with consent seeding — CRITICAL, real, fixed in b92ff08.** The consent seeding logic was added to `supabase.ts` helpers (ensureTestUser, ensureLoginTestUser) but the third provisioning helper `ensureAdminTestUser()` in `admin-supabase.ts` was missed. Any E2E spec using the admin helper would test against a user missing required consent records, producing false consent-gate bypasses in the test suite. Fixed in b92ff08 by adding consent seeding to ensureAdminTestUser.
2. **Partial failure + retry creates duplicate consent rows (no idempotency) — ISSUE, noted for follow-up migration.** If a consent insert partially succeeds and the user retries the consent gate form, a second insert will create a duplicate row (no UNIQUE constraint on (user_id, consent_type)). The fix requires a migration adding a unique constraint + ON CONFLICT DO NOTHING. Noted as a GitHub Issue for a follow-up migration; not fixed in this cycle.
3. **proxy.test.ts hardcoded cookie name/value — ISSUE, fixed in b92ff08.** The proxy test hardcoded the consent cookie name and value as string literals instead of importing the constants from the production module. A rename or value change would allow the test to pass while missing the real regression. Fixed by importing the constants.
4. **3 SUGGESTION items:** cookie maxAge mismatch (alignment suggestion), test 5 implicit dependency (ordering risk), hard DELETE in cleanup without comment (exception not documented). Suggestions deferred or accepted.

**Doc updater (5fce448):** Updated database.md (user_consents table schema, RLS policies), decisions.md (consent gate architecture decision), plan.md (issue status), security.md (consent gate rules). All 4 docs updated in a single commit.

**Test writer:** Created `actions.test.ts` (14 tests covering Server Action happy path and error branches) and `consent-form.test.tsx` (12 tests covering component rendering, checkbox state, and form submission). All 26 tests passing.

**Pattern analysis:**

1. **[REPEAT — 3rd occurrence] Partial fix applied to sibling file group (cross-cutting concern)**

   Prior occurrences:
   - First (2190dd5): auth error destructuring added to 2 of 8 query files.
   - Second (83ae098): PR4 getUser hardening missed quiz/session/page.tsx and discard.ts.
   - Third (this cycle): consent seeding added to ensureTestUser and ensureLoginTestUser in supabase.ts but not to ensureAdminTestUser in admin-supabase.ts.

   This is the third occurrence across three different commits and two different feature areas (security hardening, test fixture seeding). Count now 3. The pattern has a consistent root cause: the author's mental model of "which files to update" is scoped to the file or directory already being edited, not to the full set of files sharing the same semantic contract (all user-provisioning helpers). The third occurrence is sufficient to warrant a concrete recommendation — not a rule change (single occurrence rule applies to rule *changes*, not to crystallising a RULE CANDIDATE already at count 2 into a named recommendation). Action: log the proposed convention in code-style.md agent memory or CLAUDE.md as a workflow note: "When updating any function that provisions a user, fixture, or test record, grep for all sibling functions sharing that semantic purpose and update them all in the same commit."

   The frequency table row "Partial fix applied to sibling file group" is updated from count 2 to count 3.

2. **[NEW] Hardcoded cookie/constant values in tests instead of importing source constants (count 1)**

   proxy.test.ts used string literals for the consent cookie name and value that are defined as exported constants in the production module. When the constant changes, the test continues passing on its stale mock rather than catching the regression. First occurrence — log and watch. Rule change requires 2+ occurrences across different commits.

3. **[NEW] Deep JSX nesting from repeated pattern — 3x repetition producing 5-level nest (count 1)**

   consent-form.tsx repeated a checkbox+label+description pattern three times without extraction. The repetition itself compounded nesting depth to 5 levels (limit 3), triggering a BLOCKING code-reviewer finding. The existing "extract at 3 repetitions" rule (code-style.md Section 2) is the correct gate and would have prevented this if followed at authoring time. First occurrence of this specific mechanism (repetition as nesting-depth amplifier) as a named pattern — log and watch. No additional rule needed; the existing extraction rule covers it.

**Actions taken:**
- Frequency table: "Partial fix applied to sibling file group" count updated from 2 to 3, date updated to 2026-03-27, status note extended with third occurrence description.
- Frequency table: "Hardcoded cookie/constant values in tests instead of importing source constants" added as new watch row, count 1, 2026-03-27.
- Frequency table: "Deep JSX nesting from repeated pattern (3x repetition causing 5-level nest)" added as new watch row, count 1, 2026-03-27.

**Recommended changes:**

- [ ] `CLAUDE.md` or agent workflow note — add a convention: "When updating any function that provisions a user, fixture, or test record, grep for ALL functions sharing the same semantic purpose (e.g., all ensureXxxTestUser variants) and update them all in the same commit." This is the actionable form of the "Partial fix applied to sibling file group" RULE CANDIDATE at count 3. This is a workflow note, not a code-style rule change, so it is appropriate without requiring a fourth occurrence. The orchestrator must decide whether to add it to CLAUDE.md or leave it as a named convention in agent memory.

**No code-style.md or security.md changes applied this cycle.** Both new patterns are first occurrences. The sibling-group pattern is at count 3 but the appropriate response is a workflow note, not a mechanical style rule.

**False positives:** None detected. The 3 SUGGESTION items from semantic-reviewer were correctly characterised — the maxAge mismatch and test ordering suggestions are valid quality improvements; the hard DELETE cleanup comment is an exception already documented in the patterns file (row 68). None warrants a false-positive classification.

**Positive signals:**
- Both test files (actions.test.ts + consent-form.test.tsx) shipped in the same cycle with 26 passing tests — test-writer produced complete coverage without a second fix cycle.
- Doc updater captured all 4 documents that needed updating (database.md, decisions.md, plan.md, security.md) in a single doc commit — no documentation drift.
- The fix commit b92ff08 addressed both the CRITICAL and the ISSUE (hardcoded constants) in a single pass — no residual findings after the fix cycle.
- The BLOCKING code-reviewer finding (nesting depth) was resolved cleanly by the extraction of ConsentCheckbox — the sub-component is reusable and named accurately.
- The idempotency ISSUE (duplicate consent rows on retry) was correctly deferred to a follow-up migration rather than attempting an in-cycle schema change — scope discipline maintained.

---

### 2026-03-27 — CodeRabbit PR #385 fix cycle (commits 227c976, 27c15b7, a6b9775)

**Context:** Three-commit sequence following CodeRabbit review of the GDPR consent gate PR (#385). 227c976 addressed 5 CodeRabbit findings (cookie maxAge 86400 → 31536000, a11y label element for ConsentCheckbox, E2E version constant imports in supabase.ts, docs). 27c15b7 added the missing CURRENT_ANALYTICS_VERSION constant (the semantic-reviewer ISSUE from 227c976) plus 2 tests for the maxAge and analytics version assertion. a6b9775 committed agent memory updates and the analytics version test.

**Commit hash (HEAD at learner run):** a6b9775

**Code reviewer (all 3 commits):** 0 BLOCKING, 0 WARNING. Clean across the full cycle.

**Semantic reviewer (227c976):** 0 CRITICAL, 1 ISSUE, 2 SUGGESTION.
1. **Hardcoded 'v1.0' string literal for analytics version in actions.ts — ISSUE, real, fixed in 27c15b7.** `recordConsent` passed a hardcoded `'v1.0'` string to the `record_consent` RPC for `p_document_version` instead of importing `CURRENT_ANALYTICS_VERSION` from `lib/consent/versions.ts`. The TOS and privacy versions were correctly using their constants; the analytics version was the only one left as a literal. When `CURRENT_ANALYTICS_VERSION` is bumped, the RPC call would silently record the wrong version. Fixed by adding `CURRENT_ANALYTICS_VERSION` to `versions.ts` and importing it in `actions.ts`.
2. **SUGGESTION 1 (carry-forward):** Record analytics refusal as a separate consent row with `accepted: false` — advisory improvement for audit completeness; deferred.
3. **SUGGESTION 2 (carry-forward):** Version-aware E2E seeding in `admin-supabase.ts` — advisory improvement; deferred.

**Semantic reviewer (27c15b7):** clean. 2 carry-forward suggestions only (same as above).

**Doc updater (27c15b7):** updated `docs/plan.md` with analytics constant addition. Clean.

**Test writer (227c976):** wrote 13 new tests — 11 for `ConsentCheckbox` component (label association, link rendering, required indicator, description, checkbox interaction, link placement inside label) and 2 for `maxAge` assertion in route.test.ts and actions.test.ts. All passing.

**Test writer (27c15b7):** 1 additional test — analytics version constant assertion in actions.test.ts. Passing.

**Pattern analysis:**

1. **[REPEAT — 2nd occurrence] Hardcoded string literal for value defined as exported constant in production code**

   Prior occurrence: proxy.test.ts (2026-03-27 consent gate cycle) used hardcoded cookie name and value strings instead of importing from the production module.

   This cycle: `actions.ts` used a hardcoded `'v1.0'` string for `p_document_version` on the analytics consent RPC call, even though `CURRENT_TOS_VERSION` and `CURRENT_PRIVACY_VERSION` were correctly imported for the other two consent types. The same cycle also saw `supabase.ts` (E2E helper) corrected to import `CURRENT_TOS_VERSION` and `CURRENT_PRIVACY_VERSION` instead of the prior hardcoded `'v1.0'` strings — another instance of the same root cause.

   Root cause: when a module exports a named constant representing a version, identifier, or key, authors sometimes duplicate the literal value in call sites (both production code and tests) rather than importing the constant. The duplication is invisible to the type-checker (both are valid strings) and to lint rules, but creates a maintenance gap: a version bump updates the constant in one place but all literal duplicates stay stale.

   This is now at count 2 across different commits. Threshold for a recommendation is met.

   Recommended action: add a note to test-writer patterns memory — "When writing tests or E2E helpers for functions that use exported constants (version strings, cookie names, error codes), import the constant from the production module. Do not duplicate the literal value. Duplicated literals pass type-check but silently test stale data after a rename or value bump."

   The same principle applies to production code (actions.ts case), but that is harder to enforce mechanically. No code-style.md rule change proposed — the pattern cannot be caught by Biome or the code-reviewer agent. The semantic-reviewer is the appropriate gate.

   Frequency table row updated: count 1 → 2. Status: RULE CANDIDATE.

2. **[PATTERN CONFIRMED] Test-writer fills coverage gaps introduced by fix commits (positive signal)**

   The ConsentCheckbox component was extracted in the prior fix commit (b92ff08) as a new sub-component. It shipped without its own test file — the test-writer correctly identified this in the 227c976 cycle and produced `consent-checkbox.test.tsx` (11 tests). The 2-test suite for `maxAge` was also written by test-writer in this cycle, not at authoring time.

   This matches the established pattern: new sub-components extracted to fix code-reviewer findings often ship without tests (they were created as structural fixes, not new features), and the test-writer catches them on the next cycle.

   No new frequency table entry needed — this is consistent with the established "New hook/utility file extracted without shipping tests" pattern (count 6, row 58). The gap is structural and accepted: code-reviewer is non-blocking on test coverage warnings; test-writer fills the gap post-commit.

**Patterns checked from frequency table (no count change):**

- "Hardcoded cookie/constant values in tests instead of importing source constants" (count 1 → 2, updated above): RULE CANDIDATE confirmed.
- "New hook/utility file extracted without shipping tests in the same commit" (count 6, RULE EXISTS): ConsentCheckbox is a new count but consistent with existing tracking. No update to frequency table row (this was a sub-component, not a utility/hook file — borderline, but the test-writer gap-fill confirms the pattern applies).
- "ZodError escaping Server Action with typed error return type" (count 2, RULE CANDIDATE): not triggered this cycle. No update.
- "Partial fix applied to sibling file group" (count 3, RULE CANDIDATE): not triggered this cycle. The E2E helper fix (supabase.ts adding CURRENT_TOS_VERSION imports) was complete — no sibling was missed. No update.

**Recommended changes:**

- [ ] `.claude/agent-memory/test-writer/patterns.md` — add note: "Import production constants (version strings, cookie names, error codes) rather than duplicating literal values. Duplicated literals are invisible to type-check but silently test stale data after a rename or value bump."

**Actions taken:**
- Frequency table: "Hardcoded cookie/constant values in tests instead of importing source constants" count updated 1 → 2, status changed Watch → RULE CANDIDATE, description extended with second occurrence details.
- No changes to `code-style.md`, `security.md`, or `biome.json` — the pattern is not catchable by Biome or a code-reviewer agent. The semantic-reviewer is the correct gate.
- The recommended change to test-writer patterns memory is proposed above; orchestrator decides whether to apply it.

**False positives:** none detected. The 2 carry-forward suggestions (record analytics refusal, version-aware admin seeding) are valid quality improvements but correctly deferred — the system is functional and the suggestions are advisory.

**Positive signals:**
- Code reviewer: 0 BLOCKING, 0 WARNING across all 3 commits in this cycle. The ConsentCheckbox extraction from the prior cycle resolved the nesting depth BLOCKING; no structural regressions introduced.
- Semantic reviewer clean on 27c15b7 after a single-commit fix for the analytics version ISSUE. Fix cycle closed in one pass.
- Test-writer produced 14 tests (13 + 1) across two cycles with no test failures and no second iteration needed. Behavior-focused test names throughout (label association, link rendering, required indicator — not "renders checkbox" or "calls handler").
- The a11y fix (span → label with htmlFor) was the correct repair for the ConsentCheckbox label association gap flagged by CodeRabbit. The `onClick stopPropagation` on the inner link prevents the label click from triggering both the checkbox and the link — a subtle interaction detail handled correctly.
- All 3 commits have clean Lefthook pre-commit gates (biome + type-check + unit tests). No hook failures in this cycle.

---

### 2026-03-27 — Legal pages + analytics removal + footer links (commits 44e305f, d0e5aed)

**Context:** Two-commit sequence. 44e305f removed the `cookie_analytics` consent type entirely via migration 058 (hard DELETE of existing rows, updated CHECK constraint, CREATE OR REPLACE on `record_consent()` RPC), added `/legal/terms` and `/legal/privacy` pages, added Terms/Privacy footer links to login and forgot-password forms, and removed the analytics checkbox from the consent form. d0e5aed was the fix commit: added the missing GRANT EXECUTE after CREATE OR REPLACE in migration 058, added a clarifying comment on the hard DELETE, added 4 tests for footer links, and fixed a useTransition race in the consent-form retry test.

**Commit hash (HEAD at learner run):** d0e5aed

**Code reviewer (44e305f):** 0 BLOCKING, 0 WARNING. Clean.

**Semantic reviewer (44e305f):** 0 CRITICAL, 1 ISSUE, 2 SUGGESTION.
1. **GRANT EXECUTE missing after CREATE OR REPLACE on record_consent() — ISSUE, real, fixed in d0e5aed.** Migration 058 used `CREATE OR REPLACE FUNCTION record_consent(...)` to update the RPC signature (removing the analytics consent type), but did not re-state the `GRANT EXECUTE ON FUNCTION record_consent TO authenticated` that the original creation migration included. In Postgres, `CREATE OR REPLACE` can revoke execute rights when the function's ownership or security context changes. Any authenticated user calling `record_consent()` after migration 058 would receive a permission-denied error. Fixed in d0e5aed by appending `GRANT EXECUTE ON FUNCTION record_consent(uuid, text, text, text) TO authenticated` after the CREATE OR REPLACE statement.
2. **SUGGESTION 1 — clarifying comment on hard DELETE in migration.** Migration 058 contained a hard DELETE (`DELETE FROM user_consents WHERE consent_type = 'cookie_analytics'`). The hard DELETE exception for one-time schema corrections is documented in the patterns file (row 68) but no inline comment explained the exception in the migration file itself. Comment added in d0e5aed.
3. **SUGGESTION 2 (carry-forward — 4th occurrence) — ensureConsentRecords version-filtering gap.** `apps/web/e2e/helpers/supabase.ts` — `ensureConsentRecords` checks for the existence of consent rows without filtering by `document_version`. After a version bump, the helper will skip re-seeding because old-version rows are present, leaving test users with stale consent records that fail the gate. This suggestion has been raised in 4 consecutive semantic-reviewer cycles (227c976, b35a7c1, 44e305f, now formally tracked). Not fixed in this cycle — deferred to a GitHub issue.

**Doc updater (d0e5aed):** Updated `docs/database.md` (analytics consent type removed from schema description) and `docs/decisions.md` (decision note on analytics cookie removal). Clean.

**Test writer (d0e5aed):** Added 4 footer link tests (login-form: 2 tests asserting Terms and Privacy links render with correct href; forgot-password-form: 2 equivalent tests). Fixed a test race in `consent-form.test.tsx` — the retry path used `getByRole` synchronously on a button that reappears after a state transition; fixed to `findByRole` (async). All tests passing.

**Pattern analysis:**

1. **[NEW] GRANT EXECUTE missing after CREATE OR REPLACE on SECURITY DEFINER RPC (count 1)**

   Migration 058 updated the `record_consent()` SECURITY DEFINER function via `CREATE OR REPLACE` but did not include a corresponding `GRANT EXECUTE`. The original migration that created the function did include the grant. When the function is replaced, Postgres re-evaluates ownership and may drop or not inherit execute grants from the replaced version.

   This is a first occurrence as a named pattern. Distinct from "SECURITY DEFINER RPC missing auth.uid() check" (that is about the RPC body — this is about the migration DDL sequence). The failure mode is silent at migration apply time and only surfaces at runtime when an authenticated user calls the function.

   Root cause: authors include `GRANT EXECUTE` in initial-creation migrations because it is obviously required, but omit it from update migrations (CREATE OR REPLACE) where it is equally required. The omission is invisible to type-check, Biome, and the pre-commit hook.

   No rule change proposed at count 1. Log and watch. If a second migration ships CREATE OR REPLACE on a SECURITY DEFINER function without `GRANT EXECUTE`, add a rule note to `security.md`: "Every CREATE OR REPLACE on a SECURITY DEFINER function must be followed by `GRANT EXECUTE ON FUNCTION ... TO authenticated` in the same migration file."

2. **[WATCH — carry-forward escalation] ensureConsentRecords version-filtering gap (count 1 in learner table — 4th semantic-reviewer suggestion cycle)**

   The semantic-reviewer has flagged the `ensureConsentRecords` version-filtering gap as a SUGGESTION in 4 consecutive commit cycles (first flagged in 227c976 cycle). The function does not filter by `document_version` when checking whether consent rows exist, which means a version bump will cause it to silently skip re-seeding. This is a deferred suggestion (not a blocking issue), but 4 consecutive cycles without resolution indicates it has become a persistent low-grade risk.

   This is the first time this pattern is being entered into the learner frequency table. The semantic-reviewer has been tracking it in its own memory. The correct resolution is a GitHub issue that tracks the fix rather than continuing to carry it forward in reviewer memory.

   No rule change proposed — this is a specific code gap, not a pattern requiring a rule. Action: create a GitHub issue.

**Actions taken:**
- Frequency table: "GRANT EXECUTE missing after CREATE OR REPLACE on SECURITY DEFINER RPC in migration" added as new watch row, count 1, 2026-03-27. First occurrence — no rule change.
- Frequency table: "E2E seed helper missing version filter (stale consent rows survive version bump)" added as new watch row, count 1, 2026-03-27. Carry-forward from 4 semantic-reviewer suggestion cycles — first entry into learner table.

**No changes to `code-style.md`, `security.md`, or `biome.json` this cycle.** Both new patterns are first occurrences in the learner table. Rule changes require 2+ occurrences across different commits (GRANT EXECUTE gap) or are not mechanically enforceable (ensureConsentRecords gap).

**Recommended changes:**

- [ ] Create a GitHub issue for the `ensureConsentRecords` version-filtering gap. The fix is straightforward: add `AND document_version = CURRENT_VERSION` to the EXISTS check in the helper. This has been deferred for 4 cycles and should be tracked formally.

**False positives:** None detected. The GRANT EXECUTE ISSUE was real (silent runtime permission denial). The two SUGGESTION items were correctly categorised — the GRANT EXECUTE comment is a genuine improvement; the ensureConsentRecords gap is a genuine risk deferred by scope discipline.

**Positive signals:**
- Code reviewer: 0 BLOCKING, 0 WARNING on the feature commit (44e305f). A commit removing a consent type, adding two new pages, adding footer links, and updating the RPC produced zero style violations.
- Semantic reviewer ISSUE (GRANT EXECUTE) was real, caught in the first post-commit cycle, and fixed in a single commit. The fix gate worked as designed.
- Test writer added 4 meaningful behavioral tests (footer link rendering and hrefs) and fixed a pre-existing race in the retry test. No test failures on d0e5aed.
- Doc updater correctly updated database.md and decisions.md to reflect the analytics consent type removal — no documentation drift from a schema change.
- Fix commit d0e5aed was minimal and targeted: GRANT EXECUTE addition, comment, 4 tests, 1 test race fix. Clean separation of concerns.

---

### 2026-03-27 — GDPR PR 3: data export + legal docs (commits 7eeff14, 0bad818)

**Context:** Two-commit sequence for GDPR PR 3 of 3 (#182 PR 3/3). 7eeff14 introduced `collect-user-data.ts` (a server-side data export utility aggregating profile, quiz sessions, consents, and audit events), a data retention doc (`docs/gdpr-data-retention.md`), and updated `docs/decisions.md`. 0bad818 was the fix commit: added a `SELECT` RLS policy on `audit_events` for the student role (`auth.uid()`-scoped to actor_id), and added 5 test files (43 tests) for `collect-user-data.ts`.

**Code reviewer (7eeff14):** 1 BLOCKING.
- `collect-user-data.ts` shipped without a co-located test file. Caught post-commit. Fixed by test-writer, committed in 0bad818.

**Doc updater:** No changes needed. Clean — decisions.md and the new retention doc were committed as part of 7eeff14, so nothing was out of date at review time.

**Test writer:** 5 test files, 43 tests. Coverage across profile fetch, session aggregation, consent records, audit events, and the top-level `collectUserData` orchestrator. All passing before commit.

**Semantic reviewer (7eeff14):** 0 CRITICAL, 2 ISSUE, 3 SUGGESTION.

1. **audit_events SELECT RLS policy missing for student role — ISSUE, real, fixed in 0bad818.** `collect-user-data.ts` fetched audit events using the authenticated (RLS-scoped) Supabase client. The `audit_events` table has no SELECT policy for the `authenticated` role — it was designed as append-only and admin-read-only. The query returned empty data silently (Supabase returns 200 OK with an empty array when RLS blocks a SELECT; there is no error to destructure). Fixed in 0bad818 by adding a SELECT policy: `USING (actor_id = auth.uid())` — students can read their own events. Root cause: the feature path was designed with dual clients in mind (admin client for some tables, RLS client for the student-facing read), but the RLS policies were not audited per-table for the student client path.

2. **quiz_sessions deleted_at filter flagged as dead code — FALSE POSITIVE ISSUE.** Reviewer claimed `quiz_sessions` has no `deleted_at` column and that the `.is('deleted_at', null)` filter was dead/incorrect code. The column was added in migration 023 and is present in the schema. The reviewer's scan missed the earlier migration file. Validated by checking migration 023 before acting. No code change made. Confirmed false positive.

3. **3 SUGGESTION items:** Error logging on the profile fetch error path, filename sanitization in the export download header (client-side), and inline documentation for the admin client vs. RLS client split. The logging and documentation suggestions were accepted and addressed in 0bad818. The filename sanitization note was logged — it applies to client-side code outside this utility's scope.

**Pattern analysis:**

1. **[RECURRING — count 7] New utility file shipped without co-located test (collect-user-data.ts):** This is the seventh recurrence of this exact pattern. Code-reviewer BLOCKING catch + test-writer fix is the reliable gate. Rule exists (code-style.md Section 7). No rule change — the gate functions correctly. Authoring habit gap remains.

2. **[NEW — count 1] RLS SELECT policy missing for student role on table accessed via RLS-scoped client in multi-client feature:** `collect-user-data.ts` mixed adminClient (for some tables) and the anon/authenticated client (for audit_events). The student client path assumed audit_events had a student SELECT policy — it did not. The root cause is that when a feature path splits between admin and RLS clients, the RLS policy surface for the student client path is not systematically audited per-table. Distinct from "Query missing student_id scope" (missing WHERE clause, not a missing policy), and from "GRANT EXECUTE missing on RPC" (function permission). The silent 200 OK from Supabase on a policy-blocked SELECT makes this particularly hard to detect without an explicit test that asserts non-empty results. First occurrence — log and watch. If a second feature ships with a missing student SELECT policy on a table it reads via the RLS client, add a note to `security.md`: "When a feature reads any table using the RLS-scoped client (not adminClient), verify that a SELECT policy exists for the `authenticated` role on that table."

3. **[FALSE POSITIVE — count 1] Semantic reviewer wrong schema assumption (quiz_sessions deleted_at):** Reviewer claimed a column did not exist; it does (migration 023). The reviewer's migration scan was incomplete. Mitigation: before acting on any reviewer finding that claims a column or table does not exist, check the migration files directly. False positive logged — not counted as a pattern recurrence. First occurrence of this specific false positive type.

**Actions taken:**
- Frequency table row 58: count updated from 6 to 7, last-seen updated to 2026-03-27.
- Frequency table: "RLS SELECT policy missing for student role on table accessed via RLS-scoped client in multi-client feature" added as new watch row, count 1, 2026-03-27. First occurrence — no rule change.
- Frequency table: "Semantic reviewer false positive due to wrong schema assumption (column existence)" added as new watch row, count 1, 2026-03-27. First occurrence — no rule change.

**No changes to `code-style.md`, `security.md`, or `biome.json` this cycle.** The utility-without-test pattern is a recurring compliance gap, not a rule gap. Both other patterns are first occurrences. Rule changes require 2+ occurrences across different commits.

**Recommended changes:** None this cycle. No pattern meets the 2+ occurrence threshold for a new rule.

**False positives:** 1 confirmed — semantic reviewer ISSUE on quiz_sessions deleted_at column. Dismissed after verifying migration 023. No code change made.

**Positive signals:**
- The RLS gap was caught by semantic-reviewer before push and fixed in the same session. Gate functioned as designed.
- Test writer produced 43 tests in 5 files in a single fix commit — comprehensive coverage of all data-aggregation paths.
- The false positive was correctly dismissed by the orchestrator after validating against the migration files. Validate-before-fixing protocol held.
- Fix commit 0bad818 addressed all findings cleanly: BLOCKING (test file added), real ISSUE (RLS policy added), accepted suggestions (error logging, doc comment). No deferred work.

---

### 2026-03-29 — Dashboard heatmap → Daily Progress strip, CodeRabbit fixes (commits e38ef8c, ca09f34)

**Context:** Two-commit sequence on PR #412 (feat(dashboard): replace calendar heatmap with Daily Progress strip, commit 4f46f32). e38ef8c addressed 7 CodeRabbit review findings: extracted HeatmapHeader component (activity-heatmap.tsx 161→95 lines), fixed scroll-reset offset dependency, fixed onWheel vertical-scroll trap, added pointercancel handler, fixed currentStreak "1 days" → "1 day", fixed scrollIntoView mock leak in tests, scoped activity test assertions to target day cell. ca09f34 fixed bestStreak "1 days" (missed in e38ef8c) and added 20 tests across 3 new test files.

**Commit hashes:** e38ef8c, ca09f34

**Code reviewer (e38ef8c):** 0 BLOCKING, 1 WARNING.
- WARNING: `use-drag-scroll.ts` non-null assertion (`containerRef.current!`) missing a justifying comment. First occurrence. Watch.

**Semantic reviewer (e38ef8c):** 1 ISSUE, 1 SUGGESTION.
1. **bestStreak "1 days" not fixed alongside currentStreak — ISSUE, real, fixed in ca09f34.** e38ef8c fixed `currentStreak === 1 ? 'day' : 'days'` in stat-cards.tsx but left the adjacent `bestStreak` conditional using the same pattern with "days" hardcoded (no ternary). Both were in the same component at adjacent lines. Fixed in ca09f34 by adding the same singular/plural ternary for bestStreak.
2. **Fragile DOM traversal in test — SUGGESTION.** activity-heatmap.test.tsx used `container.querySelector` with a CSS class selector to find a specific cell; brittle against className refactors. Suggestion to use `getByRole` or `data-testid` for test resilience. Not fixed in this cycle — deferred.

**Doc updater:** No changes needed. Clean.

**Test writer (e38ef8c):** 3 gaps found.
1. `use-drag-scroll.ts` — new hook shipped without a co-located test file (BLOCKING per code-style.md Section 7).
2. `heatmap-header.tsx` — extracted component shipped without tests.
3. `stat-cards.tsx` — singular/plural logic for `currentStreak` and `bestStreak` lacked dedicated branch tests.

All 3 gaps addressed in ca09f34: 10 tests in use-drag-scroll.test.ts, 8 tests in heatmap-header.test.tsx, 2 tests in stat-cards.test.tsx.

**jsdom fix required in ca09f34:** test-writer's initial use-drag-scroll.test.ts hit two jsdom API gaps:
- `setPointerCapture` not implemented — fixed by including `pointerId: 1` in PointerEvent init dict.
- `pageX` not mapped from PointerEventInit in jsdom — fixed by using `Object.defineProperty(event, 'pageX', { value: N })` after event construction.
Both fixes documented in test-writer/patterns.md (§ Dispatching PointerEvents in jsdom).

**Pattern analysis:**

1. **[REPEAT — 4th occurrence] Partial fix applied to sibling file group (cross-cutting concern)**

   Prior occurrences:
   - First (2190dd5): auth error destructuring applied to 2 of 8 query files.
   - Second (83ae098): PR4 getUser hardening missed quiz/session/page.tsx and discard.ts.
   - Third (consent commit, 2026-03-27): consent seeding updated for ensureTestUser and ensureLoginTestUser but not ensureAdminTestUser.
   - Fourth (e38ef8c, this cycle): `currentStreak` singular/plural fixed but `bestStreak` — immediately adjacent in the same component, same pattern, same file — was not. Caught as semantic-reviewer ISSUE, fixed in ca09f34.

   This is now the 4th occurrence across 4 different commits and 3 different feature areas (query file hardening, auth callback hardening, test fixture seeding, UI string formatting). The root cause is consistent across all four: the fix is scoped to the specific instance the author saw, not to all instances of the same pattern in the surrounding scope (file, component, function).

   This pattern is broad enough to span any type of change — not just user-provisioning helpers (the prior framing). The generalized form: **when fixing any pattern (error handling, string formatting, guard conditions, mock cleanup) in one location, grep the same file and adjacent files for all instances of that exact pattern before committing.**

   Count 4 warrants a CLAUDE.md workflow note that covers the full generalized scope. Prior recommendation (2026-03-27) proposed a narrow note about user-provisioning helpers; this cycle broadens it. See Recommended Changes below.

2. **[NEW — count 1] jsdom PointerEvent gaps (setPointerCapture not implemented, pageX not in PointerEventInit)**

   `use-drag-scroll.test.ts` hit two jsdom constraints not obvious from the web API documentation:
   - jsdom's `setPointerCapture` throws "not implemented" unless `pointerId` is present in the PointerEvent init dict.
   - jsdom does not map `pageX`/`pageY` from the PointerEventInit dict; they must be set via `Object.defineProperty` after construction.

   First occurrence as a named learner pattern. Already documented in test-writer/patterns.md (§ Dispatching PointerEvents in jsdom). No additional rule change needed. First occurrence — log and watch.

3. **[RECURRING — count 3] test-writer generates tests requiring jsdom compatibility fixes before they pass**

   The test-writer continues to produce correct-intent tests that hit runtime constraints (TS2532 unchecked index, deprecated vi.fn syntax, now jsdom PointerEvent gaps). Each occurrence requires a fix cycle before the tests can be committed. The pattern is documented in test-writer/patterns.md each time. The fix cycle remains the reliable gate. Count 3 — no additional rule change; the documented constraint library in test-writer/patterns.md is the correct mechanism.

4. **[NEW — count 1] Non-null assertion in hook missing justifying comment (WARNING)**

   `use-drag-scroll.ts` used `containerRef.current!` without a comment explaining why the ref is guaranteed non-null at that point. This is a WARNING per code-style.md Section 5. First occurrence in a newly written hook. Log and watch — not a rule change (rule already exists).

**Actions taken:**
- Frequency table row 35: count updated from 3 to 4, last-seen updated to 2026-03-29, status note extended with fourth occurrence and generalized root cause.
- Frequency table: "jsdom PointerEvent gaps" added as new watch row, count 1, 2026-03-29.
- Frequency table: "test-writer generates tests requiring jsdom compatibility fixes" updated to count 3, last-seen 2026-03-29.

**Recommended changes:**

- [ ] `CLAUDE.md` — Add or extend the sibling-file workflow note. Current note (if added after 2026-03-27 cycle) covers user-provisioning helpers. Expand to the general form: "When fixing any repeated pattern in a file (string formatting, error handling, guard conditions, mock cleanup), grep the same file for all instances of that pattern before committing. The fix must be complete — not just the instance you noticed."

- [ ] `agent-workflow.md` — Under Plan Validation, add to the "Sibling file audit" row or as a new bullet: "Before committing a fix for a pattern (string format, guard, error path), grep the file being changed for all occurrences of the same pattern. A partial fix that leaves identical adjacent instances is caught post-commit and requires a second fix commit."

**No code-style.md or security.md changes this cycle.** All new patterns are first occurrences (jsdom PointerEvent gaps, non-null assertion warning). The sibling-file pattern at count 4 warrants a CLAUDE.md/agent-workflow.md workflow note but not a mechanical style rule.

**False positives:** None detected. The semantic-reviewer ISSUE on bestStreak was a real gap — identical line pattern one function below the fixed one.

**Positive signals:**
- Code reviewer was clean except for a single WARNING (non-null comment) on a new hook — 7 CodeRabbit findings addressed in a single commit with zero BLOCKING violations.
- Test writer correctly identified 3 coverage gaps (new hook, extracted component, singular/plural branches) — all gaps filled in the same cycle.
- jsdom PointerEvent constraints were diagnosed and fixed quickly; the fix pattern is now documented in test-writer/patterns.md so future hook tests with pointer events will have a reference.
- The bestStreak ISSUE was caught post-commit (not post-push) — the gate worked at the right layer.

---
