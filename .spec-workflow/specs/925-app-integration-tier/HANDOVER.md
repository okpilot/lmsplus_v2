# HANDOVER — #925 App-Layer DB Integration Tier

> Branch `feat/925-app-integration-tier` (off `feat/vfr-rt-training` @ `8270ea05`, which is off master). **Local only — never pushed.** Written 2026-06-20.

## Why this exists

A schema-contract bug — `.is('deleted_at', null)` on `easa_subjects` (no such column) — reached production code on the vfr-rt branch and escaped EVERY gate (mocked unit tests, tsc, biome, 3 plan-critic rounds, sonnet+opus impl-critics). Caught only by semantic-reviewer reasoning. Root cause: app-layer query code (`apps/web/lib/queries/*` + Server Actions, 73 sites / 14 RPCs) is tested ONLY with a mocked Supabase client that can't see the real schema; `packages/db/__integration__` tests the DB layer, never the app's own queries. This tier closes that seam.

## User-chosen scope (2026-06-20)

1. **Tier scope:** reads **+ full mutation lifecycle** (largest option).
2. **Mechanical guard:** grep guard now + a schema-aware (full-column) follow-up issue.
3. **Policy:** **HARD blocking rule** — new `.from()`/`.rpc()` site requires a co-located `.integration.test.ts` (applies to NEW code; existing 73 sites tracked as backlog so the rule doesn't block its own PR).

## How the tier works (validated, load-bearing)

`createServerSupabaseClient()`'s only non-DB dependency is `next/headers` `cookies()`. `vitest.integration.setup.ts` mocks just that with an in-memory `Map` jar on `globalThis` (reset per-test in `beforeEach`); `harness.signInAs()` drives the REAL `@supabase/ssr` client to seat a real session in the jar, so every `createServerSupabaseClient()` in the code under test runs authenticated under real RLS. **No Supabase client / query helper / RPC wrapper is mocked.** Empirically proven: the RT regression test passes; re-adding the bug fails it with `column easa_subjects.deleted_at does not exist`.

Run locally: stack is up (docker `supabase_*_lmsplusv2`). From `apps/web/`, export `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` (local demo keys), then `npx vitest run --config vitest.integration.config.ts`.

## Phase status

- [x] **Phase 0 — harness + config + CI + first regression test.** Committed `6d9d055e`. Plan-critic ×2 (Opus, APPROVED), impl-critic (Opus, APPROVED), full post-commit fleet clean. Files: `apps/web/vitest.integration.config.ts`, `vitest.integration.setup.ts`, `tsconfig.integration.json`, `lib/integration-support/harness.ts`, `get-rt-subject.integration.test.ts`; `@repo/db/test-helpers` export; package.json scripts (`test:integration`, `check-types:integration`); `*.integration.test.ts` excluded from unit run + base tsc; CI steps in `e2e.yml`.
- [x] **Phase 1 — read-path coverage. DONE 2026-06-20.** Two commits: `21d86dc5` (+ fleet-fix `4e462cf0`) = quiz-subject-queries + exam-subjects; `ba6a378e` (+ fleet-fix `2aaf5a03`) = `lib/integration-support/fixtures.ts` (RPC-driven `seedCompletedSession`/`seedCompletedSessions`) + progress, profile, quiz-report, quiz-report-questions, reports. 32 integration tests green; `check-types:integration` clean. Each commit: impl-critic (Opus) APPROVED → full post-commit fleet → fixes → learner. Plan-critic ran coverage+stability rounds (N=2 met). Coverage map produced (~248 query sites, 8 files now covered) → **backfill epic #926 filed (P1/L)** for the remaining ~40 files. Fixtures drive the real RPC chain as the authenticated student (not admin); reads assert shape + non-vacuous RLS isolation (actor-own + pinned-detectable victim); DB-returned scores (no JS recompute); pagination + sort (non-strict monotonic) covered. **Use unique per-run suffixed codes** — never `'RT'`.
- [ ] **Phase 2 — mutation lifecycle.** quiz start→submit/check→complete; exam + internal-exam start. Assert the Server Action CONTRACT (Zod parse, error mapping, success shape) — NOT RPC internals (DB tier owns those; zero overlap).
- [ ] **Phase 3 — mechanical guards.** (a) grep guard: flag `.is('deleted_at', ...)` on the no-soft-delete table set [easa_subjects, easa_topics, easa_subtopics, quiz_session_answers, student_responses, audit_events, quiz_drafts] → lefthook + CI + own unit test. (b) red-team P2: no-restricted-imports / exports-condition guard blocking PRODUCTION import of `@repo/db/test-helpers` (getAdminClient wraps the service-role key; risk is zero today but convention-only). File the schema-aware-guard follow-up issue here.
- [ ] **Phase 4 — rule + policy + docs.** Promote column-existence guard to a general `code-style.md` §5 rule + cross-ref `agent-red-team.md`; add the HARD policy; coderabbit-sync (rules changed); Decision 46 + `docs/plan.md` section + footer; steering `tech.md` line-83 testing-tier drift (two Vitest configs now); finalize this spec. **ALSO (learner-promoted Phase 1, count=2 across `21d86dc5`+`ba6a378e`):** add a `code-style.md §7` note "In app-layer integration tests, verify every negative/isolation assertion is actually reachable given real DB semantics — three failure modes: (1) RLS already enforces the exclusion the helper re-filters → the helper's own filter is untestable via the restricted client (use service-role to test helper logic); (2) shared `beforeAll` seeding makes count-isolation one-sided → assert from BOTH actor and victim perspective; (3) a secondary bound-check (e.g. `.not.toBe(5)`) may be unreachable when the RPC uses a DISTINCT aggregate that caps the observed value below the bound → verify the leaked value is distinguishable from the expected before asserting." Then run the §7 **sweep** over the #925 integration files for similar dead/one-sided assertions, + coderabbit-sync (rules changed).

## Tracked findings to APPLY in later phases (do not lose)

- **Phase 2 (semantic-reviewer S1):** harness JSDoc — `signInAs` must be called per-test or in `beforeEach`, NOT `beforeAll` (jar resets per-test → silent RLS-empty failure otherwise). *(Empirically validated across all 7 Phase-1 suites; the JSDoc note on `harness.ts:signInAs` is the only outstanding bit.)*
- **Phase 2 (semantic-reviewer S2):** `next/navigation` redirect/notFound mock throws a plain `Error`, not an `isRedirectError()`-recognized tagged error (needs the real `NEXT_REDIRECT` digest shape). Fix when the first redirecting-action test lands so it's validated, not guessed.
- **Phase 3 (red-team P2):** the test-helpers import guard (above).
- **Phase 4 (doc-updater):** plan.md summary+footer; decisions.md Decision 46; steering tech.md line 83. Do NOT bump the packages/db integration-test count literal (this tier is separate from that suite).

## Discipline notes

- Security-path PR (touches `packages/db/src`, CI, rules) → Opus for critics/semantic-reviewer; multi-round stability floor N=3 for plan-critic.
- Per-step error-accumulator cleanup (§7) when a test has ≥2 cleanup steps; single-helper cleanup (cleanupTestData) is exempt.
- Local grant-defect after `db reset` needs `/tmp/fix-local-grants.sql` (local only; CI fine).
