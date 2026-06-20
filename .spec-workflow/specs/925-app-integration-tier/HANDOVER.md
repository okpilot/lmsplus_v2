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
- [ ] **Phase 1 — read-path coverage.** lib/queries read helpers: progress, profile, quiz-report(+questions), quiz-subject-queries, reports(pagination), exam-subjects. Seed → signInAs → real helper → assert shape + RLS scoping. **Use unique per-run subject codes** (suffixed) — never collide with reference/seed data (the spike's RT upsert-collision lesson). The RT test is the ONE exception (reads canonical `code='RT'`).
- [ ] **Phase 2 — mutation lifecycle.** quiz start→submit/check→complete; exam + internal-exam start. Assert the Server Action CONTRACT (Zod parse, error mapping, success shape) — NOT RPC internals (DB tier owns those; zero overlap).
- [ ] **Phase 3 — mechanical guards.** (a) grep guard: flag `.is('deleted_at', ...)` on the no-soft-delete table set [easa_subjects, easa_topics, easa_subtopics, quiz_session_answers, student_responses, audit_events, quiz_drafts] → lefthook + CI + own unit test. (b) red-team P2: no-restricted-imports / exports-condition guard blocking PRODUCTION import of `@repo/db/test-helpers` (getAdminClient wraps the service-role key; risk is zero today but convention-only). File the schema-aware-guard follow-up issue here.
- [ ] **Phase 4 — rule + policy + docs.** Promote column-existence guard to a general `code-style.md` §5 rule + cross-ref `agent-red-team.md`; add the HARD policy; coderabbit-sync (rules changed); Decision 46 + `docs/plan.md` section + footer; steering `tech.md` line-83 testing-tier drift (two Vitest configs now); finalize this spec.

## Tracked findings to APPLY in later phases (do not lose)

- **Phase 2 (semantic-reviewer S1):** harness JSDoc — `signInAs` must be called per-test or in `beforeEach`, NOT `beforeAll` (jar resets per-test → silent RLS-empty failure otherwise).
- **Phase 2 (semantic-reviewer S2):** `next/navigation` redirect/notFound mock throws a plain `Error`, not an `isRedirectError()`-recognized tagged error (needs the real `NEXT_REDIRECT` digest shape). Fix when the first redirecting-action test lands so it's validated, not guessed.
- **Phase 3 (red-team P2):** the test-helpers import guard (above).
- **Phase 4 (doc-updater):** plan.md summary+footer; decisions.md Decision 46; steering tech.md line 83. Do NOT bump the packages/db integration-test count literal (this tier is separate from that suite).

## Discipline notes

- Security-path PR (touches `packages/db/src`, CI, rules) → Opus for critics/semantic-reviewer; multi-round stability floor N=3 for plan-critic.
- Per-step error-accumulator cleanup (§7) when a test has ≥2 cleanup steps; single-helper cleanup (cleanupTestData) is exempt.
- Local grant-defect after `db reset` needs `/tmp/fix-local-grants.sql` (local only; CI fine).
