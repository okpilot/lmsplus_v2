# Agent Memory — plan-critic

> Index of durable plan-review knowledge. Recurring-pattern tracker + stable recipes.
> Per `.claude/rules/agent-memory.md`: keep < 200 lines / < 25 KB. No session logs — git holds history.

## Recurring Issues Tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Multi-query test mocks: single `mockFrom` keyed by table name can't distinguish N parallel `.from()` calls, two sequential calls to the SAME table with different filters, or count-head vs range-data calls. Plan must scope `mockImplementation`/`mockFromSequence`/call-order dispatch as in-scope. dashboard.ts getTotalAnswered+getQuestionsToday are BOTH `student_responses` count-head reads in Promise.all — any error test in dashboard.test.ts that sets `student_responses` to `{ count: null, error }` necessarily errors BOTH, not just the target. Plan's proposed mitigation (assert on prefix match `/Failed to fetch/`) is correct — flag this only as SUGGESTION to change assertion rationale in plan. | 2026-04-11 | 6 | 2026-06-01 | WATCHING |
| Test-rewrite plans for query→RPC (or Server-Action delegation) refactors underspecify scope: must enumerate which test blocks survive unchanged, which collapse (dead paths), which change *assertions* (not just mocks). Vague "rewrite N tests" leaves implementer to over/under-mock. | 2026-04-11 | 7 | 2026-05-29 | WATCHING |
| SECURITY DEFINER RPC plans omit project SQL conventions: `is_admin()` over inline role lookup; `AND deleted_at IS NULL` on user/session lookups (§9); §9-omission needs inline comment citing rule + precedent. | 2026-04-11 | 4 | 2026-05-27 | WATCHING |
| Sibling-file audit missed: defensive pattern (error destructure, null guard) added to one action/query file, identical pattern in sibling in same folder untouched. (CLAUDE.md sibling-audit rule.) | 2026-04-11 | 2 | 2026-05-22 | RULE CANDIDATE → CLAUDE.md sibling-audit |
| Plans referencing a constraint/mode value cite mig 001 but a later migration widened/renamed it. Must trace the FULL migration chain (grep `ALTER TABLE`, `ON CONFLICT (`, constraint names) before depending on a constraint's shape. | 2026-05-08 | 3 | 2026-05-28 | WATCHING |
| Red-team fixture INSERT into `student_responses` omits `selected_option_id` value and/or misstates column type. Actual schema: `TEXT NOT NULL CHECK(IN 'a','b','c','d')` — not uuid, not nullable. Must include a value; service-role INSERT bypasses FORCE RLS. | 2026-05-31 | 2 | 2026-05-31 | WATCHING |
| `get_student_streak` always returns exactly one `{current_streak:0,best_streak:0}` row for anon/cross-org (COALESCE scalar subqueries with no FROM). Generic "error!=null \|\| length===0" assertion pattern fails for this RPC; needs a tailored `current_streak===0 && best_streak===0` check. Requirements doc for #673 correctly specifies the {0,0} shape throughout — positive signal. | 2026-05-31 | 1 | 2026-05-31 | WATCHING |

## Durable plan-review checks

### SQL / migrations
- **Trace the full migration chain, not just mig 001.** `quiz_sessions.mode` CHECK widened by mig 058 (added `internal_exam`) and given the canonical name `quiz_sessions_mode_check` — use named `DROP/ADD CONSTRAINT`, not the DO-block predicate-text lookup (that pattern is only for unnamed constraints). `quiz_sessions.deleted_at` added by mig 023 (not in initial schema). Always grep all migrations for `ALTER TABLE` on the target before reasoning about its current shape.
- **CREATE OR REPLACE FUNCTION: trace to the latest definition before flagging a missing pattern.** A later migration may already add the guard/clause. (Pre-Flag Verification — also in `semantic-reviewer.md` / `implementation-critic.md`.)
- **Widening a UNIQUE constraint breaks existing `ON CONFLICT (col-list) DO NOTHING`.** Postgres needs an exact matching unique index. Grep `ON CONFLICT (` across all migrations and include a companion migration rewriting every living RPC's clause (missed for `batch_submit_quiz`/`submit_quiz_answer` on mig 084).
- **`STABLE`/`IMMUTABLE` + `EXECUTE` is a hard error.** Dynamic-SQL RPCs (`RETURN QUERY EXECUTE`) must be `VOLATILE` (or omit the keyword). Model: `get_session_reports`, not `get_admin_student_stats`.
- **New `questions` columns must satisfy existing NOT NULL columns.** `questions.options` is `JSONB NOT NULL`, no DEFAULT — new types (short_answer, dialog_fill) need nullable/DEFAULT/explicit `options:'[]'` or inserts fail silently.
- **New exam modes with answer-bearing question types need a server-side projection RPC.** `get_quiz_questions()` only strips MC correct-option markers; any new correct-answer column (canonical_answer, blanks_config canonical, accepted_synonyms) needs a `get_*_questions` RPC that strips it — never let students SELECT it via PostgREST.
- **`smart_review` passes `p_subject_id = NULL`.** `q.subject_id = NULL` is always NULL in Postgres → 0 rows. Subject-scoped WHERE/COUNT must be `(p_subject_id IS NULL OR q.subject_id = p_subject_id)`.

