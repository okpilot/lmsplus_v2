# Semantic Reviewer — Memory

> Native subagent memory index. Tracker first, durable knowledge second, topic pointers last.
> Update rows/bullets IN PLACE. No session logs — git holds history (pre-migration body: `git show 2e87c3e6:.claude/agent-memory/semantic-reviewer/patterns.md`; `git log` after).
> Scope: logic / security / RLS / query-correctness at CodeRabbit depth. Style & file-size belong to code-reviewer — don't overlap.

## Recurring Issues Tracker

> Only patterns that recurred ≥2× as distinct mechanisms are tracked. Count increments on a distinct occurrence, never a re-mention. Rows transition state, never deleted.
> Terminal-state rows (PROMOTED/RESOLVED/RESOLVED-WATCH/FALSE POSITIVE) are relocated verbatim to [tracker-archive](topics/tracker-archive.md) — retained, still counted, not deleted. Live rows below are the active (WATCHING / RULE CANDIDATE) set.

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---------|-----------|-------|-----------|---------------------|
| Client terminal path never calls a Server Action to end the DB session → orphaned `quiz_sessions` row | 2026-04 (b9829c0) | 3 | 2026-04-13 (PR #523) | RULE CANDIDATE — every terminal path MUST end/delete its DB row |
| Cross-surface answer-oracle (Study Mode `get_study_questions` shared MC pool) | 2026-06-26 (mig 135) | 1 | 2026-06-27 (14a8b9c5 EO6 hardening) | RESOLVED-WATCH → [tracker-archive](topics/tracker-archive.md) |
| Stale test comment describes a removed guard/code path — passes for the wrong reason, invites wrong re-addition (5 instances) | 2026-04 (PR #523) | 5 | 2026-06-09 (202c6fa8 #326) | WATCHING → [durable-catches](topics/durable-catches.md) |
| Test mock string drift: test mocks the ACTION (not the RPC), echoes its own stale value on rename → passes silently | 2026-04-26 (use-exam-start) | 2 | 2026-04 | WATCHING — on string rename, grep `.test.ts` for old string |
| Prop added to a type/Props but never forwarded to the consuming component (drives icon/aria-label/conditional render) | 2026 (answeredIds) | 3 | 2026 (learningObjective) | WATCHING — when a new prop drives rendering, verify ≥1 call site passes real data |
| New answer-input type may ship desktop-only submit; mobile footer submit is MC-only by default — check both paths | 2026-06-24 (dbcd3c9e #697 Phase 3) | 1 | 2026-07-02 (no gap since) | WATCHING → [vfr-rt-review-notes](topics/vfr-rt-review-notes.md) |
| Validator-family parity gap: tightening one validator without updating ALL siblings — dialog_fill/ordering | 2026-06-24 (7259b1ba #697 Phase 3) | 7 | 2026-07-02 (no gap since) | RULE CANDIDATE → [vfr-rt-review-notes](topics/vfr-rt-review-notes.md) |
| Server Action called after/unawaited-before `router.push` can cancel the pending soft-nav (App Router revalidation race) | 2026-06-01 (#568) | 2 | 2026-06-21 (#909 f1333974) | RULE CANDIDATE → [durable-catches](topics/durable-catches.md) |
| Unstable function reference in a `useEffect`/`useMemo` dep array re-runs effect unexpectedly | 2026 (PR #514) | 2 | 2026-04-13 (ea3d8d7) | WATCHING — wrap in `useCallback` or a ref |
| Client timer initialized at mount shows more time than server has (mount latency: nav+fetch+render) | 2026 | 2 | 2026-04 | WATCHING — fix = return `started_at` from start RPC, thread through SessionData. Escalate to ISSUE on next occurrence |
| Storage converter (`toSessionData`) drops new fields added to the target type but not the source type | 2026 | 2 | 2026-04 (PR #523) | WATCHING — when adding a field to SessionData, audit ALL its producers (`readSessionHandoff`, `toSessionData`) |
| Two-fixture non-vacuity (idempotency / fallback-coincidence) | 2026-06-04 (921d0c0c AQ) | 2 | 2026-07-03 (f4bdeb83 VFR-RT all-pass+part2-fail) | PROMOTED → code-style.md §7; [tracker-archive](topics/tracker-archive.md) |
| JSONB option-predicate drift: `!o.correct` (falsy) vs `o.correct !== true` — silently accepts undefined as "not correct" | 2026-06-19 (#869 session-replay) | 1 | 2026-06-19 | WATCHING → [durable-catches](topics/durable-catches.md) |
| Cross-org isolation test vacuity: empty attacker-org result satisfies `not.toContain`/0-rows trivially without an admin-verified victim row | 2026-06-04 (ad19626c BZ1) | 2 | 2026-06-13 (#818) | RULE CANDIDATE → [durable-catches](topics/durable-catches.md) |
| `.single()` in E2E audit row metadata read — throws PGRST116/406, inconsistent with sibling helpers' `data?.[0]` | 2026-06-04 (14de1723 #728) | 1 | 2026-06-04 | WATCHING → [durable-catches](topics/durable-catches.md) |
| Cross-org isolation test: seed filters by subject_id but call passes p_topic_id too — topic JOIN guard fires first, wrong-reason error branch | 2026-06-04 (7b1cf5b3) | 1 | 2026-06-04 | WATCHING → [durable-catches](topics/durable-catches.md) |
| dialog_fill practice grader partial-answer false-correct | 2026-06-21 (mig 119) | 1 | 2026-06-21 | RESOLVED → [tracker-archive](topics/tracker-archive.md) |
| BEFORE INSERT trigger + admin seed with no question_type filter — future-inserter hazard if dialog_fill lands in a seeded org | 2026-06-24 (mig 131 #828) | 1 | 2026-06-24 | WATCHING → [vfr-rt-review-notes](topics/vfr-rt-review-notes.md) |
| `expect()` inside `try` before `result=...` can leave a security-proof assertion unreached on infra failure | 2026-06-25 (1911d79d #989) | 2 | 2026-07-02 (EO-SD mirrors EN4) | RULE CANDIDATE → [durable-catches](topics/durable-catches.md) |
| Test cleanup hard-deletes `quiz_sessions` on wrong "no FK children" justification — table-level soft-delete rule applies regardless (2 files, PR #1006) | 2026-06-26 (PR #1006) | 1 | 2026-06-26 | WATCHING → [durable-catches](topics/durable-catches.md) |
| Commit message misattributes an overclaim to a PRIOR commit; it lived only in THIS commit's own draft. Detail → [durable-catches](topics/durable-catches.md#2026-09-08-relocated-rows) | 2026-09-08 (8867ccea) | 1 | 2026-09-08 | WATCHING — grep the PRIOR commit for the phrase first |
| Multi-guard RPC test proves only the guard whose fixture satisfies all pre-conditions — a threshold guard unmet by the fixture passes vacuously | 2026-06-06 (#572 BE test) | 1 | 2026-06-06 | WATCHING → [durable-catches](topics/durable-catches.md) |
| Two sequential tests share a dedup window for the same user — test 2's `delta===1` assumption fails reliably when run back-to-back in CI | 2026-06-06 (rate-limiting.spec.ts #298) | 1 | 2026-06-06 | WATCHING → [durable-catches](topics/durable-catches.md) |
| E2E seed/mutation outside `try` skips `finally` restore, poisoning downstream specs; afterAll guards must cover ALL seeded IDs | 2026-06-06 (rpc-cross-tenant BE) | 2 | 2026-06-13 (#849) | WATCHING → [durable-catches](topics/durable-catches.md) |
| Trigger body inheriting SECURITY DEFINER context omits `AND deleted_at IS NULL` on `UPDATE users` (mig 092) | 2026-06-06 (mig 092, #532) | 1 | 2026-06-06 | WATCHING → [durable-catches](topics/durable-catches.md) |
| `ON CONFLICT (cols) WHERE predicate DO NOTHING` on a non-UNIQUE index fails at runtime — mig 085 `idx_user_consents_lookup` | 2026-06-06 (mig 085 #386, a94850bb) | 1 | 2026-06-06 | WATCHING → [durable-catches](topics/durable-catches.md) |
| Attack-surface.md trigger error message drift — RAISE EXCEPTION text diverges from the string documented in attack-surface.md (mig 089 AJ) | 2026-06-06 (mig 089 #755, a94850bb) | 1 | 2026-06-06 | WATCHING → [durable-catches](topics/durable-catches.md) |
| .coderabbit.yaml rule text omits a multi-step sub-requirement (c) from the canonical docs/security.md rule | 2026-06-06 (#552, 9a728afd) | 1 | 2026-06-06 | WATCHING → [durable-catches](topics/durable-catches.md) |
| Rule edit reaches its ENFORCER incompletely — 5 instances. Detail → [prose-guards](topics/prose-guards-and-migration-numbering.md#enforcer-mirror-incompleteness--the-exceptionsuppression-clause-is-the-miss-9ab38454) | 2026-08-16 | 5 | 2026-08-20 | RULE CANDIDATE → **PROMOTE** |
| Skill-doc bucket list for status tokens omits real tokens present in attack-surface.md — silent mis-bucketing | 2026-06-08 (#114, 8cdc114a) | 1 | 2026-06-08 | WATCHING → [durable-catches](topics/durable-catches.md) |
| attack-surface.md durable-lesson gap note not purged when the fix lands — contradicts the updated matrix row | 2026-06-10 (aed96dacb PR #831) | 1 | 2026-06-10 | WATCHING → [durable-catches](topics/durable-catches.md) |
| attack-surface.md literal-count drift: spec-header count vs ED/BT matrix row count describe different scopes | 2026-06-19 (#902, branch redteam/902) | 1 | 2026-06-19 | WATCHING → [durable-catches](topics/durable-catches.md) |
| Isolation test labeled "two-sided" but only proves one side — no Org B perspective asserted, adds no signal over the existing functional test | 2026-06-20 (21d86dc5 #925) | 1 | 2026-06-20 | WATCHING → [durable-catches](topics/durable-catches.md) |
| Rule/memory text cites branch-local commit hashes unreachable after squash/rebase | 2026-06-21 (feat/925-phase4 code-style.md §7) | 2 | 2026-09-06 | RULE CANDIDATE (2) → durable-catches |
| Forward-reference in prose ("not yet recorded") goes stale when a LATER commit fulfills it | 2026-09-06 (chore/promote-agent-selfreport-rule) | 1 | 2026-09-06 | WATCHING → [durable-catches](topics/durable-catches.md) |
| RPC DROP+recreate skips sibling guard-set diff + types.ts/database.md sync | 2026-06-21 (mig 118, #697) | 2 | 2026-06-21 (PR-sweep gap) | WATCHING → [vfr-rt-review-notes](topics/vfr-rt-review-notes.md) |
| Command doc adds a HARD STOP without terminating the /goal session — potential loop in autonomous runs | 2026-07-11 (de72a4df) | 1 | 2026-07-11 | WATCHING — a HARD STOP branch must declare the alt terminal state + `/endrun` |
| RPC idempotent-replay branch returns ANOTHER request's row id; caller uses it as a teardown target | 2026-08-07 (14d68479) | 1 | 2026-08-07 | WATCHING — a replay-derived id needs a `created` flag before scoped teardown |
| Agent-memory frozen-dir policy added to multiple memories but a topic file retained "grep both dirs" | 2026-07-11 (3827d7b7) | 1 | 2026-07-11 | WATCHING — on a dir-policy change, grep ALL agent-memory topic files, not just MEMORY.md |
| New content class excluded from ONE surface, not its aggregate siblings — KPIs shift silently | 2026-08-11 (1abdb50d) | 1 | 2026-08-11 | WATCHING → [tracker-archive](topics/tracker-archive.md#vfr-rt-part-1-content-import--2026-08-11-1abdb50d7bbcadd3) |
| Comment names a rule/symbol a LATER commit retired — a PARTIAL edit is the tell. Detail → [prose-guards](topics/prose-guards-and-migration-numbering.md) | 2026-08-15 | 23 | 2026-09-09 (aa10d2b5) | RULE CANDIDATE → **PROMOTE**: grep tree-wide, re-verify by diff |
| Unmeasured numeric claim in commit prose, never grep'd, wrong every time. Detail → [durable-catches](topics/durable-catches.md#2026-09-08-relocated-rows) | 2026-09-06 (`2e4cf2a3`) | 3 | 2026-09-06 | RULE CANDIDATE — `grep -c` before writing a number |
| Local-clock date stamped while UTC is still the PRIOR day. Detail → [prose-guards](topics/prose-guards-and-migration-numbering.md#local-clock-0200-date-stamped-while-utc-is-still-the-prior-day) | 2026-08-19 (e65f01f4) | 1 | 2026-08-19 | WATCHING |
| Rule-mirror sweep closes N-1 of N; Nth fix left UNCOMMITTED. Detail → [durable-catches](topics/durable-catches.md#2026-09-08-relocated-rows) | 2026-08-19 (e65f01f4) | 2 | 2026-08-20 (57c3b452) | RULE CANDIDATE — read the COMMIT, never the checkout |
| NULL natural key escapes a PARTIAL unique index. Detail → [tracker-archive](topics/tracker-archive.md#vfr-rt-part-1-content-import--2026-08-11-1abdb50d7bbcadd3) | 2026-08-11 (1abdb50d) | 1 | 2026-08-11 | WATCHING — validate non-null first |
| Authoring gate argues from STORED order on a SHUFFLED surface. Detail → [prose-guards](topics/prose-guards-and-migration-numbering.md#authoring-gate-argued-from-stored-order-on-a-shuffled-delivery-surface) | 2026-08-18 (b28cc604) | 1 | 2026-08-19 (fixed) | WATCHING |
| Tracker-row parenthetical reuses one ordinal for two axes — reads as contradiction. Detail → [durable-catches](topics/durable-catches.md#2026-09-08-relocated-rows) | 2026-09-02 (83fb2c61) | 1 | 2026-09-02 | WATCHING — state which axis it counts |
| Agent `## Inputs` not updated when a rule file adds a new input. Detail → [durable-catches](topics/durable-catches.md#2026-09-08-relocated-rows) | 2026-09-06 (1b4ee552) | 1 | 2026-09-06 | WATCHING — update `## Inputs` in the same commit |
| Commit message describes a copy as "moves X INTO Y" — source shows no deletion. Detail → [durable-catches](topics/durable-catches.md#2026-09-08-relocated-rows) | 2026-09-06 (`43b1b9a5`) | 1 | 2026-09-06 | WATCHING — verify the diff shows a deletion |
| SHA cited as introducing X refers to a different commit. Detail → [durable-catches](topics/durable-catches.md#2026-09-08-relocated-rows) | 2026-09-07 (`092fab98`) | 1 | 2026-09-07 | WATCHING — `git log --oneline <sha> -1` first |
| Verified WHEN a mechanic arrived, not whether one preceded it. Detail → [durable-catches](topics/durable-catches.md#2026-09-08-relocated-rows) | 2026-09-07 (`d58572c8`) | 1 | 2026-09-07 | WATCHING |
| Evidence block verifies the WRONG proposition (3 instances). Detail → [durable-catches](topics/durable-catches.md#2026-09-08-relocated-rows) | 2026-09-07 | 3 | 2026-09-07 | WATCHING |
| Protocol split: examples removed from rules file, not added to agent file. Detail → [durable-catches](topics/durable-catches.md#2026-09-08-relocated-rows) | 2026-09-07 | 1 | 2026-09-07 | WATCHING |
| Pipeline test proved spec↔disk closure but no anchor for non-agent hook commands. | 2026-09-07 (7eaef31a PR #1268) | 1 | 2026-09-07 | RESOLVED same PR — `spec.hooks` compares every command exactly |

## Durable knowledge

### Security / RLS / SECURITY DEFINER (highest-value catches)
- **Column-level GRANT for privilege reduction** (REVOKE table UPDATE → GRANT UPDATE(<safe cols>); SECURITY DEFINER RPCs unaffected; migs 20260521000004 + 20260605000001) → [topics/security-definer-and-grants.md](topics/security-definer-and-grants.md)
- **SECURITY DEFINER bypasses RLS** — manual `AND deleted_at IS NULL` on every SELECT incl. audit-INSERT subqueries (§9/§10); cached-role and resource-lookup-removal exceptions → [topics/security-definer-and-grants.md](topics/security-definer-and-grants.md)
- **Multi-permissive SELECT trap:** Postgres ORs permissive policies; a per-caller RPC must self-scope `WHERE owner = auth.uid()` (see tracker). Admin RPCs behind `is_admin()` are exempt.
- **RPCs must self-defend** — Zod at the boundary isn't enough; the RPC is directly callable. Validate JSONB array length, sum invariants, UUID validity inside the function.
- **`REVOKE EXECUTE ... FROM PUBLIC` alone is INSUFFICIENT on Supabase** — must name `PUBLIC, anon, authenticated` (ALTER DEFAULT PRIVILEGES is a separate grant); gap invisible locally → [topics/security-definer-and-grants.md](topics/security-definer-and-grants.md)
- **Correct-answer exposure:** student-facing reads must go through `get_quiz_questions()`/report builders that strip `correct` from options. Watch new Server Actions querying `questions.options` directly.
- **Auth-then-validate order:** parse Zod input is fine to throw, but auth check (`auth.uid()`) must gate before any DB work; flag `Schema.parse(input)` placed before the auth check.
- **`.single()` → `.maybeSingle()`** for user/profile lookups where soft-delete yields 0 rows (`.single()` throws PGRST116 as a service error).
- **Trace `CREATE OR REPLACE FUNCTION` to the latest definition** first (agent-critic.md). `supabase/migrations/` is SOLE source of truth since 2026-07-11; `packages/db/migrations/` is FROZEN — never cite it.

### Query / data correctness → [durable-catches](topics/durable-catches.md)

### React / Next.js correctness → [durable-catches](topics/durable-catches.md)

### Test-quality catches → [durable-catches](topics/durable-catches.md)

### Security-gate (bash hook) patterns → [durable-catches](topics/durable-catches.md)

### Process → [durable-catches](topics/durable-catches.md)

## Topic pointers
- [tracker-archive](topics/tracker-archive.md) — relocated verbatim terminal-state tracker rows (PROMOTED/RESOLVED/FALSE POSITIVE), still counted.
- [durable-catches](topics/durable-catches.md) — relocated durable bullets (#948): Security-gate, Test-quality, Process, Query/data correctness, React/Next.js correctness.
- [pr-697-phase-a](topics/pr-697-phase-a.md) — PR-level sweep findings for #697 Phase A: cross-commit doc drift in the `complete_overdue_exam_session` detail section.
- [vfr-rt-review-notes](topics/vfr-rt-review-notes.md) — VFR-RT (#697) do-not-flag facts: `complete_overdue/empty` mode guards include `vfr_rt_exam` (mig 102), `normalize_answer` apply-order, PG17 `NULLS NOT DISTINCT`, `ON CONFLICT DO NOTHING` on `student_responses`.
