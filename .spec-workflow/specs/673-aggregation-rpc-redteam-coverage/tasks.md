# Tasks Document

> Tests-only change. All paths under `apps/web/e2e/redteam/`. No production / migration code.
> Run order matters for review but the helpers (Task 1) must land before the specs (2–4).

- [x] 1. Widen `upsertUser` role + add instructor/student credential seeders
  - File: `apps/web/e2e/redteam/helpers/seed.ts`
  - Change `upsertUser` signature role param to `'student' | 'admin' | 'instructor'` (body unchanged).
  - Add module-private `INSTRUCTOR_EMAIL = 'redteam-instructor@lmsplus.local'`, `INSTRUCTOR_PASSWORD = 'redteam-instructor-2026!'`.
  - Add `seedRedTeamInstructor(): Promise<{ instructorUserId, orgId, email, password }>` mirroring `seedRedTeamAdmin` (calls `upsertUser(..., 'instructor')`).
  - Add `seedRedTeamStudent(): Promise<{ victimUserId, orgId, email, password }>` that resolves egmont org, obtains `const admin = getAdminClient()`, and calls `upsertUser(admin, VICTIM_EMAIL, VICTIM_PASSWORD, orgId)` (idempotent — note the `admin` first arg; the signature is `upsertUser(admin, email, password, orgId, role)`), returning the victim creds.
  - Note: `upsertUser` is module-private and additive-safe — all 5 existing call sites pass `'student'` or `'admin'`; none break by widening the union.
  - Purpose: provide an egmont instructor (zero responses) and victim-credential access for the new specs.
  - _Leverage: existing `seedRedTeamAdmin` (seed.ts:107), `upsertUser(admin, email, password, orgId, role)` (seed.ts:339), `VICTIM_EMAIL` (seed.ts:4), `VICTIM_PASSWORD` (seed.ts:6)_
  - _Requirements: 5.1, 5.2_
  - _Prompt: Role: TypeScript test-infrastructure engineer | Task: In apps/web/e2e/redteam/helpers/seed.ts widen upsertUser's role union to include 'instructor' and add seedRedTeamInstructor() + seedRedTeamStudent() exactly mirroring the existing seedRedTeamAdmin shape, per requirements 5.1/5.2 | Restrictions: do not change upsertUser's body logic; reuse existing org-resolution and consts; keep new email/password consts module-private; no production code | Success: both helpers compile, are idempotent, return creds usable by createAuthenticatedClient, instructor row has role='instructor' in egmont_

- [x] 2. Add `seedVictimResponses()` deterministic, idempotent fixture seeder
  - File: `apps/web/e2e/redteam/helpers/seed.ts` (continue from Task 1)
  - Add `const SENTINEL_RESPONSE_TIME_MS = 987654` and `seedVictimResponses(): Promise<VictimResponseFixture>` per design Component 4: idempotency guard on `count===8` sentinel rows; select up to 8 distinct active non-deleted egmont questions (`ORDER BY id LIMIT 8`, require ≥1); compute 8 DISTINCT noon-UTC backdated dates from a SINGLE `new Date()` snapshot with offsets `[0,1,2,6,7,8,9,10]`; build 8 rows (one per date, question round-robin) with all NOT-NULL columns (`selected_option_id:'a'`, `is_correct:true`, `response_time_ms:SENTINEL`, `session_id:null`); single `.insert([...])` with `{ error }` destructure + throw; return `{ victimUserId, correctCount:8, subjectIds, questionIds, expected:{current:3,best:5} }`.
  - Document in a comment: append-only/no-cleanup rationale; RPC trusts `sr.is_correct` (selected_option_id cosmetic); duplicate-tolerance via DISTINCT/COUNT DISTINCT/GROUP BY.
  - Purpose: make the isolation tests non-vacuous and pin the streak edge case deterministically.
  - _Leverage: `getAdminClient` (../helpers/supabase.ts:25), `seedRedTeamStudent` (Task 1), code-style §5 `{ error }` discipline_
  - _Requirements: 4.3, 5.3, 5.4, 5.5_
  - _Prompt: Role: TypeScript test-infrastructure engineer with Postgres/Supabase expertise | Task: Implement seedVictimResponses() in seed.ts per design Component 4 and requirements 4.3/5.3/5.4/5.5 — deterministic 8-distinct-date fixture, idempotent on an 8-row response_time_ms sentinel, single-snapshot UTC-noon dates with offsets [0,1,2,6,7,8,9,10], questions round-robin (>=1), all NOT-NULL/CHECK columns satisfied. On the idempotent-skip path (count===8) STILL SELECT the existing sentinel rows joined to questions to populate subjectIds before returning a correct fixture (never an empty/placeholder fixture on skip). | Restrictions: never UPDATE/DELETE student_responses (append-only); compute all dates from ONE Date snapshot; selected_option_id must be the literal 'a'; do not depend on >=8 questions; destructure { error } and throw on insert failure | Success: helper is idempotent across reruns, inserts 8 distinct-date rows, returns a correct fixture on BOTH the insert and skip paths, and the streak/mastery/last-practiced assertions downstream are deterministic_

