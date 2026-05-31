# Requirements Document

## Introduction

Issue #673 adds **red-team E2E regression coverage** for the four student-facing
aggregation RPCs introduced by the #668 `max_rows=1000` truncation umbrella:

- `get_student_mastery_stats()`
- `get_question_counts(p_status)`
- `get_student_streak()`
- `get_student_last_practiced()`

These RPCs are already correct and deployed (verified on prod). What is missing is
**regression coverage**: a Playwright red-team spec set that fails loudly if a future
RLS/SQL change reintroduces an unauthenticated leak, a cross-tenant leak, or
instructor/admin over-aggregation (the §11 multi-permissive-policy self-scope was the
original BW3 defect, fixed in `bf756480`). This spec adds no production behaviour — it
adds tests plus the test fixtures those tests require.

The vectors are catalogued in `.claude/agent-memory/red-team/topics/attack-surface.md`
(BW1–BW3, BX1–BX6, BX7, and the unauthenticated/cross-org cases of CA/CB for
`get_question_counts`).

## Alignment with Product Vision

The platform is multi-tenant EASA PPL training. Two product invariants are at stake:
a student must never see another student's or another org's data, and per-student
dashboard metrics must be computed per-caller. `docs/security.md` §11 ("Multiple
Permissive RLS SELECT Policies") codifies that aggregation RPCs over `student_responses`
must self-scope with an explicit `auth.uid()` predicate because RLS alone over-scopes to
the instructor/admin policy. This spec pins those guarantees with executable tests so the
self-scope predicate cannot be silently removed.

## Requirements

### Requirement 1 — Unauthenticated callers get a safe empty/zero result, not data and not a crash

**User Story:** As the platform owner, I want every aggregation RPC to yield a safe
empty/zero result for an anon (no-JWT) caller, so that an unauthenticated request can
never read student data nor break with an unexpected error shape.

#### Acceptance Criteria

1. WHEN an anon (anon-key, no JWT) client calls `get_student_mastery_stats()` THEN the RPC SHALL return `error === null` AND an empty array (`data.length === 0`). _(BW1)_
2. WHEN an anon client calls `get_question_counts('active')` (named param `{ p_status: 'active' }`) THEN the RPC SHALL return `error === null` AND an empty array. _(CA)_
3. WHEN an anon client calls `get_student_last_practiced()` THEN the RPC SHALL return `error === null` AND an empty array. _(BX2)_
4. WHEN an anon client calls `get_student_streak()` THEN the RPC SHALL return `error === null` AND exactly one row whose `current_streak === 0` AND `best_streak === 0` (the function's scalar-subquery shape always returns one `{0,0}` row — it is NOT empty). _(BX1)_

### Requirement 2 — Cross-org students cannot read another organization's data via these RPCs

**User Story:** As a student in org B, I must not be able to read org A's mastery,
counts, streak, or last-practiced data through any aggregation RPC, so that tenant
isolation holds at the RPC layer (not only at the raw-table layer the existing spec
already covers).

> **Keying note (plan-critic CRITICAL):** `easa_subjects`/`easa_topics` are **shared
> reference data with no `organization_id`** (only `questions` are org-scoped). The same
> `subject_id` UUID therefore appears across all orgs, so "subject_id belongs to egmont"
> is NOT a valid isolation predicate. Cross-org isolation is keyed instead on **response
> attribution** (the victim's `correct`/last-practiced/streak data must never surface to a
> cross-org caller) and on the **empty/zero result** a no-data cross-org caller must get.
> These empties are non-vacuous because Requirement 4 (victim positive control) proves
> egmont DOES hold non-empty data for the same RPCs — so an empty cross-org result proves
> isolation, not absence-of-data.

#### Acceptance Criteria

1. WHEN a cross-org student (in `redteam-other-org`, with no responses) calls `get_student_mastery_stats()` THEN the result SHALL contain **no row whose `correct > 0`** (the victim's correct counts must never leak across orgs; empty is also acceptable when the other org has no questions). _(BW2)_
2. WHEN a cross-org student calls `get_question_counts('active')` (named param `{ p_status: 'active' }`) THEN the result SHALL be an empty array — `redteam-other-org` has no questions, so any egmont count appearing would be a leak. _(CB)_
3. WHEN a cross-org student calls `get_student_last_practiced()` THEN the result SHALL be an empty array (the cross-org caller has no responses; the victim's rows must not appear). _(BX6)_
4. WHEN a cross-org student calls `get_student_streak()` THEN the result SHALL be a single `{0,0}` row (no other-org streak). _(BX5)_

### Requirement 3 — Instructor/admin callers see only their OWN response history (self-scope regression guard)

**User Story:** As the platform owner, I want the student-response aggregation RPCs to
self-scope to the caller even when the caller has the instructor/admin RLS policy, so
that the §11 self-scope predicate (`sr.student_id = auth.uid()`) cannot be removed
without a test failing. This guard is only meaningful when the org actually contains
another student's response data to (wrongly) aggregate.

#### Acceptance Criteria

1. WHEN an egmont instructor with zero own responses calls `get_student_mastery_stats()` AND the egmont victim student HAS seeded correct responses THEN every returned row SHALL have `correct === 0`. _(BW3)_
2. WHEN that instructor calls `get_student_streak()` THEN the result SHALL be a single `{0,0}` row. _(BX3)_
3. WHEN that instructor calls `get_student_last_practiced()` THEN the result SHALL contain zero rows. _(BX4)_
4. IF the egmont org contains no other student's responses THEN the test SHALL be considered invalid (vacuous); therefore the victim's responses MUST be seeded before these assertions run.

### Requirement 4 — A self-scoped student sees its own data, and the streak gaps-and-islands logic is correct

**User Story:** As a student, I want my own mastery, streak, and last-practiced metrics
computed correctly from my full history, so that the positive path is proven (not just
the negative isolation paths) and the gaps-and-islands streak math is pinned against UTC
and grouping regressions.

#### Acceptance Criteria

1. WHEN the egmont victim student calls `get_student_mastery_stats()` THEN at least one returned row SHALL have `correct > 0`. _(positive control for BW3)_
2. WHEN the victim calls `get_student_last_practiced()` THEN it SHALL return at least one row (one per subject answered). _(positive control for BX4)_
3. WHEN the victim's seeded responses form a current run of 3 consecutive UTC days (today, −1, −2) and a separate earlier run of 5 consecutive days (−6…−10) THEN `get_student_streak()` SHALL return `current_streak === 3` AND `best_streak === 5`. _(BX7)_
4. The 8 backdated `created_at` values SHALL be derived from a **single captured timestamp** (one `Date`/`now()` snapshot), not a per-row `new Date()`, so a UTC-midnight rollover mid-seed cannot split a run. (Determinism holds across a single rollover: both runs shift by one day together, preserving lengths 3 and 5 and the today-or-yesterday anchor.)

### Requirement 5 — Deterministic, append-only-safe test fixtures

**User Story:** As a maintainer, I want the fixtures these tests depend on to be
deterministic and idempotent across repeated runs, so that the suite does not flake and
does not accumulate duplicate seed rows.

#### Acceptance Criteria

1. The seed layer SHALL provide an egmont **instructor** fixture (role `instructor`, zero responses) reachable by email/password sign-in.
2. The seed layer SHALL expose the egmont **victim student** credentials so a spec can authenticate as the victim.
3. WHEN the victim-response seeder runs AND exactly 8 sentinel-marked rows already exist for the victim THEN it SHALL make no further inserts (idempotent); otherwise it SHALL (re)insert the full deterministic set of 8 rows.
4. The seeded `student_responses` rows SHALL satisfy every NOT-NULL/CHECK column of the live schema (`organization_id` NOT NULL FK = victim's egmont org; `student_id` NOT NULL = victim; `question_id` NOT NULL FK; `selected_option_id` **TEXT NOT NULL CHECK IN ('a','b','c','d')** — a literal letter, not a UUID; `is_correct` BOOLEAN NOT NULL = true; `response_time_ms` **INT NOT NULL** = the sentinel integer) and SHALL backdate `created_at` at noon UTC to avoid date-boundary flake. `session_id` MAY be NULL.
5. The seeded rows SHALL NOT be cleaned up in an `afterEach`/`afterAll` — `student_responses` is append-only (NEVER UPDATE/DELETE per `docs/security.md` §6 and the immutable-table rule); idempotent insert-once makes cleanup unnecessary and the persistence mirrors the existing persistent seed users.
6. The change SHALL touch only `apps/web/e2e/redteam/**`; no file under `supabase/migrations/`, `apps/web/lib/`, or `apps/web/app/` is modified (verifiable in review — this is a tests-only PR).

## Non-Functional Requirements

### Code Architecture and Modularity
- **No production code change.** Only `apps/web/e2e/redteam/**` (specs + seed helper) change. The four RPCs and their migrations are not modified.
- **Single Responsibility:** seeding logic lives in `helpers/seed.ts`; assertions live in spec files. New per-vector assertions extend the two existing specs (anon, cross-org) plus one new spec (instructor self-scope + streak edge), matching the existing red-team file layout.
- **Reuse:** build on `seedRedTeamUsers`, `createCrossOrgUser`, `seedRedTeamAdmin`, `createAuthenticatedClient`, `pickSubjectWithQuestions`, `getAdminClient` — do not duplicate client/seed plumbing.

### Security
- Tests assert defense-in-depth: the unauthenticated guard, cross-tenant RLS isolation, and the §11 per-caller self-scope. A failure of any assertion indicates a real RLS/SQL regression and must block.
- The seed uses the service-role admin client only inside test infrastructure (never shipped to the client bundle).

### Reliability (determinism)
- Streak fixtures use UTC-noon backdated timestamps and a 3-day gap between runs so `current_streak`/`best_streak` are deterministic regardless of wall-clock run time (within the function's today-or-yesterday tolerance).
- The victim-response seeder is idempotent via an 8-row sentinel count, so reruns neither duplicate nor partially seed.

### Maintainability
- The new spec must run under the existing `redteam` Playwright project via `pnpm --filter @repo/web e2e:redteam` with no new project/config wiring.
- Test names describe externally observable behaviour (per `.claude/rules/code-style.md` §7), e.g. "cross-org student gets no egmont subjects from get_student_mastery_stats".
