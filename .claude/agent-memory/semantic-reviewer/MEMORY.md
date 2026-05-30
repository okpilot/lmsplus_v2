# Semantic Reviewer — Memory

> Native subagent memory index. Tracker first, durable knowledge second, topic pointers last.
> Update rows/bullets IN PLACE. No session logs — git holds history (pre-migration body: `git show 2e87c3e6:.claude/agent-memory/semantic-reviewer/patterns.md`; `git log` after).
> Scope: logic / security / RLS / query-correctness at CodeRabbit depth. Style & file-size belong to code-reviewer — don't overlap.

## Recurring Issues Tracker

> Only patterns that recurred ≥2× as distinct mechanisms are tracked. Count increments on a distinct occurrence, never a re-mention. Rows transition state, never deleted.

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---------|-----------|-------|-----------|---------------------|
| Client terminal path (submit/discard/timeout) redirects + clears localStorage but never calls a Server Action to end/soft-delete the DB session → orphaned `quiz_sessions` row with `ended_at IS NULL` blocks next `start_exam_session` | 2026-04 (b9829c0) | 3 | 2026-04-13 (PR #523) | RULE CANDIDATE — every client-side terminal path for a session with a DB row MUST call a Server Action to end/delete it. Zero-answer exam timeout was the 3rd instance |
| Multi-permissive RLS SELECT table read inside a per-caller RPC over-scopes unless body adds explicit `WHERE owner_col = auth.uid()` | 2026-05-26 (#540/BW3) | 3+ | 2026-05-29 (get_student_profile_stats) | PROMOTED → security.md §11 / docs/security.md §3. Confirmed count=2 across two tables (student_responses, quiz_sessions); appears in SQL comment of every fn touching those tables |
| Supabase query `{ data }` destructured without `{ error }` (non-mutation reads) — silent null fallback hides missing table / unrun migration | 2026 (dashboard-stats) | 4 | 2026 (getResponseCounts) | PROMOTED → code-style.md §5 (mutation rule). Reads inconsistent repo-wide; flag new reads that drop `error` |
| Stale test comment describes a `?? []`/guard/code path the refactor removed — passes for the wrong reason, invites wrong re-addition | 2026-04 (PR #523) | 2 | 2026-05-27 (PR #681) | WATCHING — when removing a fallback/guard, grep co-located `.test.ts` comments for it |
| Test mock string drift: renaming a Server Action's user-visible error string; test mocks the action (not the RPC) and echoes its own stale mock value → passes silently | 2026-04-26 (use-exam-start) | 2 | 2026-04 | WATCHING — on string rename, grep `.test.ts` for old string, update mock values + assertions |
| Prop added to a type/Props but never forwarded to the consuming component (drives icon/aria-label/conditional render) | 2026 (answeredIds) | 3 | 2026 (learningObjective) | WATCHING — when a new prop drives rendering, verify ≥1 call site passes real data |
| PostgREST serializes NUMERIC/bigint aggregate columns as strings — `row.n` is a string, needs `Number()` coercion | 2026 (PR #680 quiz.ts) | 2 | 2026-05-29 (profile.ts avg_score) | WATCHING — every new aggregation-RPC consumer must coerce; no test exercises the string path |
| Fire-and-forget Server Action + immediate `router.push` to a page that re-triggers the cleared guard = race window (~200–800ms) | 2026-04 (b9829c0) | 2 | 2026-04-14 (ce67aee) | RESOLVED — `await discardQuiz(...).catch(err => console.error(...))` before redirect. Standard fix |
| Unstable function reference (plain fn, not `useCallback`/ref) in a `useEffect`/`useMemo` dep array re-runs effect unexpectedly | 2026 (PR #514) | 2 | 2026-04-13 (ea3d8d7) | WATCHING — wrap in `useCallback` or capture in a ref (ref-capture is the standard for callback props in interval/timeout hooks) |
| Client timer initialized at mount shows more time than server has (mount latency: nav+fetch+render) | 2026 | 2 | 2026-04 | WATCHING — fix = return `started_at` from start RPC, thread through SessionData. Escalate to ISSUE on next occurrence |
| Storage converter (`toSessionData`) drops new fields added to the target type but not the source type | 2026 | 2 | 2026-04 (PR #523) | WATCHING — when adding a field to SessionData, audit ALL its producers (`readSessionHandoff`, `toSessionData`) |
| Paginated read test suites cover the getCount error path but not the getPage error path (caller-level propagation) | 2026-05-27 (PR #681) | 2 | 2026-05-29 (#668 #7) | WATCHING — `fetchAllRows` unit test covers it; caller suites don't. Test-writer gap |

## Durable knowledge

### Security / RLS / SECURITY DEFINER (highest-value catches)
- **SECURITY DEFINER bypasses RLS** — every SELECT in the body needs manual `AND deleted_at IS NULL` on soft-deletable tables; audit-event INSERT subqueries (actor/session/question FK lookups) need the filter independently of outer guards (security.md §9, §10). Narrow exception: reads by IDs from an immutable write-once column (`quiz_sessions.config.question_ids`).
- **Multi-permissive SELECT trap:** Postgres ORs permissive policies; a per-caller RPC must self-scope `WHERE owner = auth.uid()` (see tracker). Admin RPCs behind `is_admin()` are exempt.
- **RPCs must self-defend** — Zod at the Server Action boundary is not enough; the RPC is callable directly by any authenticated user. Validate JSONB array length, sum invariants, and UUID element validity inside the function (raw element produces internal `invalid_text_representation`, not a structured `RAISE`).
- **Correct-answer exposure:** student-facing reads must go through `get_quiz_questions()`/report builders that strip `correct` from options. Watch new Server Actions querying `questions.options` directly.
- **Auth-then-validate order:** parse Zod input is fine to throw, but auth check (`auth.uid()`) must gate before any DB work; flag `Schema.parse(input)` placed before the auth check.
- **`.single()` → `.maybeSingle()`** for user/profile lookups where soft-delete yields 0 rows (`.single()` throws PGRST116 as a service error).
- **Trace `CREATE OR REPLACE FUNCTION` to the latest definition** before flagging a missing-pattern finding on a Postgres function (per agent-critic.md Pre-Flag rule).

### Query / data correctness
- **Window-function totals:** `count(*) OVER()` runs before LIMIT → correct full-set total for single-query pagination; but 0-row (out-of-range) page yields no total — caller must treat `totalCount:0` as "maybe out of range".
- **Denominator/numerator mismatch:** widening a read (active-only → non-deleted) for retention UX can push a ratio >100% if the denominator stays narrow — cap with `Math.min(pct,100)` or align (first seen #540).
- **Filter consistency:** count query and page query must carry identical filters + deterministic ordering with a unique tiebreaker (`.order(natural).order('id')`). A single `fetchAllRows` abstraction makes this structural.
- **Zero-row no-op:** DELETE/UPDATE via RLS returns 200 + 0 rows when RLS blocks or filter misses — chain `.select('id')` and check length (code-style.md §5).
- **`as unknown as T` needs a runtime guard** (`Array.isArray`/`typeof`) before use, e.g. `config.question_ids.includes()` throws on a non-array (code-style.md §5).
- **PostgREST embed:** use `!fk_column` (errors loudly) not `:` alias (returns null on FK-resolution failure).
- **camelCase/snake_case JSONB key drift** between TS `.rpc()` payload and SQL `->>'key'` reads is invisible to mocked-client unit tests — needs integration/SQL-parse coverage; prefer snake_case both sides.
- **TOCTOU on COUNT-then-INSERT** (no serializable isolation) is an accepted repo-wide trade-off — document, don't flag as a bug.
- **types.ts nullability:** manually authored RPC `Returns` entries must mirror Postgres nullability — `NUMERIC/TEXT/TIMESTAMPTZ` without NOT NULL → `T | null`.

### React / Next.js correctness
- **Re-throw redirect errors:** any catch wrapping `redirect()`/`notFound()` must `isRedirectError(error)` re-throw (Server Components AND client-component Server Action callers — project has `rethrow-redirect.ts`). Bare `catch{}` turns a redirect into a 500/stale render.
- **Stale-closure on locks/Maps:** deleting from a `lockedRef` in a catch before `setAnswers` propagates opens a double-submit window — release via `useEffect` keyed on the `answers` prop, not synchronously.
- **`new Map()` / `new Set()` in a render return** = new ref each render → downstream dep-array thrash; use a stable `useRef`.
- **Two-layer guard:** HTML `disabled` is not a behavioral contract — `onClick` handlers must also `if (!disabled)` when they manage local state and can be invoked programmatically.
- **`'server-only'` import** required on non-`'use server'` files in `actions/` that touch server clients — turns accidental client-bundle inclusion into a build error.
- **Server Component query helpers** (called via Suspense, not `'use server'`) throwing `error.message` is NOT a client-exposure gap (propagates to error.tsx→Sentry, never reaches DOM) — but a `console.error` before the throw is still wanted for log correlation. Confirmed intentional at count=2; do NOT flag as ISSUE.

### Test-quality catches (semantic, not style)
- **Vacuous re-run test:** to verify an effect guard, the dep value passed must actually differ from the initial — same value silently skips the effect, making the assertion vacuous.
- **jsdom flushes `useEffect` in `act()`** — any property depending on an effect appears correct even if the effect fires too late for a real browser; lock-release-after-failure tests pass in jsdom regardless.
- **Mocked-client unit tests can't catch JSONB-key drift or PostgREST string-serialization** — call out the integration-test gap.
- **`vi.importActual` partial mock** (spread real module, override only the fn) keeps exported constants (e.g. `COMMENT_SELECT`) live from source — prefer over full mock with a hardcoded constant string (drift vector).
- **Proxy-based `buildChain` absorbs `.limit()` silently** — `get-active-exam-session.test.ts` + `get-active-internal-exam-session.test.ts` use a `Proxy` that returns itself on any method call. Adding `.limit()` to production code never breaks these tests, but also means no assertion is possible that the cap value is applied. If adding a call-chain assertion to these files, first replace `buildChain` with a per-method `vi.fn()` chain (the `load-draft.test.ts` pattern). Flagged as SUGGESTION on PR #701 (2026-05-30).

### Process
- **PR-level sweep** (`git diff master...HEAD`) adds value on multi-commit extraction PRs (confirms earlier SUGGESTIONs landed, filter consistency holds cross-commit) but finds nothing extra on single-module refactors.
- **Treat ISSUE as a current gap** regardless of current callers — no "safe today"/"latent" deferral (agent-semantic-reviewer.md).