- [x] 3. Add 4 unauthenticated (anon) RPC cases
  - File: `apps/web/e2e/redteam/server-action-unauthenticated.spec.ts`
  - In the existing describe, add 4 tests using the existing `unauthClient`: mastery → `error===null && data.length===0`; `get_question_counts` `{ p_status:'active' }` → empty; last-practiced → empty; streak → `data.length===1 && data[0].current_streak===0 && data[0].best_streak===0`.
  - Purpose: pin the anon empty/zero guarantee (BW1/CA/BX1/BX2).
  - _Leverage: existing `unauthClient` + assertion style in this file_
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Prompt: Role: Security test engineer (Playwright + Supabase) | Task: Add four anon-caller RPC tests to server-action-unauthenticated.spec.ts covering requirements 1.1-1.4, reusing the existing unauthClient | Restrictions: streak asserts a single {0,0} row (NOT empty); use named param { p_status:'active' } for get_question_counts; behavior-first test names (code-style §7); no cleanup (read-only) | Success: four tests added, assertions match the verified RPC shapes, names describe observable behaviour_

- [x] 4. Add 4 cross-org RPC isolation cases + seed responses in beforeAll
  - File: `apps/web/e2e/redteam/rpc-cross-tenant.spec.ts`
  - Add `await seedVictimResponses()` to the existing `beforeAll` (so the differential is non-vacuous).
  - Add 4 tests using the existing `crossOrgClient`: mastery → `(data ?? []).every(r => r.correct === 0)`; `get_question_counts` `{ p_status:'active' }` → `data.length===0`; last-practiced → `data.length===0`; streak → single `{0,0}`.
  - Purpose: pin cross-org isolation at the RPC layer (BW2/CB/BX6/BX5), keyed on response attribution not subject_id.
  - _Leverage: existing `crossOrgClient`, `seedVictimResponses` (Task 2), existing afterAll (untouched)_
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - _Prompt: Role: Security test engineer (Playwright + Supabase) | Task: Extend rpc-cross-tenant.spec.ts with seedVictimResponses() in beforeAll and four cross-org RPC tests covering requirements 2.1-2.4 | Restrictions: do NOT key isolation on subject_id (shared taxonomy) — assert no leaked correct counts / empty / {0,0}; do not modify the existing afterAll or existing tests; named param for get_question_counts | Success: four cross-org tests added and non-vacuous (victim has data), existing tests still pass, no new cleanup needed_

- [x] 5. Create the instructor self-scope + positive-control + streak-edge spec
  - File: `apps/web/e2e/redteam/dashboard-stats-rpc-isolation.spec.ts` (NEW)
  - Header comment: vectors BW3/BX3/BX4/BX7 + positive control; persistent-seed/no-cleanup rationale (append-only student_responses).
  - `beforeAll`: `seedRedTeamUsers()`, `seedRedTeamInstructor()`, `const fx = await seedVictimResponses()`; build `victimClient` + `instructorClient` via `createAuthenticatedClient`.
  - Tests: instructor mastery → `data.length>0 && every(correct===0)`; instructor streak → `{0,0}`; instructor last-practiced → empty; victim mastery → `some(correct>0)`; victim last-practiced → `length>=1`; victim streak → `current===3 && best===5`.
  - Purpose: pin the §11 self-scope regression guard (non-vacuous) + the gaps-and-islands streak correctness.
  - _Leverage: `seedRedTeamInstructor`/`seedRedTeamStudent`/`seedVictimResponses` (Tasks 1-2), `createAuthenticatedClient`, `getAdminClient`_
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_
  - _Prompt: Role: Security test engineer (Playwright + Supabase) | Task: Create apps/web/e2e/redteam/dashboard-stats-rpc-isolation.spec.ts covering requirements 3.1-3.3 and 4.1-4.3 — instructor zero-response self-scope (mastery length>0 & every correct===0; streak {0,0}; last-practiced empty), victim positive control (mastery some correct>0; last-practiced >=1; streak current===3 best===5). Authenticate using the email/password RETURNED by seedRedTeamInstructor() and seedRedTeamStudent() — the credential consts are module-private, do not import them. | Restrictions: seed via the helpers (no inline inserts); no afterEach/afterAll cleanup (append-only, documented in header); behavior-first names; document why mastery length>0 holds (caller-independent denominator) | Success: new spec runs under the redteam project, all assertions deterministic, non-vacuous (depends on seeded victim data)_

