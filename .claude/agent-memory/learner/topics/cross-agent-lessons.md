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
- **Comment/doc asserts behaviour the code does not implement** → `code-style.md §10`, broadened from DB/RPC-only to general comment accuracy; +2 clauses added: never propagate a claim forward from another doc (re-derive from code), and a partial comment edit is the tell. Promoted 2026-08-15 at count=10, all distinct surfaces in one branch: a migration GRANT comment; a `docs/database.md` grant-mirror claim (sharpest — a plan read the wrong doc line and nearly widened a live GRANT to `anon`); a fuzzy-match threshold comment; a swap-reduction comment; a cross-function "called by" claim; a partially-edited CSS comment (later paragraphs updated for an extraction, header left crediting the old file); a RAISE-count comment ("14 distinct tokens (19 raise sites)") invalidated by two added RAISEs; a `CLAUDE.md` paragraph miscounting its own session's commits (said three, was four); an importer JSDoc promising a rollback invariant the code cannot honour; a docblock citing retired validator rules R2/R4.
- **Reviewer/CR finding's factual premise accepted without verification, later disproven** → `agent-workflow.md § Finding Validation`, new sub-bullet naming cheap-to-verify claim classes (prod state, file new-vs-modified, call-graph, changed-failure-mode). Promoted 2026-08-15 at count=3: a new PRODUCTION-WRITE code path (`--sync-content`) was designed around a semantic-reviewer claim that prod served a stale answer key — a read-only prod probe showed prod already matched the file; a CR claim that a helper "changed the failure mode" from abort to silent-wrong, when the old body coalesced identically and never aborted (conclusion still right, mechanism wrong); a claim that a test file was "new" with "+18 tests" when it was modified with a real delta of 8.
- **Test passes for the wrong reason — a second, unrelated guard reaches the same result first** → `code-style.md §7`, general vacuity principle added above the two existing sub-rules; recommended proof is to revert the production change and watch the test fail. Promoted 2026-08-15 at count=4: four digit-rule fixtures whose tokens were ≤4 chars, so an unrelated length floor rejected them and deleting the digit rule kept them green; a budget fixture using `cleared to land` where `land` is 4 chars, same masking; a resume assertion that passed with the fix reverted because the mock never declared the prop under test; two REVOKE tests asserting only `error != null`, which a misspelled RPC name also satisfies.

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

