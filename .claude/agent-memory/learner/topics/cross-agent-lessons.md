# Learner — Durable Cross-Agent Lessons

> Stable, load-bearing synthesis the learner relies on across cycles. Referenced on demand from `MEMORY.md`.
> Per-cycle session narrative is NOT here — it lives in git history of the old `patterns.md`.

## Rule promotions the learner has driven (durable record)

These reached the count≥2 threshold and were promoted to hard rules. They anchor the tracker rows that show `PROMOTED → <loc>`.

- **audit-actor-subquery-soft-delete** → `security.md §10`. Every `INSERT INTO audit_events` subquery must filter `deleted_at IS NULL` on FK lookups (actor_id, actor_role, session-derived). Promoted at count=3 (#550 batch_submit_quiz, complete_empty_exam_session, cross-ref 8782a18). **Sweep caveat:** when promoted, `start_quiz_session`'s audit subquery was initially missed (issue #573) — always sweep ALL instances on promotion, not just the triggering sites.
- **Type cast `as unknown as T` without runtime guard** → `code-style.md §5` + `.coderabbit.yaml`. Pair every cast with `Array.isArray`/`typeof` narrowing.
- **Router-navigation mock asserted without URL** → `code-style.md §7` (Assert URL on Router-Navigation Mocks) + agent checklist `flag-router-mock-no-url`. From 2026-04-27; existing tests migrated as touched.
- **Feature mode flag tested as toggle, not full lifecycle** → `code-style.md §7` (Lifecycle Integration Test for New Feature Modes) + `flag-mode-flag-no-lifecycle`.
- **Stateful UI shipped without reload/recovery test** → `code-style.md §7` (Refresh/Reload Test for Stateful UI) + `flag-stateful-flow-no-reload`.
- **Internal-symbol test-title leakage** → `code-style.md §7` disallowed-title table (promoted 2026-04-28 after PR #523 rounds 9–11). RULE ACTIVE.
- **E2E spec hermiticity (shared-seed mutation without afterEach restore)** → `code-style.md §7` (promoted at count=2, issue #587 admin-questions.spec.ts).
- **Turbo type-check cache masking errors after dep bumps** → `CLAUDE.md`: run `pnpm check-types --force` after any dep-bump commit. Confirmed working (3rd occurrence pre-empted).
- **`.claude/rules/security.md §11` vs `docs/security.md §3` section-number mismatch** → count=3 (#540, #682, #678/#679); **RULE PROMOTION warranted** — add a Cross-Reference Note to the top of `.claude/rules/security.md` instructing citers to use rule *titles* not local §numbers. (This is the §-numbering note now present in `.claude/rules/security.md`.)
- **Missing caller-level page-error test on pagination** → count=2 (#681, #668-7); RULE PROMOTION — every paginated read needs a caller-level error-path test.
- **SECURITY INVOKER RPC over Multiple Permissive RLS SELECT policies** → `docs/security.md §3` / `.claude/rules/security.md §11`. Promoted at count=1 by severity (red-team BW3 / #540 — instructor caller saw all org students). Any INVOKER RPC reading a table with dual student/admin permissive SELECT policies (student_responses, quiz_sessions, exam_configs, audit_events) MUST add explicit `WHERE owner = auth.uid()`.

## False-positive catalog (don't re-chase these)

The learner owns FP frequency tracking. These are confirmed false positives; validate before re-acting.

- **Semantic-reviewer race-condition claims on Postgres server-side state (count 2, escalated).** Reviewer doesn't model transaction-stable `now()` + `FOR UPDATE` row locks; claims that inverse predicates "could both fire in one transaction." Before accepting any race claim on an RPC, check isolation level + `now()` usage — predicates evaluate once at transaction start.
- **Code-reviewer flags file outside the commit diff scope (count 2).** Flags pre-existing over-limit functions/files in touched-but-unchanged code. Suppression exists in `agent-code-reviewer.md` ("only flag violations introduced/worsened by `+` lines"); agent doesn't always apply it.
- **`isRedirectError` re-throw misapplied to client components.** The `code-style.md §6` rule is Server-Component-only. A `'use client'` component calling a Server Action via `startTransition` cannot intercept `redirect()` as a thrown exception — redirect flows through the response stream. No re-throw needed there.
- **Semantic-reviewer "column/table does not exist" claims.** Reviewer's scan can miss an earlier migration (e.g. claimed `quiz_sessions.deleted_at` absent — added in mig 023). Verify against `supabase/migrations/` before acting.
- **implementation-critic "duplicate JSX guard".** Mistook a `{canDismiss && (...)}` render-guard block for a duplicate of an event-handler-conditional button. They were distinct.
- **CodeRabbit false-positive rate elevated on exam-mode PRs (count 2).** CR lacks project context — flags immutable-table warnings on ephemeral tables, DB-level constraints that make app guards redundant, intentionally-absent recovery logic. Consider `.coderabbit.yaml` suppression notes for these categories.
- **`@ts-expect-error` on easa_* `.insert()` (still needed).** @supabase/ssr 0.9.0 fixed quiz_drafts inference but easa_* generated type chain still resolves to `never` on Insert. Suppressions are documented and validated as still-required — don't flag as dead.

## Recurring meta-lessons

- **Partial fix to a sibling-file group is the most frequent defect class (count 5, RULE CANDIDATE).** Fix is applied to the one instance seen, not all instances of the same call/pattern in the same file + sibling files. The grep-all-instances approach (CLAUDE.md) is the required mitigation.
- **New hook/utility extracted without co-located tests (count 7-8, rule exists, code-style.md §7).** Persistent authoring-habit gap; code-reviewer BLOCKING + test-writer backfill is the reliable gate.
- **Pre-Push PR Sweep earns its cost.** Cumulative full-PR semantic review repeatedly catches cross-file consistency gaps (proxy.ts 4xx/5xx header parity, doc cross-reference drift, RPC security-note drift) that per-commit passes miss because each commit alone looks clean.
- **test-writer generates jsdom/TS-strict-incompatible tests first (count 3, rule in test-writer memory).** TS2532 array-index, deprecated `vi.fn` generic, PointerEvent jsdom gaps — all need a fix cycle. The fix cycle is the reliable gate; no code-style change needed.
- **Idempotent RPCs must read current DB state on replay, not return hardcoded values (count 2, RULE CANDIDATE).**
- **Migration `CREATE OR REPLACE` on a SECURITY DEFINER function silently revokes EXECUTE.** Always re-state `GRANT EXECUTE ... TO authenticated` after.
- **Count semantics:** a tracker count increments only for a *distinct mechanism/occurrence* (per `agent-memory.md`), not a re-mention of the same one. Several count=2 rows below are same-file/same-migration and were deliberately held below promotion despite the raw count.
- **Verify the issue premise before implementing (process win, 2026-06-06, #471):** Issue #471 described a JS mass-transfer O(n) performance problem in `get_session_reports`; the proposed fix was a set-based SQL aggregate. Root-cause analysis revealed the JS loop was already gone (fixed in a prior sprint) — the root cause was dead data (`answered_count` column still in the migration but no longer computed correctly by the RPC). The right fix was removing the dead column, not adding a new aggregate. Lesson: before implementing any fix from a backlog issue, verify the issue's described root cause still exists in the current codebase. A 10-minute exploration subagent prevents implementing the wrong solution. This maps to the existing Plan Validation step "Root cause check (is the described fix the RIGHT fix?)" in `agent-workflow.md` — #471 confirms the check is load-bearing even for performance issues with an "obvious" solution.