- [x] 6. Validate the suite (static gate, then red-team run)
  - Files: n/a (verification)
  - **Static gate (always runs, must pass):** `pnpm --filter @repo/web lint`; `pnpm check-types`; and `git diff --name-only` MUST show only paths under `apps/web/e2e/redteam/` — no `supabase/migrations/`, `apps/web/lib/`, or `apps/web/app/` files (Req 5.6).
  - **Red-team run (best-effort local, else CI):** start local Supabase (`npx --no-install supabase start`) + run `pnpm --filter @repo/web e2e:redteam` (Playwright auto-starts the dev server). If the local stack cannot start in this environment, rely on CI's Red Team workflow on the PR as the gate and state which path was used.
  - Purpose: prove the new specs pass green and the change is tests-only before commit/push.
  - _Leverage: existing `e2e:redteam` script, local Supabase config (supabase/config.toml)_
  - _Requirements: 5.6, All_
  - _Prompt: Role: QA engineer | Task: Run the static gate (lint, check-types, git diff --name-only path assertion for Req 5.6) which must always pass, then execute the redteam Playwright project locally if the stack can start, else document CI as the gate | Restrictions: do not weaken assertions to make tests pass; investigate any failure as a real signal; never --no-verify; the git-diff path check is a hard gate | Success: lint + types clean, diff touches only apps/web/e2e/redteam/**, redteam specs green locally or on CI, no flakes across two runs_

- [x] 7. (post-commit) Update + verify the attack-surface matrix
  - File: `.claude/agent-memory/red-team/topics/attack-surface.md` (protected topic file, owned by the red-team agent)
  - The diff touches `apps/web/e2e/redteam/`, so the post-commit **red-team agent** runs. The matrix update is a load-bearing deliverable of this spec (closing these specific gaps), so it MUST happen — do not let it be silently skipped:
    1. **Flip to COVERED** rows BW1, BW2, BW3, BX1, BX2, BX3, BX4, BX5, BX6, citing the new/edited spec files (`server-action-unauthenticated.spec.ts`, `rpc-cross-tenant.spec.ts`, `dashboard-stats-rpc-isolation.spec.ts`).
    2. **Add a NEW BX7 row** — it does not exist in the matrix yet (currently the table jumps BX6 → BY1). BX7 = `get_student_streak` gaps-and-islands edge correctness, COVERED by `dashboard-stats-rpc-isolation.spec.ts`.
    3. **Partial-flip CA/CB:** mark the `get_student_mastery_stats` / `get_question_counts` unauthenticated + cross-org portions COVERED, but NOTE the `get_random_question_ids` / `get_filtered_question_counts` portions of CA/CB remain GAP (out of scope here — separate from #673's four RPCs).
  - The red-team agent owns this protected file; the orchestrator drives the agent and VERIFIES the three updates above landed (does not hand-edit the matrix).
  - Purpose: keep the vector→spec matrix honest so the next red-team review doesn't re-flag covered vectors.
  - _Leverage: post-commit red-team agent + `.claude/rules/agent-red-team.md`_
  - _Requirements: traceability (not a functional requirement)_
  - _Prompt: Role: orchestrator post-commit | Task: ensure the post-commit red-team agent flips BW1-3/BX1-6 to COVERED, ADDS a new BX7 row (COVERED), and partial-flips CA/CB (student RPCs COVERED, filtered-pool RPCs still GAP), then verify the edits landed | Restrictions: do not hand-edit the protected attack-surface.md; the red-team agent makes the change | Success: matrix shows all 11 vectors COVERED with correct spec filenames + a new BX7 row, filtered-pool CA/CB still GAP_