- **Convergent "not mechanically enforceable" verdicts from two agents = classification signal** (text-only rule), not a coderabbit-sync gap.
- **code-style.md §10 covers RLS POLICY migrations too**, not only `CREATE OR REPLACE FUNCTION` (verified in implementation-critic/MEMORY.md 3→4, #1167).
- **Two independent reviewers converging on the SAME finding in the SAME cycle is a reliability signal, not a scope-overlap violation.** PR #1207 cycle 3 (2026-08-17): semantic-reviewer and code-reviewer independently flagged the same false `use-session-recovery.ts` exemption claim in a comment — semantic-reviewer via logic/invariant correctness, code-reviewer via §10 comment-accuracy. CLAUDE.md's "zero overlap" rule governs each agent's *primary scope* (style vs. logic); it does not forbid two agents reaching the same conclusion from different lenses on the same defect. Treat independent convergence as higher-confidence than either finding alone — do not re-triage it as duplicate work.
- **"Hand-maintained enumeration is a recurring defect shape" now has instances in TWO independent domains, not one.** `agent-workflow.md § Rule-Mirror Sync` (PROMOTED) named it for cross-FILE mirror lists (wrong 3 rounds running, PR #1174). `topics/tracker-archive.md` row 534/this-cycle (RULE CANDIDATE, count=2) names the same shape for an IN-FILE call-site/guard list (wrong 3 times in one session, PR #1207 — `use-active-practice-discard.ts`). Both times the eventual fix was structural (route through one shared thing + grep for it), not a better enumeration. Worth treating "does this comment/doc enumerate N things by name" as itself a smell during any code-style.md §10 review, regardless of which specific tracker row is at count.
- **code-style.md §10 (comment/doc asserts behaviour the code doesn't have) continues recurring post-promotion (count=10 → this cycle is further evidence, not yet re-tallied as a new instance since the false `use-session-recovery.ts` invariant claim is the same general class already covered).** No rule-text gap — §10 already says what's needed. The gap is enforcement depth: a comment claiming an architectural invariant ("every clear on an earlier snapshot goes through the helper") with a per-file exemption list is exactly the enumeration-fragility pattern above, one layer up (the exemption reasoning itself, not just the file list, was fabricated).

- **Mutation testing is the cheapest proof a test pins its mechanism.** Delete the production guard, watch the test go red, restore. Applied on content/vfr-rt-part3 to resolve a dead-branch lifecycle test (`assertReleasedForRemote` — every shipped file was `released`, so the throw was unreachable; suite stayed green when the throw was deleted; fixed with a per-row counterfactual that now fails 7 rows). Also resolved §10 stale-evidence assertions and digest-sharing pins in the same branch. Prefer this empirical proof over reasoning about test coverage when the mechanism is non-obvious.
- **§10 sub-pattern — evidence cited must postdate the code it certifies (RULE CANDIDATE, count=2, 2026-08-18).** A build artifact, grep result, or verification log timestamped BEFORE the last relevant change certifies the old state, not the new one. content/vfr-rt-part3 fixup chain: (a) a comment claimed a label string was "verified absent from the production chunk" — the only build on disk was 17 h old, predating the fix; (b) the memory note recording (a) then cited that same pre-fix chunk as its evidence, certifying the new code against the code it deleted. Proposed §10 sub-clause: "When citing a measurement or artifact as evidence for a claim about the current code, confirm it was produced AFTER the change it certifies."
- **Partial fix to a sibling-file group is the most frequent defect class (count 5, RULE CANDIDATE).** Fix is applied to the one instance seen, not all instances of the same call/pattern in the same file + sibling files. The grep-all-instances approach (CLAUDE.md) is the required mitigation.
- **New hook/utility extracted without co-located tests (count 7-8, rule exists, code-style.md §7).** Persistent authoring-habit gap; code-reviewer BLOCKING + test-writer backfill is the reliable gate.
- **Pre-Push PR Sweep earns its cost.** Cumulative full-PR semantic review repeatedly catches cross-file consistency gaps (proxy.ts 4xx/5xx header parity, doc cross-reference drift, RPC security-note drift) that per-commit passes miss because each commit alone looks clean.
- **test-writer generates jsdom/TS-strict-incompatible tests first (count 3, rule in test-writer memory).** TS2532 array-index, deprecated `vi.fn` generic, PointerEvent jsdom gaps — all need a fix cycle. The fix cycle is the reliable gate; no code-style change needed.
- **Idempotent RPCs must read current DB state on replay, not return hardcoded values (count 2, RULE CANDIDATE).**
- **Migration `CREATE OR REPLACE` on a SECURITY DEFINER function silently revokes EXECUTE.** Always re-state `GRANT EXECUTE ... TO authenticated` after.
- **Count semantics:** a tracker count increments only for a *distinct mechanism/occurrence* (per `agent-memory.md`), not a re-mention of the same one. Several count=2 rows below are same-file/same-migration and were deliberately held below promotion despite the raw count.
- **Verify the issue premise before implementing (process win, 2026-06-06, #471):** Issue #471 described a JS mass-transfer O(n) performance problem in `get_session_reports`; the proposed fix was a set-based SQL aggregate. Root-cause analysis revealed the JS loop was already gone (fixed in a prior sprint) — the root cause was dead data (`answered_count` column still in the migration but no longer computed correctly by the RPC). The right fix was removing the dead column, not adding a new aggregate. Lesson: before implementing any fix from a backlog issue, verify the issue's described root cause still exists in the current codebase. A 10-minute exploration subagent prevents implementing the wrong solution. This maps to the existing Plan Validation step "Root cause check (is the described fix the RIGHT fix?)" in `agent-workflow.md` — #471 confirms the check is load-bearing even for performance issues with an "obvious" solution.

## Durable knowledge relocated from MEMORY.md (2026-06-07 budget curation)

> **Verbatim** relocation of the long durable-knowledge bullets from `../MEMORY.md`. Four short
> meta-rules (count-threshold, sweep-on-promotion, biggest-defect-class, and the pointer to this
> file) remain inline in `MEMORY.md`; everything below was moved here to stay under the 25 KB
> native-injection cap. Never auto-injected; nothing was paraphrased or deleted.

- **STEP 8 WATCH (agent-memory migration baseline, 2026-06-05):** Post-refactor cycles #705 through #611 show stable median ~0.7 findings/cycle (9 cycles, mix of substantive and trivial work, #611 first substantial full-feature with red-team + migration). #611 introduced haiku FP rate on E2E specs (2 invalid findings vs. 0 valid); all prior findings were either valid or null. No model-tier bump warranted yet; confirm FP pattern on next substantive cycle before escalating haiku→sonnet. Baseline established at count=0 (clean) for post-refactor healthy cycles.
- **Client-navigation/runtime bugs require empirical reproduction to disprove static hypotheses.** #568 (clearDeploymentPin call-order bug) had a wrong proposed fix (missing setSubmitting/revalidatePath) based on static analysis. The orchestrator reproduced the issue with instrumentation and found the real cause: Server Action invoked AFTER router.push cancels the in-flight navigation. Static review cannot catch Next.js runtime control-flow subtleties like this.
- **Server Component query helpers** (`lib/queries/`) throw on error WITHOUT preceding console.error — the established convention. Error propagates to app/error.tsx → Sentry. Do not suggest console.error on throw here. (Distinguished from Server Actions, which return typed errors; and from query-file auth helpers which MUST destructure `{ error }` and log before guard decisions.)
- **Query-helper throws in Server Action call sites (new, 2026-06-01):** When a query helper is promoted to throw-on-error, any Server Action that **returns** that helper's result directly to the client must wrap the call in try/catch (log + return empty/fallback). The throw-posture is safe for Server Component page-load (caught by app/error.xyz) but crosses an unsafe boundary when a Server Action returns the output to client JS — uncaught throw crashes the app shell. Audit Server Action consumers whenever promoting a helper to throw.
- **Post-agent-memory-refactor (Step 8) watch:** Cycles 1–9 post-merge: #705=3, #677=3, #673=0, #709=0, #372=0, #627=1, #568=0, #509/#582/#601=0 (clean component-cleanup PR), **cycle D (test/redteam-batch-time-limit-nullguard)=2 (2 impl-critic SUGGs, both applied)** (running median ~0.7 vs. pre-mig baseline ~9). All cycles post-#673 except #627 have been non-substantive (tests-only, tiny refactors, doc-only, E2E-only, fix-only #568) or clean. #627 had 1 SA-boundary ISSUE + 3 SUGGs on query-helper throw sites (fixed). #717 had 1 ISSUE discovery gap + clean 16-site sweep. Cycle D (red-team spec + audit-metadata test): 2 SUGGs (dead `as string` cast in sweep, Number() coercion on NUMERIC), both fixed immediately. Running baseline remains low (~0.7); no model bump indicated; system is stable.
- **BIGINT/NUMERIC coercion sweep completeness (2026-06-01, reinforced 2026-06-04):** When scanning for uncoerced numeric RPC return values, inspect BOTH (a) RETURNS TABLE columns and direct `.select()` reads, AND (b) numeric values nested inside json/jsonb RPC payloads. PostgREST stringifies numerics in both contexts. The Number() rule already exists; this is a discovery-gate completeness note for sweep tasks — always grep payload type definitions (e.g., RPC return type comments, TypeScript interfaces derived from RPC signatures) for json/jsonb fields containing `NUMERIC`/`BIGINT` and trace their usage in consumers. Cycle D: semantic-reviewer caught audit-metadata NUMERIC score_percentage uncoerced-read BEFORE commit; pre-commit gate working. Rule enforcement working well; no action needed.
- **Red-team RPC contract-assertion discipline (new, 2026-06-04, count=3 — PROMOTION JUSTIFIED):** Red-team positive-path and idempotent-replay specs often assert that an RPC executes successfully and state changed, but under-assert the RPC's documented return payload. Three recurrences across PRs #736, #557, and PR-A (#256/#257): (a) positive assertions check rows exist but not output field values; (b) idempotent paths assert re-execution succeeds but use a single hardcoded constant as the expected value, which cannot distinguish DB-re-read from a bug that hardcoded the return value. **Fix pattern:** For idempotent/replay paths, seed ≥2 distinct values in the test fixture so the returned value must be a fresh DB read and cannot coincidentally match a hardcoded constant. For all positive paths, assert the output shape matches the RPC's return contract (columns, types, bounds, within ranges). **Promotion ready:** count=3 triggers rule addition to code-style.md §7 red-team guideline. **Applies to all ~12 remaining RPC specs in this batch** (PRs 4–12), so early promotion prevents N rounds of semantic-reviewer refinement per spec.
- **CodeRabbit catches output-contract nits that internal agents miss (confirmed PR #774):** CR on PR #774 caught (1) exact-length assertion where `toHaveLength(1)` was used but `toBeGreaterThanOrEqual(1)` is the correct contract, and (2) the study-mode `passed: null` contract missing from batch_submit_quiz spec. Neither was flagged by code-reviewer, semantic-reviewer, impl-critic, or plan-critic. This is a third documented case (prior: CR-local round 1 on #677 caught cast-guard omission §5; PR #712/#713 CR caught SQLSTATE pin gaps). Durable pattern: CR's pass-through on the merged PR is a secondary gate on field-type/contract precision that internal agents consistently miss. Running CR pre-push (cr-local or wait for PR CR) is load-bearing for this class of gap.
- **Admin-only RLS table SELECT tests should scope the attacker query to the seeded row (new, 2026-06-04):** When testing an admin-only RLS table (e.g., exam_config_distributions with no student policy), an isolation test proves the guard works by: (1) admin confirms the protected row exists (non-vacuity): `expect(adminRows?.length ?? 0).toBeGreaterThan(0)`, then (2) cross-org attacker SELECTs **the same specific row** via a scoped query (`.eq('exam_config_id', examConfigId)`) and asserts 0 rows (RLS blocks it). This pattern ties the attacker's query to the admin-seeded row so the test proves "RLS blocks cross-org access to a real row" rather than "query returns 0 because no data exists globally". Observed in a17fdc0f (AK test): `expect(adminRows?.length > 0)` then `crossOrgClient.from('exam_config_distributions').select('id').eq('exam_config_id', examConfigId)` → 0. This is the correct form (mirrors the vacuity rule in tracker row 71, applied to admin-only tables). Not yet a tracker row — first clear example; watch for recurrence when testing other admin-only tables in Hub B/C cycles.
- **Handler/function extraction discipline (new, 2026-06-01):** When extracting a handler into a new function, audit the extracted body line-by-line and drop all params that are not referenced. Extracted function signatures should only include params that are actually used in the extracted code. Carryover of dead params is a minor antipattern (unused param, not breaking) but indicates incomplete review at extraction time. Pattern to watch: extraction is a common refactoring task; if count reaches 2 across different commits, add guidance to code-style.md §3 (Function Rules) under "extraction discipline" or to CLAUDE.md refactoring guidance.
- **PostgREST `.single()` vs `.maybeSingle()` consistency (new, 2026-06-04):** `.single()` asserts "exactly 1 row; error on 0 or 2+"; `.maybeSingle()` permits "0 or 1 rows". Use `.maybeSingle()` or array-access form when a filter can legitimately return 0 rows (e.g., audit metadata queries with a time-range filter). Use `.single()` only when the query precondition guarantees a row (e.g., by-ID lookups after existence check). First occurrence in audit-metadata seed query; not yet a tracker row (count=1); watch for pattern mismatch violations (using `.single()` where the result can be empty).
- **Red-team gap-discovery and same-RPC-family folding discipline (2026-06-04, positive signal):** PR-E red-team review of #633 (JSONB injection spec f2c52459) identified an adjacent gap: the `upsert_exam_config` RPC had no spec asserting the non-admin privilege-escalation guard (authenticated student caller). Commit 4bdb533b added BV2 spec to the same file instead of deferring. This is **disciplined apply-vs-defer**: adjacent gap, same RPC family, <100 LOC, no design decision, same session → apply immediately. Pattern indicates healthy red-team audit flow: initial spec identifies defense layers to test, red-team agent flags other untested layers in the same RPC, gaps closed immediately without deferral. No rule change; this is positive feedback on the audit cycle. All gaps in a single RPC should be addressed in the same PR, not scattered across multiple review rounds.
- **File-split refactoring completeness (new, 2026-06-01):** When splitting an oversized file (e.g., dashboard query file → two files), the refactoring must include: (1) moving the function's FULL test branch coverage (all tests exercising that function, not just happy-path tests) to the destination file in the same commit; (2) extracting ANY constant referenced by both files to a shared `constants.ts` or shared module, not duplicating across both halves. Pattern to watch: two sub-gaps found in same refactoring task (#698/#666). If count reaches 2 distinct mechanisms across different splits/refactors, promote to code-style.md §7 or §2 file-organization guidance.
- **CR-local false positives on Postgres CREATE OR REPLACE chains (2026-06-05):** CR-local (external CLI) flagged legitimate guards as missing in #750 because it read the pre-guard migration snapshot and never traced the CREATE OR REPLACE chain forward to where the guard was added. Pre-flag verification rule already exists in agent-critic.md / semantic-reviewer.md / implementation-critic.md ("trace CREATE OR REPLACE to latest definition") but CR-local (external tool, no agent instructions) doesn't follow it. Validated as false positives. Proposal: update agent-coderabbit-local.md "Common Pitfalls" section to note "Trace CREATE OR REPLACE chains to latest definition before flagging missing guards; multi-dir migration mirrors (packages/db/044_* ≡ supabase/20260411000007_*) may create apparent conflicts in file refs."
- **Doc constraint-absence claims must be grep'd against migrations before committing (2026-06-05):** When documenting an RPC's known-gap residual vector (e.g., "no DB-level constraint enforces unique active session"), grep ALL migrations for partial unique constraints on that table+columns BEFORE asserting absence. Pattern: #750 AL said "no DB-level unique constraint" on active_exam_session, but `uq_active_exam_session` exists (mig 20260411000006); AJ said "allows two active configs", but `uq_exam_configs_org_subject_active` enforces it (mig exists). Both caught post-commit via PR-level semantic sweep. Mirrors doc-updater cross-reference-audit rule (code-style.md §9). Count=2, distinct RPCs, same mechanism (count increments on code-style.md rule §9 promotion if 3rd occurs).
- **Red-team RPC output-contract assertions now a hard rule (count 3 → PROMOTION 2026-06-05):** Positive-path and idempotent-replay specs often assert RPC executes but under-assert the documented return payload. Three recurrences (#736, #557, PR-A #256/#257): existence checked, field values/types/bounds not validated. Fix: assert shape matches RPC contract; on idempotent paths, seed ≥2 distinct values so returned value must be a fresh DB read (can't be hardcoded). **Promotion (count 3 justified):** add to code-style.md §7 red-team guideline to prevent N refinement rounds per spec across remaining ~12 RPC specs.
- **E2E spec soft-delete+restore timing rule (2026-06-05, refinement):** When a red-team spec restores shared seed state via soft-delete, the DELETE/UPDATE must occur INSIDE the try block of the test's try/finally cleanup boundary, not before or after. If the test body throws after the mutation but before the finally runs, the cleanup is stranded (violates row 69 E2E hermiticity rule). Distinct from "hermiticity restoration exists" — this is timing/scoping of the mutation. On 2nd occurrence in a distinct spec, promote to code-style.md §7 as E2E Hermiticity sub-rule for clarity.
- **Postgres SECURITY INVOKER + RLS unauth-path behavior (2026-06-05):** SECURITY INVOKER functions execute as the calling user with PUBLIC-default EXECUTE grant. Anon (unauthenticated/public role) CAN execute these functions, but they run with `auth.uid() = null`. RLS filters then return empty results, not a GRANT rejection (`error: null + data: []`). RLS is the gatekeeper, not function-level GRANT. Impl-critic may flag as "GRANT TO authenticated" — false positive. Master BW/BX specs prove this behavior. Durable knowledge: do not expect GRANT rejections on unauth access to SECURITY INVOKER functions over RLS-protected tables.
- **E2E spec hermiticity enforcement working (2026-06-01, refined 2026-06-04, reinforced 2026-06-05):** Row 69 tracks "E2E spec hermiticity" at count=2 (promoted to code-style.md §7 after #587 admin-questions.spec.ts incident). Void-code spec (bf3a957e) and session-replay-void spec (89256e0d, PR-A) represent later recurrences; semantic-reviewer caught pre-commit gaps (cleanup ordering, mutation-scoping) and fixes were applied same-session. **Refinement (new from PR-A #256):** the shared seed mutation (soft-delete, state change) must occur **inside** the try block of the test's try/finally cleanup boundary, not before or after. If a throw escapes after the mutation but before the finally runs, the cleanup is stranded. This is a timing/scoping rule within the hermiticity envelope, not a new rule. No rule change needed; the E2E hermiticity rule already subsumes this pattern. Monitor for 2nd distinct occurrence — if it recurs, might warrant a sub-note in code-style.md §7 E2E Hermiticity for clarity. **2026-06-05 confirmation:** commit 89256e0d (#256 soft-delete fix) proves the timing rule: question DELETE was OUTSIDE try/finally, stranded on throw, poisoned downstream specs. Moved inside try block so finally-block restore always runs. Distinct mechanism (timing/scoping) from "restoration exists" (row 69 count=2). Watch for 2nd distinct spec-family recurrence — on 2nd, promote as sub-rule.
- **CREATE OR REPLACE migration size — no violation (2026-06-02):** Code-reviewer correctly did NOT flag the 299-line CREATE OR REPLACE migration in #570/#571 as a size violation because it was a verbatim copy with zero `+` lines in the diff (Postgres has no patch syntax for SECURITY DEFINER functions — replacement is inherent). This is working as designed; the rule applies only to new lines added in the commit, not to pre-existing over-limit code being replaced verbatim. Positive signal: the suppression logic is sound.
- **Postgres SECURITY INVOKER + RLS unauth-path behavior (new, 2026-06-04):** SECURITY INVOKER functions execute as the calling user. Postgres grants function EXECUTE to PUBLIC by default; no migration revokes it, so `anon` (unauthenticated/public role) CAN execute these functions — but they run with `auth.uid() = null`. RLS filters on auth.uid() then return empty results (not a GRANT rejection, but a data-level filter). When testing unauth access to RLS-protected queries via SECURITY INVOKER functions, expect `error: null` + `data: []`, not `error: { code: 42501, … }` (the latter would be a WITH CHECK violation, not an unauth EXECUTE denial). Impl-critic may flag this as "GRANT TO authenticated" — false positive. The pattern is: unauth queries on RLS tables use RLS as the gatekeeper, not function-level GRANT. Pre-existing test coverage (master BW/BX specs) proves this behavior.
- **Unauth-path red-team pattern established (2026-06-04):** Hub A batch (6 unauth-path specs) had zero real findings — code-reviewer clean, test-writer clean, semantic-reviewer 1 SUGGESTION (file-consistency skip), impl-critic 1 FALSE POSITIVE (GRANT assumption). The SECURITY INVOKER + RLS pattern is now well-understood and covered. Positive signal: unauth-path testing is routine and reliable.
- **Doc peer-list inconsistency (new, 2026-06-02):** Doc listed start_exam_session among RPC *_count RPCs, but the function emits exam.started (no answer counts). Semantic-reviewer SUGGESTION. This is a doc-only misclassification (not a code bug). Not promoting yet (count=1); watch for recurrence of "doc peer-list classification errors" across different RPC families.
- **Haiku code-reviewer false positives on Playwright E2E specs (new, 2026-06-05 cycle #611):** Code-reviewer produced 2 false positives: (1) flagged "missing zero-row check on afterAll" when `.select('id') + data?.length>0` check was already in committed code (stale-file-read or line-number miscount); (2) flagged "vacuous positive assertion" on `.toBe(1)` write-result, misapplying the §7 non-vacuous rule (which targets NEGATIVE assertions like `not.toContain()` on possibly-empty collections, not positive-value assertions on deterministic write results). Semantic-reviewer independently confirmed both correct. **Pattern:** haiku tier struggles with Playwright E2E spec code complexity — false positive rate on E2E specs elevated vs. unit/Server Action code. **Signal for Step 8 watch:** post-mig #611 is the first SUBSTANTIVE full-feature cycle (migration + Playwright + doc); code-reviewer produced non-actionable findings. Running post-refactor cycle baseline: #705=3, #677=3, #673=0, #709=0, #372=0, #627=1, #568=0, #601=clean, #611=2-FP-zero-valid (median ~0.7). No count-N tracker row yet (single false-positive session); log only. If E2E-spec false positives recur in next substantial cycle, reassess haiku reliability on E2E scope.
- **CR-local false positives on Postgres CREATE OR REPLACE chains (2026-06-05):** CR-local (external CLI) flagged legitimate guards as missing in #750 because it read the pre-guard migration snapshot and never traced the CREATE OR REPLACE chain forward to where the guard was added. Pre-flag verification rule already exists in agent-critic.md / semantic-reviewer.md / implementation-critic.md ("trace CREATE OR REPLACE to latest definition") but CR-local (external tool, no agent instructions) doesn't follow it. Validated as false positives. Proposal: update agent-coderabbit-local.md "Common Pitfalls" section to note "Trace CREATE OR REPLACE chains to latest definition before flagging missing guards; multi-dir migration mirrors (packages/db/044_* ≡ supabase/20260411000007_*) may create apparent conflicts in file refs."
- **Doc constraint-absence claims must be grep'd against migrations before committing (2026-06-05):** When documenting an RPC's known-gap residual vector (e.g., "no DB-level constraint enforces unique active session"), grep ALL migrations for partial unique constraints on that table+columns BEFORE asserting absence. Pattern: #750 AL said "no DB-level unique constraint" on active_exam_session, but `uq_active_exam_session` exists (mig 20260411000006); AJ said "allows two active configs", but `uq_exam_configs_org_subject_active` enforces it (mig exists). Both caught post-commit via PR-level semantic sweep. Mirrors doc-updater cross-reference-audit rule (code-style.md §9). Count=2, distinct RPCs, same mechanism (count increments on code-style.md rule §9 promotion if 3rd occurs).
- **Red-team RPC output-contract assertions now a hard rule (count 3 → PROMOTION 2026-06-05):** Positive-path and idempotent-replay specs often assert RPC executes but under-assert the documented return payload. Three recurrences (#736, #557, PR-A #256/#257): existence checked, field values/types/bounds not validated. Fix: assert shape matches RPC contract; on idempotent paths, seed ≥2 distinct values so returned value must be a fresh DB read (can't be hardcoded). **Promotion (count 3 justified):** add to code-style.md §7 red-team guideline to prevent N refinement rounds per spec across remaining ~12 RPC specs.
- **E2E spec soft-delete+restore timing rule (2026-06-05, refinement):** When a red-team spec restores shared seed state via soft-delete, the DELETE/UPDATE must occur INSIDE the try block of the test's try/finally cleanup boundary, not before or after. If the test body throws after the mutation but before the finally runs, the cleanup is stranded (violates row 69 E2E hermiticity rule). Distinct from "hermiticity restoration exists" — this is timing/scoping of the mutation. On 2nd occurrence in a distinct spec, promote to code-style.md §7 as E2E Hermiticity sub-rule for clarity.
- **Postgres SECURITY INVOKER + RLS unauth-path behavior (2026-06-05):** SECURITY INVOKER functions execute as the calling user with PUBLIC-default EXECUTE grant. Anon (unauthenticated/public role) CAN execute these functions, but they run with `auth.uid() = null`. RLS filters then return empty results, not a GRANT rejection (`error: null + data: []`). RLS is the gatekeeper, not function-level GRANT. Impl-critic may flag as "GRANT TO authenticated" — false positive. Master BW/BX specs prove this behavior. Durable knowledge: do not expect GRANT rejections on unauth access to SECURITY INVOKER functions over RLS-protected tables.
- **JSDoc grant-description accuracy (new, 2026-06-05 cycle #611):** Implementation-critic flagged JSDoc stating a GRANT "omits deleted_at column" when the JSDoc should state "omits 5 named columns" (the omitted set, not a description). This is a docstring-accuracy pattern (not a logic bug). The critic's underlying point is valid: JSDoc should name/enumerate what is NOT granted when it omits specific columns, not paraphrase. Not promoting yet (count=1); audit other GRANT sites for similar docstring vagueness if this recurs.
- **plpgsql ON CONFLICT deferred validation (new, 2026-06-06):** `supabase db reset` applying cleanly AND `pg_get_functiondef` confirming a clause is present does NOT prove a plpgsql function body is execution-correct. Postgres defers ON CONFLICT inference-target validation to execution time — 42P10 only fires on first call, not at CREATE FUNCTION time. After any migration that modifies a plpgsql function body containing `ON CONFLICT`, `EXECUTE format(...)`, or column-type casts, validate by calling the function (functional SQL test or e2e:redteam run) before declaring the migration correct. The Batch-A fix (f35b2a16) required an EXISTS-guard workaround because making the non-unique idx_user_consents_lookup index UNIQUE would have required destructive dedup of a sensitive production table.
- **quiz_drafts is a hard-delete table (no deleted_at column, 2026-06-06):** quiz_drafts has no deleted_at column and no FK children (quiz_draft_questions is the child, FK on draft_id, also hard-deleted). E2E cleanup for this table uses hard DELETE (`.delete().eq(...)`), NOT `.update({ deleted_at })`. The code-style.md §7 E2E hermiticity soft-delete rule has an explicit exception for tables without deleted_at. When authoring specs that touch quiz_drafts cleanup, do not add `.is('deleted_at', null)` filters — the column does not exist. First lesson from PR #769 red spec #1.
- **Cookie encoding symmetry in Playwright specs (2026-06-06):** When a spec tests a cookie-based gate, the assertion must match the encoding layer: (a) `addCookies()` stores the value verbatim (no percent-encoding), so a forged cookie assertion can compare plain text; (b) when reading a cookie Playwright read back from a server-set response (e.g., a consent cookie set by the app via `Set-Cookie`), the value may be percent-encoded ("%7B%22...%22%7D"). The assertion must call `decodeURIComponent()` on the read-back value before comparing to the plaintext expected value. Mismatch between addCookies (plain) and server-set (encoded) caused PR #769 red spec #2. Documented in consent-gate.spec.ts with reader-aid comments (commit c235d806).
- **EXECUTE-granted SECURITY DEFINER RPC self-defense pattern (new, 2026-06-06, #379 mig 093):** A SECURITY DEFINER RPC that is `GRANT EXECUTE TO authenticated` (open to any logged-in user, not admin-only) must be entirely self-defending because it bypasses RLS. Required layers for any authenticated-callable audit/mutation RPC: (1) **event_type whitelist** — only pre-approved string values permitted (reject unknown types with RAISE EXCEPTION); (2) **self-vs-admin role gate** — caller may only log events on behalf of themselves OR their organization (not arbitrary users); (3) **resource org-scope** — the resource being logged must belong to the caller's org. Without all three layers, an authenticated student can forge audit events for other users or other orgs. Precedent: `record_auth_event` (mig 093, 20260606000009); impl-critic + red-team confirmed coverage. Apply this triple-check template to any future SECURITY DEFINER RPC open to authenticated role.
- **RPC output-contract rule applied proactively on first pass (2026-06-19, positive signal, #869):** `session-replay.spec.ts` (commit 5ff40d42) designed the `batch_submit_quiz` re-read spec with two-fixture non-vacuity (one passing 75/true + one sub-pass 50/false) on the first attempt — no rework required. impl-critic, semantic-reviewer, and test-writer all approved the output-contract dimension without flagging gaps. This marks the first confirmed proactive application of the code-style.md §7 "RPC Output Contract" rule (promoted at count=3, PR-G/#742). The gap that used to trigger 1–2 semantic-reviewer rounds per spec is now closing at authoring time. Positive feedback: rule internalization is working. The residual gap (new fields not initially covered on each new RPC spec) is decreasing.

## Relocated from MEMORY.md (byte-budget pressure)

- **CR mirror value:** `b1280606` (chore/backlog-flow-control) caught by a `.coderabbit.yaml` rule the branch's own author added in `a0e01943`, 12 commits earlier. The mirror is not redundant. (The "3 commits" in b1280606's own message is wrong — re-derived, per code-style.md §10 clause 1.)
- **Wording-refinement bound proven:** `387a29ac` bounded every refinement finding raised in one round; chain cap fired at `1c22b201` and again on fix/1175-tenant-isolation-select-only (3rd data point, 2026-08-20) — escalated to the user per agent-critic.md and applied without a 4th cycle. All terminate by rule, not by convergence.
- **Empirical measurement discipline working:** grep-over-checkout identified RSC flight payload, not DOM (reversed a design decision); A/B instrumentation found 4→1 and 5→1 body executions (disproved issue's network-dedup rationale); running local red-team specs against origin/master under identical DB state proved failures were environmental not code regressions (PR #1238). Cheap wrong method consistently agreed with expected answer — measure before concluding.
- **Row 604 clean cycles:** `cd479557` (first, after `32ed663d`/`39887952`) and `a5745ab5`/`a5fed09e` (a false infrastructure claim caught and fully repaired inside its own review unit, no residue) — two data points, orchestrator verifying citations pre-commit. Not resolved: row 604's count still climbed to 18 on OTHER commits in the same window (`8202799f`, `3d06fae6`) — the mitigation holds per-commit, not per-branch.
- **PR #1242 headline (row 655):** 7 stale/contradictory rules-file claims, none caught by any internal agent — all 7 caught only by CR-local/cloud-CR's whole-diff read or an orchestrator fact-check. The common shape: claim and referent sit in different sections, different files, or are an arithmetic property, so a hunk/section-anchored reviewer structurally cannot see the contradiction. Rows 651-654 (same branch, earlier commits) are the same dysfunction class, different sub-mechanisms. Instance 7 (commit `4e96c64d`): the plan-critic diagram (written by `32ed663d`) omitted the unresolvable-CRITICAL escalation branch, contradicting that same commit's own prose at L107/L125 ~66 lines away — caught by cloud CodeRabbit, not any internal gate. Fixed cleanly (0 findings across all 4 post-commit agents on the fix commit itself). Same branch as instances 1-6, so row 655's own promotion condition ("on a 2nd BRANCH") is not yet met.
- **OPEN AMBIGUITY — the "2nd-branch" promotion gate is unwritten and applied inconsistently (flagged by semantic-reviewer, 2026-08-25, learner pass covering `ee0045b7`/`0f96e64b`).** `agent-learner.md`'s literal text: "The pattern has 2+ occurrences across different commits (not just different files in the same commit)" — no branch clause anywhere. Yet practice has repeatedly applied a STRICTER, self-imposed rule: row 655 explicitly writes "Same branch as instances 1-6, so row 655's own promotion condition ('on a 2nd BRANCH') is not yet met" (and again for instances 7-11, all held at RULE CANDIDATE despite reaching count=11); row 660 (before its final promotion) carried the identical language — "Count=1 — single branch... log and watch, do not propose a rule change yet" — for its first WATCHING state. **But row 660 was ultimately PROMOTED at count=3 with ALL THREE instances on the same branch** (chore/pr-split-practice), with no branch-diversity gate invoked at the moment of promotion — directly contradicting the standard row 655 states for itself. Two rows, same session, same author, opposite practice.
  - **Working hypothesis for the inconsistency (not confirmed, offered as a candidate explanation):** the two rows differ in what their proposed remedy COSTS. Row 660's remedy (two mechanical checklist items: "walk every reported hit to a disposition" + "checksum byte-identical copies") is narrow and cheap — it adds a bounded step to ONE existing workflow (mirror sweeps). Row 655's remedy ("mandatory WHOLE-FILE re-read on any binding-rules-file edit, not hunk-scoped, by semantic-reviewer or the orchestrator, checking every numeral/cross-reference/scope-list claim") is broad and expensive — it adds a mandatory step to EVERY future edit of a wide file class. A stricter evidence bar for the more expensive remedy is a defensible engineering instinct, but it was never written down, so it cannot be applied predictably or defended if challenged.
  - **This cycle's own finding (row 519 / "Claim-correction commit updates a count") is a clean test case:** it sat at count=3, same-branch, annotated "(await cross-branch recurrence)" — implicitly invoking the same unwritten gate row 655 states explicitly. This cycle found 3 MORE instances on a DIFFERENT branch (chore/run-log-1242-merged vs. row 519's original, pre-2026-08-16 branch), satisfying even the strict reading. Net: for row 519 specifically, the ambiguity resolves itself via new evidence rather than requiring a rule-text decision. Rows 655's 11 instances remain unresolved by this cycle — still one branch.

## PR #1247 (fix/991-admin-non-mc-report, commits c90caf61/47524d9c) — 2026-08-30 learner pass

Origin: 3 CodeRabbit findings (missing `ordering.isCorrect` assertion; redundant comment; unpaged
answer-key RPCs past PostgREST `max_rows` — fixed via new `fetchAllRpcRows`, applied to both the new
admin call site and the pre-existing student one). 4 post-commit rounds followed. **Assessment: NOT
an escalation.** The rows below (604, 663, 667) were already at count 22/3/1 before this cycle —
this PR's instances are further confirmation of an already-large, already-tracked defect class, not
a new spike. A prose-accuracy fix remains the single highest-risk site for a fresh false claim
(`agent-critic.md`), exactly as already documented.

- **Row 604 (+1 → 23), 3 distinct same-PR instances, all "fixing one false claim ships another":**
  (a) the fix explaining why a partial `vi.mock` broke tests asserted "silently yields undefined and
  breaks every consumer's cap check" — Vitest actually THROWS a loud, self-diagnosing error on
  accessing an unmocked-but-real export; the false mechanism was duplicated into three separate
  source comments, plus a wrong count ("broke three test files" — only one broke, two were
  preventive additions); (b) a fix claimed "one place [`supabase-paginate.ts`] governs" the
  `max_rows` cap right after collapsing two duplicate `1000` literals — while four MORE hardcoded
  `1000` literals remained in that same file, un-grepped; (c) the fix for (b) then claimed the
  literal "now appears exactly once in the repo's app layer" — 17 occurrences exist under
  `apps/web/lib`. Each was self-caught or caught by the next semantic-reviewer round, not shipped.
- **Row 663 (+1 → 4):** a subagent reported 13 failing tests as "pre-existing, confirmed unrelated."
  They were neither — caused by the orchestrator's own edit (a new export accessed through a partial
  `vi.mock({ fetchAllRows })` in `quiz-report-questions.test.ts`) — and the "confirmation" was never
  actually run. Orchestrator verified rather than accepting the dismissal.
- **Row 667 (+1 → 2, broadened):** a source comment asserted "highest-count row in the code-reviewer
  tracker" for a row at count 6, when two other rows sit at 17 and 7 — an unverified superlative
  about ENUMERABLE tracker data, not re-derived before writing. Distinguish from `code-style.md` §10
  rule 2 (OPEN sets): the tracker is a CLOSED, greppable file: rule 2 doesn't cover this, it was
  simply not checked. Broadens row 667 from "rule draft" (its original framing) to any prose,
  since this instance is a plain source comment.
- **New WATCHING (count=1) — delegation-prompt scaffolding leak:** a shipped code comment carried an
  orphaned "step-5" cross-reference inherited verbatim from the orchestrator's own internal
  delegation-prompt wording — meaningless to a reader of the shipped file, since the prompt's own
  step numbering is not part of the codebase. Distinct failure mode from the false-claim rows above:
  the text isn't FALSE, it's just internal scaffolding that leaked through a copy-paste.
- **New WATCHING (count=1) — partial `vi.mock` brittleness:** `vi.mock('@/lib/supabase-paginate', ()
  => ({ fetchAllRows }))` — a bare-object partial mock — THROWS when a later commit adds a new named
  export (`POSTGREST_MAX_ROWS`) that the SAME test file's OTHER tests access through the mocked
  module. This is a distinct mechanism from "vacuous mock coverage" (existing FP catalog entry): the
  mock doesn't silently under-cover, it hard-fails the whole file. Fixed by spreading
  `importOriginal()` at all three affected mock sites. doc-updater judged the finding real but
  correctly declined to propose a rule at count=1 (single occurrence) — logged here to WATCH.
- **CLAUSE-5 NUMBERING CONFLICT (flag for orchestrator, not resolved here):** two separate RULE
  CANDIDATE rows both target "§10 clause 5" with DIFFERENT substantive text — row 604 ("whole-block
  re-read after every edit," count 23) and the "Empirical measurement correct for tested scenario but
  excludes the failure case" row (count 3, archive rows 649+650). Whoever writes either rule into
  `code-style.md` must renumber; do not silently let one overwrite the other's clause slot.
- **Item 2 note (not tracked, POSITIVE):** a commit message originally claimed "three existing
  `fetchAllRows` callers" (actually 9 files / 15 call sites); semantic-reviewer caught it and the fix
  replaced the literal count with a derivation command, per `code-style.md` §10 rule 2 exactly as
  designed. Cited as evidence the existing rule works when followed — not a new pattern.
  - **PROPOSAL (learner proposes; orchestrator/user decides — NOT applied to `agent-learner.md` by this pass):** state explicitly in `agent-learner.md` (or `agent-memory.md` § Tracker state machine, where the promotion-related conventions already live) that (a) the literal "2+ across different commits" bar is ALWAYS sufficient to reach RULE CANDIDATE and to promote a narrow/cheap mechanical remedy — same-branch commits count; and (b) a promotion whose remedy imposes a NEW MANDATORY review step on every future commit matching a broad criterion (as opposed to a narrow checklist addition to an existing step) may additionally require evidence from a 2nd branch before the orchestrator promotes it, specifically because same-branch instances risk being one continuous causal chain rather than independently-confirmed recurrences of a durable systemic pattern. Naming the criterion (remedy cost/blast-radius, not branch-count-for-its-own-sake) would let future rows apply it consistently instead of ad hoc.
- **POSITIVE (fix/991, `d4837e6a`):** comment-only 3-line fix, 4/4 agents clean (0 blocking/critical). Its lone semantic-reviewer ISSUE — an incomplete "Deliberately NOT swept" enumeration in the commit MESSAGE, omitting an item from a bucket it names, judged not worth reopening — is row 604's mechanism (fix-for-a-§10-claim commit introducing its own fresh incomplete claim) recurring on its own fix commit; NOT double-counted, row 604 stayed at 23 pending the next distinct-mechanism instance.

## Commit `59005823` (fix/fetchallrows-null-page-sweep) — 2026-08-31 learner pass

Origin: 2 full reviewer rounds on `fetchAllRows`'s own null-page guard + a `listOrgStudents` fix.
Across both rounds and all 4 core agents, ZERO code defects — every finding was inaccurate PROSE.

- **Row 604 (+1 → 24), first confirmed 2nd-BRANCH instance:** round 1 (pre-amend `47fed406`)
  semantic-reviewer caught a false claim in a docstring rewritten WHILE fixing other false claims —
  the exact "fixing a claim ships a fresh claim" mechanism. Round 2 (post-amend `5dd85e3e`) found two
  more in the commit message: "six comment blocks corrected" when eight were, and (see row 677
  below) a stale test-count claim. A SUGGESTION also caught "any other non-array threw a raw
  TypeError" — false for iterables (a string spreads into characters, a `Set` into elements). All
  four sub-instances are in the SAME commit/amend family, so counted as ONE increment, per the
  PR #1247 precedent above (3 distinct same-PR instances = +1). This branch is genuinely distinct
  from PR #1247's `fix/991-admin-non-mc-report` (cut from its merge commit `e89ead6a`), so it is the
  first hard evidence for row 604 specifically satisfying the "2nd-branch" gate discussed above —
  though moot here, since the remedy (§10 clause 3, "read the whole comment block") is ALREADY
  written; the recurrence is an enforcement-depth gap, not a missing rule, consistent with the
  "§10 continues recurring post-promotion" meta-lesson above.
- **Row 677 (new, WATCHING count=1) — quantified claim invalidated by a same-commit AMEND:** the
  commit message stated "reverting the page routing reddens exactly the two new page tests" — TRUE
  when written. The commit was then amended to add a third test; the sentence carried forward
  verbatim and became false. Distinct from row 604 (a fix INTRODUCING a wrong claim from scratch):
  here the claim was correct at write time and went stale because the ARTIFACT IT DESCRIBES changed
  under it, unverified before the final push. Also an instance of §10 clause 2 (never enumerate an
  open set) in a temporal guise — the set of tests that redden under a mutation is open across
  amends, not just across later commits.
- **Row 678 (new, WATCHING count=1) — Explore-agent arithmetic error propagated unverified:** an
  Explore agent miscounted "7 single-function files" (actually 8) during planning; the error
  propagated unchanged into the plan, the commit message ("15/10" call sites instead of the true
  "16/11"), and the orchestrator's own report to the user. `agent-workflow.md § Finding Validation`
  already carries a directly-adjacent rule — "a critic/reviewer told me X → verify X yourself"
  (precedent `3a50780a`) — but that bullet's example list is about critics repeating an assertion,
  not an Explore agent's own arithmetic/enumeration output. If this recurs, propose adding "an
  Explore agent's file/call-site COUNT" as an explicit example in that bullet's claim-class table.
- **Not an escalation:** this cycle's prose-only distribution matches the already-high baseline set
  by PR #1247 (rows 604/663/667) — see that section above. Two full rounds × four agents produced
  no code defects at all, only inaccurate prose, continuing rather than worsening the trend.
- **PROPOSAL (learner proposes, single-cycle evidence — NOT promoted, do not implement this cycle):**
  every high-value catch this cycle came from EXECUTING something — semantic-reviewer mutation-
  tested the fix to find the stale "exactly two tests" claim (row 677); the orchestrator settled the
  spread-vs-array iterable question with `node -e`; a live PostgREST probe settled an empty-table
  question. Every miss came from reasoning about prose instead. This reinforces the already-written
  `agent-workflow.md § Delegation Protocol` "Prefer executable verification over analysis" rule, but
  sharpens it: only `test-writer`'s own agent definition currently MANDATES execution, and
  `plan-critic.md` explicitly FORBIDS it (`plan-critic` is read-only by design). Consider — in a
  dedicated rules PR, not this cycle — adding an evidence/execution field to `semantic-reviewer.md`
  and `code-reviewer.md` for any finding that asserts RUNTIME behavior (as opposed to a static
  structural check like a line count or an import).

## Commit `34e26c48` (Vector FL red-team leg: `a920f7f4` → `e6dd50b2` → `34e26c48`) — 2026-08-31 learner pass

Same session as `59005823` above, different branch/artifact (red-team attack-surface matrix, not
`fetchAllRows`). Three implementation-critic rounds, four findings, ALL prose — zero code defects.
Every fix was mutation-checked before commit (message swapped to the sibling guard's string reddens
exactly the intended test), so the CODE this leg shipped is independently verified; only the
DOCUMENTATION describing it needed repeated correction.

- **Row 604 (+1 → 25):** round 1 found the matrix's Vector EJ claim ("exercises the active-user
  org re-select backstop") false — `is_admin()` raises first, so the backstop is unreachable for
  that caller — and traced the error to `a920f7f4`'s own matrix content, copied verbatim into a
  spec header by `e6dd50b2`. Round 2, after the orchestrator's own correction of that row, found a
  SECOND clause in the SAME row still present-tense ("no `forbidden` assertion... exists") after
  the first clause had been fixed — the identical partial-edit shape as row 604's `59005823`
  instance (one `@returns` sentence wrong four times running), now on a reference DOCUMENT (the
  attack-surface matrix) rather than a docstring. Both rounds are the same commit/correction family
  (the SAME matrix row, two consecutive critic rounds), so counted as ONE increment, per the
  PR #1247 / `59005823` precedent (same-family sub-instances = +1, not one each).
  **On whether the remedy needs strengthening:** no. `code-style.md` §10 clause 3 already says
  "if you edit any part of a comment block, read the whole block" — round 2's finding is exactly
  what a whole-block re-read would have caught, and the fix commit's own message says so explicitly
  ("The matrix FL row is updated end to end... rather than the one sentence that was flagged, which
  is the partial-edit failure code-style.md section 10 names"). The text is adequate; row 604 at 25
  is an ENFORCEMENT-DEPTH count, not a rule-text gap — the same conclusion as every prior entry in
  this row's history. No further text change proposed.
- **Row 679 (new, WATCHING count=1) — a commit's own message and its own file content assert
  CONTRADICTING claims about the same fact, and the file version (not the message) is what
  propagates:** `a920f7f4` is a memory-recording commit. Its commit MESSAGE never asserts the
  EJ-backstop claim at all — it correctly frames EJ as failing on `deleted_at`, "not on role."
  Its FILE content (the attack-surface matrix row it wrote in the same commit) asserts the
  backstop claim, which is false. `e6dd50b2` read the file, not the message, and copied the false
  claim into a new spec header; `34e26c48` had to trace back through git history to find that the
  correct version existed all along, one artifact over. Distinct from row 655 ("claim true in its
  hunk, false vs another section/mirror/arithmetic") — that family is section-vs-section or
  file-vs-file within committed CONTENT; this is file-content-vs-COMMIT-MESSAGE, where the more
  ephemeral artifact (the message, never diffed by any post-commit agent) turned out to hold the
  correct fact and the durable one (the file, the only thing anyone re-reads later) was wrong. No
  existing row matches this axis. Single instance — log and watch. If it recurs: the checkable
  remedy is cheap (before trusting a just-written reference-doc claim, `git log -1 --format=%B` the
  commit that wrote it and diff the two accounts), but count=1 does not warrant proposing it yet.
- **Row 680 (new, WATCHING count=1) — a coverage-gap enumeration scoped to ONE test tier concludes
  "no coverage exists," missing a sibling tier:** test-writer's first pass on
  `get_question_authoring_fields` checked only E2E/red-team specs, found none reaching the RPC by
  role, and drafted a docblock claiming the gap was total ("no spec anywhere"). Two Vitest
  integration tests already asserted `forbidden` for a student caller — the real gap was E2E-tier
  only. Caught before commit; the docblock that shipped says so explicitly rather than claiming a
  total gap. **Distinct mechanism from row 678** (Explore-agent arithmetic: a wrong COUNT from
  mis-tallying files) — this is a wrong CONCLUSION from an incomplete SEARCH SCOPE (one test tier
  instead of all tiers that could carry the assertion), not a counting error. Also distinct from
  row 605 (sibling-parity gaps found by diffing `it()` titles between two STRUCTURALLY IDENTICAL
  test files) — this is one RPC's coverage split across TWO DIFFERENT TEST SUITES/TIERS (Vitest
  integration vs. Playwright E2E), not two sibling files of the same kind. Same broad family as
  both (an agent's enumeration trusted without checking whether its search surface was complete),
  but a third sub-mechanism. Single instance — log and watch. If it recurs: propose that any
  "no coverage exists" / "no spec anywhere" claim about an RPC or function must state which tiers
  were checked (unit / integration / E2E) before asserting totality, mirroring the discipline
  `agent-semantic-reviewer.md` already requires for RPC error-token maps ("trace the reachable
  CALL GRAPH, not only the RPC body").
- **Cost-distribution note (spans both legs this session, `59005823` and `34e26c48`):** across BOTH
  legs, every implementation-critic/reviewer finding was prose; zero were code defects, and every
  shipped code change was independently mutation-checked. The honest reading is not "prose review
  is overhead" — both legs' prose findings were FALSE CLAIMS in durable reference material (a
  docstring in `59005823`; a security-relevant attack-surface matrix in `34e26c48`), which
  `agent-critic.md`'s refinement/false-claim split already says are never bounded out, whatever
  round they land on. Three critic rounds to land a security-doc correction is the classification
  working as designed, not a signal to shorten the loop. The distribution instead sharpens WHERE
  the two review modes each pay off: mutation-testing and direct execution reliably confirm CODE
  correctness (this leg's own mutation checks are the evidence), while catching a wrong CLAIM about
  what the code does still requires a reader tracing the object to its latest definition — no
  mechanical check here would have caught either the EJ-backstop inversion or the tier-scoped
  "no coverage" claim, since both required reading a specific commit/RPC body, not running one.

## Commit `84413f28` ("fix(review): qualify open-set comments and pin the attacker org") — 2026-09-01 learner pass

Same Vector FL red-team session as `59005823`/`34e26c48` above. Four core post-commit agents clean
(code-reviewer 1 WARNING, self-tracked; semantic-reviewer 3 GOOD; doc-updater/test-writer clean,
53/53 green). The notable findings came from the PRE-commit gates.

- **Row 681 (new, WATCHING count=1) — orchestrator restates a critic/CR finding's mechanism
  backwards, caught pre-commit by plan-critic:** drafting a reply to a CodeRabbit finding, the
  orchestrator's triage table first restated the finding's mechanism backwards, then — after a
  correction — its draft PR-comment text asserted a DIFFERENT wrong mechanism: "an off-org attacker
  would trip the org gate, leaving the test green." The migrations do not implement that ordering —
  `is_admin()` is org-blind and raises `forbidden` BEFORE any org lookup runs, so no org gate is
  ever reached for a non-admin caller. This is the SAME underlying `is_admin()`-raises-first fact
  row 604 already tracked twice in this session's earlier commits (the EJ-backstop matrix claim,
  `a920f7f4`→`e6dd50b2`→`34e26c48`) — but a THIRD wrong restatement of it, this time in the
  orchestrator's own drafting process rather than a committed artifact, and this time stopped before
  it reached a commit or a posted PR comment. Matches the exact risk `agent-workflow.md §
  Finding Validation` already documents inline ("a critic/reviewer told me X → verify X yourself",
  precedent `3a50780a`) — that bullet already has one real-world precedent; this is a live
  recurrence of the same class, corroborating rather than requiring new text. Logged as its own
  tracker row (rather than folded into row 604) because the CATCHING gate differs: row 604's
  instances were caught post-commit by a reviewer reading committed content; this one was caught
  pre-commit, by plan-critic, on a draft that was never staged. Count=1 in the tracker (though
  effectively the 2nd+ real-world instance of the documented class) — no new rule proposed; the rule
  already exists. If this recurs as a SHIPPED instance (not caught pre-commit), reconsider whether
  `agent-workflow.md § Finding Validation`'s existing bullet needs to move from an inline example
  into a named, mandatory step specifically for CR-mechanism restatements in PR replies.
- **Row 682 (new, WATCHING count=1) — CodeRabbit misreads a diff line in isolation, missing a
  qualifier word wrapped from the previous line, and proposes a bad committable suggestion:** on
  `supabase-rpc.test.ts:216`, CR anchored its finding on a single line, missing that the qualifying
  word "null" had wrapped from the line immediately above it in the diff view. Its committable
  suggestion would have introduced a duplicated qualifier had it been applied verbatim. Distinct
  mechanism from the existing CR-FP rows: row 623 (stale migration-chain tracing), row 599
  (fabricated repo-history claims) — this is a rendering/context-window artifact (line-wrap) rather
  than a knowledge or tracing gap. Reinforces `agent-coderabbit-local.md § Verify Before Acting`'s
  existing mandate to read source before applying any CR finding, rather than requiring new text —
  applying this one verbatim would have passed that gate's "recompute a count/line" check only if
  the reviewer also read the un-wrapped source, which the mandate already requires. 3 of 6 cloud-CR
  findings this cycle were verified FALSE or contrary to codebase pattern; the other two false
  findings did not introduce a new distinct mechanism (both matched already-tracked CR-FP shapes) so
  are not logged as separate rows.
- **Housekeeping:** archived two terminal tracker rows out of the active `MEMORY.md` table this
  pass — row 658 (RESOLVED, `40c626e6`) and row 660 (PROMOTED → `agent-workflow.md §
  Rule-Mirror Sync`) — both already carry their full narrative in `tracker-archive.md`; removing
  them from the injected index is the "terminal-state rows → tracker-archive.md" housekeeping the
  file's own header calls for, not a deletion (`agent-memory.md`'s never-delete-a-row rule is
  satisfied by the archive copy). `MEMORY.md` is at 158 lines / ~18.6KB, within the documented
  200-line/25KB hard cap but above the harness's soft compaction nudge (140 lines/17.1KB) — a full
  de-listing sweep of the 2026-08-19–08-25 backlog of long single-branch rows (similar to the prior
  "MEMORY.md de-listing sweep" referenced in this file's row-489 entry) is a dedicated maintenance
  task, not something to do inline in a single-commit learner pass; flagging for `/insights` or a
  dedicated memory-maintenance session.

## Commits `80b0aaeb`→`8f6eb599` (fix/student-read-rpc-active-user-gates) — 2026-09-01 learner pass

Branch gates four SECURITY DEFINER student-read RPCs the #883 sweep missed, fixes an
`answered_count` miscount, and rewrites `docs/security.md` §11c from a closed enumeration into a
derivation. Four review rounds; every finding across all four was a §10-class false prose claim —
zero code defects.

- **Row 604 (+1 → 26), 3rd/4th distinct branch, 5 same-branch-family sub-instances counted as ONE
  increment (PR #1247 / `59005823` / `34e26c48` precedent):**
  (a) `80b0aaeb` moved a restore from `finally` to `afterEach` (biome `noUnsafeFinally`) but left two
  duplicate "restores in a finally" comments — fixed in `d1c37135`.
  (b) `d1c37135` itself appended two new `describe` blocks below a comment reading "Runs last",
  falsifying it — fixed in `7a5d6791` by restating the mechanism (afterEach restores before any
  later describe) instead of the now-false position.
  (c) `d1c37135`'s own `docs/plan.md` edit said "five mutation runs rather than six" while also
  stating the four gates were mutated in two per-migration PAIRS — arithmetic doesn't reconcile
  (2 pair-runs + 1 DISTINCT-count run + 1 soft-delete-filter run = four, with red-team as a separate
  fifth already reported elsewhere and double-counted here) — fixed in `7a5d6791`.
  (d) `80b0aaeb` edited part of a `docs/database.md` sentence to fold in the two new student-reader
  RPCs, making "apply `deleted_at IS NULL` filters on every SELECT" overbroad — both readers LEFT
  JOIN `easa_subjects`, which has no `deleted_at` column, so the per-function detail below the
  overview already contradicted it — fixed by CR-local round 1, applied in `8f6eb599`.
  (e) `80b0aaeb` wrote "`get_subject_scores` has no production caller today" in three sites — false
  at the RPC level: `apps/web/lib/queries/analytics.ts:59` defines a production helper that DOES
  call it; nothing imports THAT HELPER, which is what actually has no caller — fixed by CR-local
  round 1, applied in `8f6eb599`.
  All five are the code-style.md §10 "partial comment edit is the tell" mechanism (clause 3), on a
  branch whose entire PURPOSE was correcting a §10-class violation (the #883 sweep-record claim
  below) — the rule text is well-known in-session and still didn't prevent it recurring 5 times in
  4 rounds. Consistent with every prior row-604 entry: **not a rule-text gap, an enforcement-depth
  one.** No further text change proposed this pass either — the count is now high enough (26, 4
  branches) that the orchestrator may want to consider a MECHANICAL self-check (grep the fix
  commit's own new/changed prose for positional words — "last", "first", "only", "in a finally" —
  and re-derive any count) run by the AUTHORING agent before finalizing a commit whose stated
  purpose is fixing a §10 violation, rather than relying on the next review round to catch it. This
  is a proposal for the orchestrator to weigh, not a promoted rule.

- **Row 688 (NEW) — Rule-promotion sweep recorded closed/complete, later found incomplete, count=2
  across two different rule promotions:** `docs/security.md` §11c recorded the #883 active-user-gate
  promotion (`agent-learner.md` § Sweep On Rule Promotion) as having "swept every SECURITY DEFINER
  RPC by family" — prose closed-enumeration. A mechanical re-derivation in `80b0aaeb` (latest
  definition per function, SECURITY DEFINER, not `is_admin()`-gated, GRANTed to `authenticated`,
  checked for a `users` lookup filtered on `deleted_at` whose miss raises) found FOUR more:
  `list_my_internal_exam_history`, `list_my_active_internal_exam_codes`, `get_daily_activity`,
  `get_subject_scores`. This is the SAME shape as issue #573 (the audit-actor-subquery-soft-delete
  promotion via #550 — `start_quiz_session`'s audit subquery was initially missed), already named
  inline in `agent-learner.md` § Sweep On Rule Promotion as the motivating precedent for the
  code-sweep + downstream-enforcer-sync requirements that section already carries. Two occurrences
  now, across two different rule promotions (#550→#573, #883→this), both discovered only by a LATER
  mechanical re-derivation, not by the sweep's own claimed completeness. **RULE CANDIDATE (2):** the
  section requires a code sweep and a downstream-enforcer sync, but not a RE-DERIVABLE RECORD of
  what the sweep covered — a saved query/command (e.g. the criteria `80b0aaeb` used) alongside the
  prose summary, so the next drift check can mechanically re-run it instead of trusting the prose
  claim. `80b0aaeb`'s own fix models the remedy: it rewrote §11c from a closed enumeration into a
  derivation and explicitly bounded it ("covers SECURITY DEFINER only") — the same shape code-style
  §10 clause 2 already prescribes for comments, now proposed for the Sweep-On-Rule-Promotion
  process record itself. `80b0aaeb` also names 8 SECURITY INVOKER RPCs with the same exposure
  through ownership-only RLS as deliberately NOT fixed here — next sweep target, already flagged in
  §11c per the same discipline.

## Trimmed from MEMORY.md (2026-09-01 compaction, soft-cap nudge at 17.1KB)

Full text preserved here per `agent-memory.md`'s never-lose-data-on-compaction discipline; the live
table carries a one-line pointer back to this section for each.

- **Row 683 full text (was row 109):** Orchestrator drafts its own unverified "because X"/
  attribution claim in comment prose (not restating a finding) — RULE CANDIDATE (4, reconciled:
  2×`8b8ccb54` rounds + 1×`eca41e9a` + 1×`e2768a56` — each a distinct false claim, not a
  re-mention). Still no new RULE TEXT (code-style.md §10 + Finding Validation already state it
  twice). DISPOSITION CHANGED: `e2768a56`'s claim ("a caller that retries gets a consistent one" —
  false, the pager doesn't retry) escaped impl-critic AND the full post-commit cycle (code-reviewer
  0, semantic-reviewer 0+1 GOOD, doc-updater/test-writer clean) — caught only by cloud CodeRabbit
  post-push. "Gate is working" (prior disposition) is FALSIFIED for this 4th instance; 3/4 still
  caught pre-commit. Gap is ENFORCEMENT (semantic-reviewer rated the comment GOOD without checking
  the retry claim against the pager's source), not missing text. Treating the post-push escape
  itself as count=1 (first time this class reached cloud CR) — WATCHING for a 2nd escape before
  proposing a semantic-reviewer checklist item.
- **Row 687 full text (was row 110):** code-reviewer line-count convention inconsistent across
  cycles on an unchanged function body (signature+brace in vs excluded) — `fetchAllRows` body
  reported "115-144 = exactly 30 lines, at cap" one cycle, then "spans 110-145 (36 lines), over the
  cap" the next, same unchanged 30-line body; the 2nd count includes the signature line + closing
  brace. Risk: phantom regression in the tracker. Single occurrence — log only; if it recurs,
  propose agent-code-reviewer.md fix the convention to body-only (open `{` to matching `}`,
  exclusive).