### Pagination / truncation (PostgREST max_rows = 1000)
- `.limit(N)` with N > 1000 is NOT a safeguard — max_rows=1000 overrides it. Treat as unbounded (e.g. `dashboard-stats.ts` `.limit(10000)`/`.limit(5000)`).
- Truncation audits partitioned by directory miss colocated `queries.ts` in admin sub-routes and the cross-cutting GDPR export layer (`lib/gdpr/collect-user-data.ts`). Scope audits by file-ownership, name the colocated files.
- `.order('id')` tiebreak fails on tables without an `id` column — `flagged_questions`/`active_flagged_questions` use composite PK `(student_id, question_id)`; use `flagged_at`. Verify each target table has the column.
- `fetchAllRows<T>` contract: `data` is always `T[]`, never null. Error-path mocks use `{ data: [], error: {...} }`, not `{ data: null }`. Joins in the `getPage` select need an explicit cast to `PromiseLike<PageResult<T>>`.

### Extraction / file-split
- Removing one function from an over-limit utility file may leave the parent still over the 200-line cap — verify post-extraction line count or scope a second split.
- Query-helper modules extracted from `'use server'` files must NOT carry `'use server'` (they take a `supabase` param; the directive turns exports into Server Actions and breaks runtime calls). Precedent: `collect-user-data-queries.ts`.
- Adding a column to a `.select()` string must also update any local row-type alias used in an `as SomeRow[]` cast (TS doesn't enforce the cast against runtime; missing field is invisible until referenced).
- Replacing one `Promise.all` arm with a helper returning an unwrapped array changes the destructuring (`{ data }` → bare binding) — state it explicitly.

### Component / UI
- Migrating a hand-rolled overlay to a controlled Dialog: removing the mount guard breaks `useState(props…)` initializers (run once at mount) → stale form on reopen. Keep the guard or add `key={entityId}` to force remount.
- Rewriting a component to a new UI lib: the co-located `.test.tsx` mocks the OLD lib by module path — the entire mock + assertions must be rewritten; list the test file under "Files to change".
- `nav-items.ts` icon name is a CLOSED union; `NavIcon` switch silently renders nothing for unknown names. New nav entries reuse an existing icon or add to BOTH the union AND the switch. `sidebar-nav.test.tsx` asserts exact named items — list it as an affected caller.

### Red-team / E2E specs
- A spec's *pass condition* may be a specific error code — hardening that changes the error string (e.g. `23502` → `invalid_question_ids`) breaks the assertion. Check per spec; prefer open `expect(error).not.toBeNull()`.
- Specs fetching question IDs with only `deleted_at IS NULL` (not `status='active'`) feed invalid IDs to new active-status validation. Add `.eq('status','active')` or document seeded-active assumption.
- NUL-byte (`\x00`) injection payloads are rejected by PostgREST (400) before the RPC runs — message won't match the RPC's `RAISE` string; needs a separate assertion branch.
- audit-completeness: `actor_id` differs per event type — admin events (`internal_exam.code_issued/voided`) bind `v_admin_id`; student events bind `v_student_id`. Bind `expected_actor` to the right role or get 0 rows.
- Name the specific RPC per event: `exam.started`/`exam.completed` come from `start_exam_session`+`batch_submit_quiz(mode='mock_exam')`, NOT `start_internal_exam_session`.

### Validation discipline
- Never leave "needs verification" open in a validated plan — resolve before review or the implementer guesses.
- Dual-deletion-path tables (CASCADE + direct admin RLS DELETE, e.g. `exam_config_distributions`): soft-delete-matrix rows must document BOTH paths.
- `userEvent.type('150')` emits 3 change events; `.at(-1)` captures only the final clamped value — that (not "Math.max so exact") is the correct rationale for `toBe(max)`.

### Agent-tooling plans (native subagent memory)
- A Phase-0 spike "confirm the agent reads/writes MEMORY.md" is a false positive if the agent body also has an explicit Read/Write of that file — strip the body instruction first to isolate native-injection engagement.
- Reference matrices (e.g. red-team `attack-surface.md`) must not be renamed to `MEMORY.md` where the curation nudge can prune active GAP rows; keep as a topic file with a no-delete header and update operational references (insights.md) in the same commit.
- After `memory: project` is added, remove body-level "Read your memory file at start" instructions or the agent double-loads (test-writer, code-reviewer, plan-critic, implementation-critic, security-auditor all had these).

| Red-team spec for aggregation RPCs: instructor fixture missing from seed.ts (only 'student' and 'admin' roles exported). Plan that references `seedInstructor` or assumes the instructor helper exists will fail at runtime. Must add the fixture as part of the spec. | 2026-05-31 | 2 | 2026-05-31 | WATCHING — #673 design correctly adds seedRedTeamInstructor + upsertUser role widening; resolved for this PR |
| Red-team plans that add new RLS-isolation specs label them with the WRONG Vector ID from attack-surface.md. Attack-surface.md Vector S = Server Action IDOR (toggleFlag Server Action), but #314 plan maps flag-idor.spec.ts (direct Supabase client RLS test) → S. Also: unauth flagged_questions test should update Vector T, not Q. Always verify: does the vector label in the plan match the description in attack-surface.md? | 2026-05-31 | 1 | 2026-05-31 | WATCHING |
| Dead-dep removal plans conflate "no @plugin in CSS" with "truly unused". Tailwind v4 CSS-first: a package can be in dependencies and produce NO build output (prose classes) if `@plugin` is missing from globals.css — plan must distinguish "package not wired" from "package unused". #325: @tailwindcss/typography IS used (legal layout prose classes) but broken (no @plugin). Removal would be correct only if the prose styling is intentionally abandoned. | 2026-05-31 | 1 | 2026-05-31 | WATCHING |
| `get_question_counts` is org-scoped via RLS (not student-scoped): cross-org student gets empty set because tenant_isolation on questions scopes by org, not by student_id. It does NOT have an explicit `student_id = auth.uid()` predicate. An anon caller also gets empty. The cross-org isolation guarantee is at the org level, not per-student. | 2026-05-31 | 1 | 2026-05-31 | WATCHING |
| SECURITY INVOKER mastery RPC instructor non-vacuity: the denominator (active_q CTE) reads questions via tenant_isolation RLS (org-scoped), so an instructor in the same org gets `total > 0` rows. Correct_q reads student_responses with explicit `sr.student_id = auth.uid()` so instructor with no responses gets correct=0. The instructor assertion `every(r => r.correct===0) AND data.length>0` is valid and non-vacuous. | 2026-05-31 | 1 | 2026-05-31 | WATCHING — positive signal, design verified correctly |
| UNIQUE(session_id, question_id) with session_id=NULL: Postgres standard NULL distinctness means each NULL is distinct, so duplicate rows with session_id=NULL never conflict (no 23505). Re-run after partial seed inserts a second set of 8 — harmless only if consuming RPCs collapse duplicates (mastery: DISTINCT qid; streak: DISTINCT date; last-practiced: MAX per subject — all correct). | 2026-05-31 | 1 | 2026-05-31 | WATCHING |

| Async Server Component test pattern: `const jsx = await ComponentFn({ props }); render(jsx)` is the established pattern in this repo (progress-content.test.tsx, page.test.tsx). Plan that proposes `render(await Component(...))` is correct — NOT a false positive. Vitest/jsdom resolves the Promise before handing JSX to RTL. Confirmed 2026-06-01. | 2026-06-01 | 1 | 2026-06-01 | WATCHING |
| Shape-consistency check: when a plan adds a new result type to a module that already has a sibling action with a different result shape (`{ success, sessions }` vs proposed `{ data, failed }`), must verify whether they serve the SAME consumer. If they do, flag as SUGGESTION to align shapes. internal-exam-content.tsx consumes both — shapes differ but `failed:boolean` vs `success:boolean` with inversion is low-friction. PR-A1 2026-06-01. | 2026-06-01 | 1 | 2026-06-01 | WATCHING |

## Positive signals (what good plans got right)
- Verified real Base UI 1.3.0 data attributes (`data-panel-open`, `data-starting-style`) against type defs rather than guessing.
- Traced the E2E data-dependency chain (no `exam_configs` seed → empty query → disabled button) and matched seed distribution to `EXAM_PLANS`.
- For TS→SQL aggregation moves: confirmed all callers, §11 multi-permissive-RLS scoping via explicit `WHERE student_id = auth.uid()`, behavioral equivalence, and NUMERIC AVG → string → `Number()` coercion. (Watch: enumerate ALL dead test-helper artifacts, incl. optional `FromSetup` fields TS won't catch.)
- Cast-guard sweep (#677): plan correctly identified all 3 unguarded `rpc<T[]>` sites and verified 7 already-guarded siblings. Line numbers exact. Test scope correct. Only minor issue: cited `check-consent.ts` at wrong path (`lib/queries/` vs actual `lib/consent/`) and `load-session-questions.ts:50` uses `!data?.length` guard (not `Array.isArray`) — a different-but-safe pattern, not a reference-compliant sibling.
- #673 tasks.md: line numbers (seedRedTeamAdmin:107, upsertUser:339, VICTIM_EMAIL:4-6, getAdminClient:25), file paths, and ordering all correct. Design faithfulness high — no contradictions on the substantive algorithmic decisions (round-robin, single-snapshot dates, sentinel idempotency, 'a' literal, streak offsets, no-cleanup rationale). Key issue: attack-surface.md status-flip (BW1-3/BX1-7/CA/CB → COVERED + new BX7 row) and upsertUser admin-param omission in Task 1 description body (not caught by the task's _Leverage reference to line 107). Also: victim creds sourcing underspecified in Task 5 prompt (should name VICTIM_EMAIL/VICTIM_PASSWORD or seedRedTeamStudent() call explicitly).
