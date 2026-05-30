# Learner Agent — Memory

> Cross-agent pattern synthesis + false-positive frequency tracking.
> Governed by `.claude/rules/agent-memory.md`. **Update rows IN PLACE — never append a dated session log.** History lives in git (`git log -p -- .claude/agent-memory/learner/`).
> Migrated 2026-05-29 from the 6606-line append-only `patterns.md` journal. The pre-migration body is recoverable via git.

## Issue Frequency Tracker (live — count≥2)

Curated VIEW of the count≥2 rows. **The fuller record (the pre-migration tracker + the 2026-05-28/29 late-cycle rows) lives in `topics/tracker-archive.md`; the complete original journal is in git at `2e87c3e6`.** Counts drive rule-promotion (≥2) and the Sweep-On-Rule-Promotion trigger (`agent-learner.md`). Rows transition state, never deleted (`agent-memory.md`). Schema: `Issue Type | Count | Last Seen | Status`. A count≥2 row still marked "Watch" is rendered RULE CANDIDATE here per the state machine; its original wording is preserved in the archive.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Test fixture shape mismatch (wrong/missing field in fixture object) | 2 | 2026-03-13 | RULE CANDIDATE — both caught pre-commit by type-check; derive fixture shapes from the exported TS type, not by hand |
| Hook file exceeding 80-line limit | 4 | 2026-03-13 | RULE EXISTS → code-style.md §1 — still recurring despite 70-line watch; use-quiz-state.ts hit 117 lines, fixed by hook split |
| New hook/utility file shipped without a test file | 3 | 2026-03-12 | RULE ADDED → code-style.md §7 — rule exists but not followed at write time; see also count-7 row below |
| Bare `catch {}` without error-type narrowing | 2 | 2026-04-08 | RULE CANDIDATE → code-style.md §6 — swallowed redirect() from requireAdmin → 500; catch in Server Components must re-throw isRedirectError() |
| Supabase mutation result not destructured (error silently dropped) | 3 | 2026-03-12 | RULE EXISTS → code-style.md §5 — 5 new call sites in Sprint 3 analytics; compliance gap, rule is clear |
| useEffect data fetching in client component (not hydration guard) | 3 | 2026-03-13 | RULE EXISTS → code-style.md §6 — 3rd: statistics-tab.tsx extracted to hook; compliance gap |
| Inconsistent guard between related RPCs (sibling missing guard) | 2 | 2026-03-14 | RULE CANDIDATE — auth.uid() guard + NULL correct_option guard each added to one RPC, missed sibling; audit all siblings in same commit |
| Partial fix applied to sibling file group (cross-cutting concern) | 5 | 2026-04-14 | RULE CANDIDATE (count 5, active) — fix applied to the instance seen, not all instances in file + siblings; grep all sites before commit |
| useTransition + manual loading state hybrid fragility | 2 | 2026-03-13 | RULE CANDIDATE — isPending + manual isLoading can both be false mid-fetch, flashing idle button; suggestion-level, not yet fixed |
| Silent numeric fallback without observability logging | 2 | 2026-03-13 | RULE CANDIDATE — fallback to 0/min on empty/malformed data with no server signal; always console.warn before the fallback value |
| test-writer produces TS2532 (unchecked array index) errors | 3 | 2026-03-23 | RULE IN MEMORY → test-writer/MEMORY.md §Array index safety — agent generates wrong form first; fix cycle is the gate |
| Direct SELECT from `questions` bypassing RPC (answer exposure) | 2 | 2026-03-13 | RULE EXISTS → security.md rule 1 / CLAUDE.md — checkAnswer queried correct flag; fixed via check_quiz_answer RPC; compliance gap |
| Query missing student_id scope (returns wrong student's data) | 2 | 2026-03-15 | RULE CANDIDATE → security.md (propose on 3rd) — auth check ≠ ownership scoping; student-owned tables must scope to student_id |
| UI event handler missing re-entry guard (double-fire) | 2 | 2026-03-16 | RULE CANDIDATE — async lock + event-propagation mechanisms; any close/submit action must be audited for re-entry at authoring time |
| UPDATE returning zero rows treated as success (silent no-op) | 2 | 2026-03-20 | RULE CANDIDATE → code-style.md §5 — ownership-scoped DELETE/UPDATE must `.select('id')` + check row count before returning success |
| Error path in existing function untested (count-error branch) | 4 | 2026-04-14 | RULE CANDIDATE (count 4) — new edge/error branches added to existing tested files lack test updates in the same commit; caught post-commit |
| Type cast bypassing runtime validation (`as unknown as T` no guard) | 2 | 2026-03-13 | RULE ADDED → code-style.md §5 + .coderabbit.yaml — pair `as unknown as T` with a runtime type guard |
| New hook/utility file extracted without shipping tests in same commit | 7 | 2026-03-27 | RULE EXISTS → code-style.md §7 — 7th recurrence; authoring habit absent; code-reviewer BLOCKING + test-writer is the reliable gate |
| Derived value correct by coincidence (index used as count proxy) | 2 | 2026-03-13 | RULE CANDIDATE — value co-varies with metric but diverges on edge cases; use a dedicated state var incremented at the domain event |
| consoleSpy created without try/finally cleanup (spy leaks on failure) | 3 | 2026-03-14 | RULE ADDED → test-writer/MEMORY.md — always wrap consoleSpy in try { } finally { consoleSpy.mockRestore() } |
| Red-team spec written against wrong schema column / RPC signature | 2 | 2026-03-14 | RULE CANDIDATE → red-team agent (on 3rd) — specs written from memory; always read the migration file before writing DB assertions |
| Auth callback guard ordering error (guards in wrong order → bypass) | 2 | 2026-03-17 | RULE CANDIDATE — session actions must precede existence/registration checks; all post-session failure paths must signOut() before redirect |
| test-writer generates deprecated vi.fn generic syntax (two-arg form) | 2 | 2026-03-15 | RULE ADDED → test-writer/MEMORY.md — correct form `vi.fn<(arg: A) => R>()` (single function-type arg, Vitest v4) |
| Supabase SELECT error swallowed in auth helper (distinct from mutation) | 2 | 2026-03-15 | RULE CANDIDATE → code-style.md §5 (extension) — auth-path SELECTs must destructure `{ data, error }` and log before the guard decision |
| Zod error message pinned to exact internal text | 2 | 2026-03-16 | RULE CANDIDATE — Zod internal messages aren't public API; assert `error instanceof ZodError` or `.issues[0].code`, never `.message` |
| Defensive fix for race/stale-state that does not materialize today | 2 | 2026-04-26 | RESOLVED (intentional hardening) — mirror parent invariant in child render guard/effect; deliberate hardening, not unclear spec |
| Turbo type-check cache masking new compile errors after dep bumps | 3 | 2026-03-17 | RULE APPLIED → CLAUDE.md — run `pnpm check-types --force` after dep bumps; 3rd occurrence confirms rule pre-empted the issue |
| Missing `setSubmitting(true)` before async call in form/button handler | 2 | 2026-04-27 | RULE CANDIDATE → code-style.md (on 3rd) — set loading state before awaiting, not after; applies to all form handlers |
| Actor-role subquery missing `deleted_at` filter in mutation audit path | 3 | 2026-04-27 | PROMOTED → security.md §10 (count 3) — every audit_events INSERT subquery must filter deleted_at IS NULL on user/session FK lookups |
| Idempotent RPC returns hardcoded values instead of reading DB state | 2 | 2026-04-27 | RULE CANDIDATE — replay paths returned hardcoded pass/100% instead of querying config; idempotent replay must read current DB state |
| Code-reviewer flags file outside the commit diff scope | 2 | 2026-04-08 | RULE CANDIDATE → agent-code-reviewer.md (false positive) — agent scans full file; only flag violations on lines in the diff |
| Pre-existing file-size violation surfaced when commit adds lines to over-limit file | 2 | 2026-04-11 | RULE CANDIDATE — file at/over limit must be split in the same additive commit, not deferred; distinct from Biome-expansion case |
| Function exceeding 30-line limit in Server Action file | 3 | 2026-04-10 | RULE CANDIDATE (count 3) → code-style.md §3 — extract row-transform/business logic as named `mapXxxRow()` helper; existing gate working |
| Hook file exceeding 80-line limit | 5 | 2026-03-23 | RULE EXISTS → code-style.md §1 — use-quiz-config.ts at 110 lines; hooks grow incrementally; post-commit code-reviewer is the catch |
| ZodError escaping Server Action via parse() without try/catch or safeParse | 2 | 2026-03-26 | RULE CANDIDATE → code-style.md — use `Schema.safeParse()` (or wrap `.parse()` in try/catch) so invalid input returns a typed error |
| Hardcoded constant values in tests instead of importing source constants | 3 | 2026-05-29 | RULE CANDIDATE → test-writer/MEMORY.md — import production constants, never duplicate literal values that drift on rename; broader mock-definition variant recurred 2026-05-29 (#668) |
| New test file shipped without vi.resetAllMocks() in beforeEach | 2 | 2026-03-27 | PROMOTED → test-writer/MEMORY.md §Mock patterns — rule exists; compliance gap at authoring time; semantic-reviewer is the gate |
| test-writer generates tests needing jsdom-compat fixes before they pass | 3 | 2026-03-29 | RULE IN MEMORY → test-writer/MEMORY.md — TS2532 / vi.fn syntax / PointerEvent jsdom gaps; fix cycle is the reliable gate |
| CodeRabbit false-positive rate elevated on exam-mode PRs | 2 | 2026-04-14 | RULE CANDIDATE → .coderabbit.yaml — CR lacks project context (hard-delete exceptions, DB-level constraints); consider suppression notes |
| TS strict mode requires `!` non-null assertion on array index in test files | 2 | 2026-04-11 | RULE IN MEMORY → test-writer/MEMORY.md §Array index safety — assert `arr[0]!` after `toHaveLength(N)`; pre-commit tsc is the catch |
| audit-actor-subquery-soft-delete (audit_events INSERT subqueries missing deleted_at) | 3 | 2026-04-27 | PROMOTED → security.md §10 (count 3) — same pattern as the actor-role row; INSERT INTO audit_events must filter deleted_at on FK lookups |
| Manual-eval bug invisible to unit tests (dual-source UI only in full app) | 2 | 2026-04-28 | RULE CANDIDATE → code-style.md §7 (extends Refresh/Reload) — dual server+client surfaces need an integration/E2E test mounting both |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (promotion deferred — both in same file/migration, not distinct mechanism) — payloads.ts notes drift after guard swap |
| Server Action ERROR_MESSAGES not synced with new RPC `RAISE EXCEPTION` literals | 2 | 2026-05-07 | RULE CANDIDATE (held for 3rd in a different RPC/Action family; sweep would push defer-budget to red) — UX gap, generic fallback message |
| security.md §11 vs docs/security.md §3 section-number mismatch | 3 | 2026-05-28 | RULE PROMOTION — cross-reference section numbers between the security.md quick-summary and docs/security.md don't align; clarify in security.md (first 2026-05-26 #540) |
| Missing caller-level page-error test on pagination | 2 | 2026-05-29 | RULE PROMOTION → code-style.md §7 — paginated query reads need a caller-level page-error test (first 2026-05-28 #681) |
| Internal-symbol test-title leakage | 3 | 2026-05-29 | RULE ACTIVE → code-style.md §7 (promoted 2026-04-28) — recurrence after promotion; monitor, no rule change |

## Durable knowledge (cross-agent)

- This agent does cross-agent synthesis + owns **false-positive frequency tracking** — see `topics/cross-agent-lessons.md` for the FP catalog and the full rule-promotion record.
- A count reaches promotion threshold at **2 distinct mechanisms** across different commits; same-file/same-migration repeats are NOT distinct (several count=2 rows above are held below promotion for this reason — noted inline).
- On any rule promotion, schedule the **Sweep-On-Rule-Promotion** (`agent-learner.md`): fix or file issues for ALL existing offenders, not just the triggering sites (lesson from issue #573).
- The biggest recurring defect class is **partial fix to a sibling-file group** (tracker count 5) — always grep all instances of a pattern in the file AND sibling files before committing.

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — durable rule-promotion record, false-positive catalog, recurring meta-lessons.
- [tracker-archive](topics/tracker-archive.md) — full tracker record (pre-migration rows + the 2026-05-28/29 late-cycle reconciliation); the complete original journal is in git at `2e87c3e6`. The live table above is a count≥2 view of this archive. **Before adding a NEW tracker row, grep `topics/tracker-archive.md` for the pattern — if it exists there, increment that row and lift it back into the live table instead of creating a duplicate.**
