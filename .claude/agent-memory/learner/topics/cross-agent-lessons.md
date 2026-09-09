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

## Commits `80b0aaeb`→`c7a68d05` (fix/student-read-rpc-active-user-gates) — 2026-09-01 learner pass

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

- **`a0511cd1`→`c7a68d05` — 2 more same-branch §10 sub-instances (6th, 7th; still no new increment to
  row 604 — same branch, per the established convention), plus a distinct §3 finding and a
  mechanization assessment the orchestrator specifically asked for:**
  (f) semantic-reviewer ISSUE, found independently by test-writer too: `a0511cd1`'s
  `rpc-analytics-active-user-gate.spec.ts` comment claimed both analytics RPC positive-control
  result sets "may legitimately be empty" — false for `get_daily_activity`, which
  `generate_series(p_days) LEFT JOIN student_responses` with no joined-column `WHERE` clause makes
  structurally guaranteed to return exactly `p_days` rows; only its sibling `get_subject_scores`
  (a real aggregate over possibly-zero sessions) can legitimately be empty. Fixed in `c7a68d05` by
  splitting the one joint claim into two per-RPC claims and asserting `toHaveLength(7)` on the
  non-empty one — test-writer's independent finding named that same free assertion. Two reviewers
  converging on one finding via different lenses is the established reliability signal (line 41
  above), not overlap — logged, not double-counted.
  (g) semantic-reviewer SUGGESTION: the PARENT commit's message claimed the `afterEach`
  rows-affected assert means a failed test "cannot strand the victim" — it prevents a *silent
  no-op* restore, not stranding (a `throw`n restore still leaves the victim soft-deleted). Same
  `code-style.md` §10 shape as (a)-(e): a true mechanism restated with an overclaimed guarantee.
  **Mechanization assessment (asked for this pass):** claims (f)/(g), like (a)-(e), are NOT
  reducible to a hook, lint rule, or grep-checkable pattern, and this is worth stating plainly
  rather than proposing another prose clause. §10's whole family requires evaluating a claim
  against the SPECIFIC referenced code's semantics — whether a specific aggregate query can return
  zero rows, whether a specific cleanup step's failure mode is "silent" vs. "thrown" — which is
  domain reasoning about behavior, not a syntactic property of the comment text itself. The one
  syntactically-detectable shape inside this family, "a claim made about 2+ named entities as one
  group" (open-set enumeration, clause 2's job), IS partially mechanizable — `check-mirror-sync.mjs`
  already proves grep-based verification works for byte-identical mirrors — but "both X and Y may
  be empty" has no textual signature that generalizes: nothing distinguishes it from a hundred
  true joint claims elsewhere in the codebase without first knowing whether X and Y are actually
  structurally identical, which is exactly the fact under dispute. A hook keying on surface
  patterns ("both", "either", a shared adjective across two capitalized/backtick-quoted names)
  would fire on the majority of TRUE joint claims and miss false ones phrased without those words —
  false-positive rate too high to be a blocking gate, and a non-blocking checklist item duplicates
  what semantic-reviewer's own charter already does. Conclusion: no new rule text, no new hook —
  this stays an enforcement-depth item, consistent with every prior row-604 pass.
  **Separately, code-reviewer's own WARNING this cycle (long red-team test callback) is now a
  genuine count=2 across distinct commits** (`rpc-analytics-active-user-gate.spec.ts`'s 52L "the
  owner reads..." test vs. the unflagged ~34L Vector FM precedent in
  `rpc-internal-exam-codes.spec.ts:309-343`) — folded into the pre-existing "Single-concern
  sequential DB-seed/infra helpers" RULE CANDIDATE (MEMORY.md, now count=6) rather than a new row,
  since the shape (linear positive-control → mutate → negative-probe, no branching, single
  concern) is identical to the named-helper instances already tracked there; the only difference
  is the code sits directly in the `it()` callback instead of an extracted function. The pending
  proposed clause text (tracker-archive.md row 439) currently reads "helpers... are exempt" — it
  should be broadened to explicitly name `it()`/`test()` callback bodies as a covered shape before
  promotion, or a future instance in this exact shape will get re-litigated as if it were new.
  **Fourth (unrelated) item this cycle:** one of the four earlier-triaged CodeRabbit findings on
  this branch quoted a scope label ("student analytics/history RPCs") that does not exist anywhere
  in the repo — a fabricated construct, already the exact shape of `agent-coderabbit-local.md`
  pitfall #8 (PR #1124 precedent). No new tracker entry — an already-documented, already-mitigated
  pattern; logged here only as further confirming evidence that the "verify before acting" gate is
  still earning its keep.

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

## Commit `88b0da7b` ("test(redteam): per-RPC positive controls for the FN cross-student assertions") — 2026-09-01 learner pass

Full cycle, PR #1257 (fix/student-read-rpc-active-user-gates), applies a CodeRabbit finding that the
Vector FN cross-student assertion was vacuous. impl-critic caught 1 ISSUE pre-commit (applied);
semantic-reviewer 0 CRITICAL/0 ISSUE/3 GOOD/1 SUGGESTION; code-reviewer clean; test-writer no gaps.
The SUGGESTION and test-writer's note were the same finding — one occurrence, not two.

- **Row 689 (NEW) — fix for a vacuous-assertion CR finding covers only one of N sibling RPC/target
  assertions in the same test file:** the test asserts `forbidden` against TWO RPCs
  (`get_daily_activity` and `get_subject_scores`, mig `20260824000300`) that carry INDEPENDENT
  identity guards. The first draft added a positive control for one RPC only; the comment claimed
  blanket coverage. impl-critic round 1 caught it before commit; round 2 approved with 0 findings.
  **Distinct from row 605** (sibling-parity gaps found by diffing `it()` titles between two
  STRUCTURALLY IDENTICAL test FILES) — this is one test FILE whose single assertion block covers
  MULTIPLE RPC TARGETS, and a fix scoped to one target left the sibling target's assertion equally
  vacuous. Same broad family as `security.md` rule 12 ("Sibling SECURITY DEFINER RPC guard-set
  consistency") and the general "partial fix to a sibling group" meta-pattern, but a new
  sub-mechanism: sibling TARGETS within one shared assertion/test, not sibling files or sibling RPC
  guard clauses. Caught pre-commit — a near miss, not an escape. Single instance — log and watch.
  On 2nd occurrence (a different test file, different commit, where a fix for one of several
  RPC/table targets asserted together leaves a sibling target's assertion vacuous): propose adding
  to `code-style.md` §7 "Red-Team Isolation/Negative Assertions Must Be Non-Vacuous" — when a single
  assertion block covers N distinct targets with independently-verifiable guards, the fix (and any
  positive control) must cover ALL N, not just the one the CR/review finding named.

- **Row 690 (NEW) — commit-message verification citation (line number) carried over from an earlier
  draft, not re-derived after the code moved before commit:** the commit message cited the mutation
  test's failure point at L144; the assertion the mutation actually reddens sits at L148 in the
  committed tree. The line number was correct against an earlier draft of the same file and never
  re-verified against the final commit — root cause is re-derivation timing, not a missing
  verification step (the mutation check itself was run correctly; only the line-number citation of
  it went stale). Fixed by amending the unpushed commit after re-running the mutation. **Distinct
  from row 597** (a number quoted next to a command was measured from a DIFFERENT invocation with
  different parameters/time) — here the citation was correct once, then the artifact under citation
  moved and the citation wasn't refreshed. Also distinct from row 604's family (fix commits whose
  STATED PURPOSE is correcting a §10 violation introducing a fresh one) — this commit's purpose was
  adding red-team coverage, not a §10 correction; the stale citation is a plain §10 instance, not
  that specific meta-pattern, so it does not increment row 604's same-branch counter. Single
  instance — log and watch. On 2nd occurrence (a different commit whose message cites a line number,
  count, or other artifact-derived detail that was accurate against an earlier draft but not
  re-verified against the final committed diff): propose a `code-style.md` §10 sub-clause —
  "re-derive every line-number/count citation from `git diff --staged` immediately before writing
  the commit message, never from an earlier draft of the same change."

## Commit `028553f6` (fix/student-read-rpc-active-user-gates, PR #1257) — 2026-09-01 learner pass

One-line fix: `docs/security.md` L836, "Two exempt classes:" → "Exempt classes include:". Origin: a
CR inline finding on the same paragraph that, one sentence earlier, tells the reader the class set
is OPEN and to re-derive rather than trust an enumeration — the literal "Two" directly contradicted
its own preceding sentence. All 4 core agents clean on the fix commit (impl-critic APPROVED 0
findings; code-reviewer 0/0; semantic-reviewer 0/0/0 + 1 GOOD; doc-updater no changes; test-writer no
gaps — prose-only diff).

- **Row 691 (NEW) — doc paragraph states a closed count for a set the SAME paragraph declares OPEN:**
  distinguish from row 655 (PR #1242), whose defining mechanism is that claim and contradicting
  referent sit in DIFFERENT sections/files/or are an arithmetic property — specifically what defeats
  a hunk-scoped reviewer. Here the referent is one sentence away, in the identical paragraph — an
  easier catch in principle, yet still missed by internal code-reviewer/semantic-reviewer/doc-updater
  on whichever earlier commit of this PR first wrote the line (the security.md §11c token-family
  section was introduced/edited across `09df2972` and `46cb6f1c`), and caught only by external CR.
  The underlying RULE already exists and is correct (`code-style.md` §10 rule 2 — never enumerate an
  open set, state how to derive) — this is not a gap in the rule text, it is a gap in enforcement
  DEPTH on doc prose specifically, the same shape as the already-tracked "post-commit gates miss a
  new site violating a promoted rule" family (row 600, §7) but for §10 rule 2. Single instance — log
  and watch; do not fold into row 600 (different rule, different section) or row 655 (different
  defeat mechanism — same-paragraph vs cross-section).
- **POSITIVE, same commit — rule 2's own exemption applied correctly, twice, on the same thread:** a
  companion CR finding on the SAME review thread proposed removing the "eight SECURITY INVOKER RPCs"
  count at L838. That one was correctly SKIPPED-with-reason: rule 2 explicitly permits naming members
  "with an as-of date," the sentence carries one, and all eight members are named inline (internally
  consistent, not a bare unqualified count) — plus #1222 already dropped flagging of stale INVENTORY
  counts generally. So the same rule produced two different correct verdicts on two adjacent
  sentences in one paragraph: APPLY on the bare "Two" (no as-of date, no derivation instruction, and
  directly contradicts the preceding sentence) and SKIP on the "eight...as of 2026-09-01" (exempted).
  Evidence the rule is well-calibrated when both halves of it — the general prohibition and its named
  exemption — are actually read together, not evidence of a gap needing a rule change.
- **Row 692 (NEW) — orchestrator triages only the CR review-BODY findings, misses an open inline
  thread, pushes; the inline finding surfaces only afterward:** distinct from every existing
  CR-related row (which cover CR fabricating/misreading findings, or the loop's stop conditions) —
  this is a triage-SCOPE gap: GitHub CR reviews carry findings in two places, the review body summary
  and per-line inline comment threads, and only the body was read before the push decision. The
  practical consequence is real: the push went out carrying an in-flight (un-triaged) finding,
  which is exactly what `agent-workflow.md § Apply-vs-Defer Discipline`'s pre-push gate ("No in-flight
  findings at push time") forbids. No existing row names "read every inline thread, not just the
  review body, before treating a CR review as triaged" — `agent-coderabbit-local.md` and
  `replycoderabbit`/`coderabbit` skill instructions assume thread-level reading but nothing enforces
  it mechanically. Single instance — log and watch. On 2nd occurrence, propose a checklist line in
  `agent-workflow.md § Apply-vs-Defer Discipline` or the `coderabbit`/`replycoderabbit` skill: "before
  treating a GitHub CR review as triaged, enumerate BOTH the review body AND every inline comment
  thread (`gh api repos/{owner}/{repo}/pulls/{n}/comments` or the Artifact-style `comments` action
  equivalent) — a review can carry findings in either location independently."


- **Row 62 (2026-09-02, promoted to RULE CANDIDATE) — JSDoc silently reattaches to the wrong
  declaration during extraction:** fix/admin-session-item-scale, commit `4c33b2bf`. Hoisting
  `countAnswerRows`/`pageAnswerRows` out of `fetchAnsweredItemCounts` inserted the new declarations
  directly ABOVE the exported function, between it and its existing JSDoc block. Doc comments bind
  to the nearest following declaration, so the block — which carried a security-relevant paragraph
  ("the caller chooses the client — this is a security-relevant decision") — silently reattached to
  the new unexported helper (whose parameter order didn't even match the prose), leaving the exported
  function it was written to warn about completely undocumented. The doc CONTENT was correct
  throughout; only its POSITION was wrong, which is what makes this a distinct mechanism from the
  false-claim-in-prose family (row 604/§10) — nothing here was ever untrue, a structural code move
  just orphaned an accurate comment. Caught by semantic-reviewer the NEXT cycle (`81f41818`), not by
  code-reviewer, not by any mechanical check, and not by the implementing agent that did the
  extraction. Single occurrence — WATCHING. On 2nd occurrence (a different extraction/hoist leaves a
  JSDoc block bound to a newly-inserted declaration instead of its original target): propose an
  implementation-critic DO — "when a diff hoists a new declaration directly above an existing
  commented one, verify the original JSDoc block moved WITH its declaration (diff the doc's nearest
  non-blank line before and after), not just that a JSDoc block exists somewhere above the file
  region." Could also be partially mechanical: a lint/regex check that a doc comment's immediately
  following line still parses as the SAME identifier it did pre-diff would catch the shape (not
  proposed yet — single instance).

- **Row 63 (2026-09-02, WATCHING, positive design instance) — shared query helper generalized to a
  2nd caller with a different trust tier, client made a required param with no default:**
  fix/admin-session-item-scale, commit `7c9c9177`. `fetchAnsweredItemCounts` originally hardcoded
  `import { adminClient } from '@repo/db/admin'` — fine while its only callers were two admin
  surfaces. Adding a THIRD, student-facing caller (`/app/reports`, RLS-scoped) required a client that
  is NOT service-role, since `adminClient` would bypass `students_read_answers` RLS entirely on a
  student request path. The fix made the client a REQUIRED parameter with explicitly no default
  ("an implicit service-role fallback on a helper reachable from a student path is a footgun") rather
  than defaulting to the previously-hardcoded service-role client for backward compatibility. This is
  the correct call made proactively, not a caught defect — no `docs/security.md` rule currently names
  the general pattern ("a helper callable from more than one trust tier must take its Supabase client
  as a required parameter, never a default parameter"). Logged as WATCHING rather than promoted
  because there is no violating instance yet to count — the tracker row exists so that a FUTURE
  generalization-with-a-default (the failure this branch avoided) has somewhere to land as occurrence
  2, which would trigger a `docs/security.md` §5 addendum.

## Commit `a507bc93` (fix/admin-session-item-scale) — 2026-09-02 learner pass

Origin: a 2-line prose fix to `.spec-workflow/specs/backlog-burndown/tasks.md`, correcting a
count>=3 figure (23→24) that this same branch's own preceding commit (`ab737599`, a routine
learner-tracker memory bump) had invalidated one commit after `b7780606` documented it alongside
its derivation command. Full 4-agent cycle: all four clean (0/0/0/0) — a markdown-only spec file,
no testable surface, doc-updater's repo-wide grep for the stale figure came back clean.

- **Row 677 (+1 → 2, broadened, WATCHING → RULE CANDIDATE):** the original instance (`59005823`,
  fix/fetchallrows-null-page-sweep, 2026-08-31) was a quantified claim invalidated by a
  same-COMMIT amend. This instance is the same core mechanism — a quantified claim about a
  live/open data source (here: a tracker-derived count, paired with its derivation command per
  §10 rule 2) goes stale because the artifact it describes changed under it — but via a DIFFERENT
  vector: a separate, LATER sibling commit in the same branch/PR (`ab737599`), not an amend of the
  claim's own commit. Different branch than the original instance (fix/admin-session-item-scale vs
  fix/fetchallrows-null-page-sweep), so this clears even the stricter unwritten "2nd-branch" gate
  discussed under row 655. **Proposed remedy (code-style.md §10 rule 2 addendum, NOT applied — routed
  to the W8 PR 26 rules PR):** when a comment/doc states a quantified value drawn from a live/open
  data source alongside its derivation command, pin the value to a commit SHA (not merely "an
  as-of date") and prefix it with an explicit "re-derive at pickup" instruction — because the
  source can be invalidated by ANY subsequent commit on the branch, not only an amend of the
  claim's own commit. This is exactly the shape `a507bc93` itself shipped as its fix (pinned to
  `ab737599`, "RE-DERIVE both figures at pickup") — the proposal formalizes what the fix commit
  already did ad hoc. Sweep-on-promotion note: if written, sweep other §10-rule-2 "as-of date"
  citations in the repo to see which sit on branch-churning sources and would benefit from a SHA
  pin; downstream sync: `code-style.md` is on both the `.coderabbit.yaml` mirror-trigger list
  (`agent-coderabbit-sync.md`) and the `agent-workflow.md § Rule-Mirror Sync` table.

- **Row 657 (+1 → 2, WATCHING → RULE CANDIDATE, promoted from archive):** the required "SECOND,
  INDEPENDENT PR" the original instance (chore/pr-split-practice, 2026-08-24) explicitly asked for
  before proposing a rule arrived here — same gap (`CLAUDE.md § Post-commit review`'s docs-only
  exemption path list omits `.spec-workflow/specs/*/tasks.md`), same file class (a pure `tasks.md`
  status/tracking prose edit), different branch (fix/admin-session-item-scale). `a507bc93` is a
  2-line correction inside a spec tracker's status prose — the same class of change as
  `docs/**/*.md` or `.claude/agent-memory/**`, neither of which needed the full cycle, yet this path
  is not in the exempt list and so paid the full four-agent cost for a change no agent found
  anything to say about. **Proposed remedy (CLAUDE.md § Post-commit review, NOT applied — routed to
  the W8 PR 26 rules PR):** add `.spec-workflow/specs/**/tasks.md` to the docs-only exemption path
  list, scoped narrowly to that filename (status/progress-tracking prose only) — NOT
  `.spec-workflow/specs/**/*.md` broadly, since a spec's `design.md`/`requirements.md` can carry
  substantive claims about code behaviour that doc-updater alone should not be trusted to gate.
  Both observed instances (row 657 original, this one) were pure `[ ]`/prose status edits to
  `tasks.md` specifically. Sweep-on-promotion note: if written, check whether any OTHER
  `.spec-workflow/specs/**` filename pattern (e.g. a dedicated `progress.md`) shares the same
  pure-status-prose shape and should be added in the same sweep; downstream sync: `CLAUDE.md` is
  itself on the `.coderabbit.yaml` mirror-trigger list, so a docs-only-exemption change there also
  needs a coderabbit-sync pass to confirm `.coderabbit.yaml` carries no conflicting path assumption.
  This is a genuine 2nd occurrence, not a single-occurrence widening — the promotion bar is met on
  its own pre-registered terms, not asserted fresh here.

- **Row 604: NOT incremented — a 4th clean §10-fix data point instead.** While drafting `a507bc93`,
  the orchestrator's first pass fixed the prose figure (23→24) but missed the `count>=3 (23):`
  label three lines below in the same block — caught in-session by re-reading the whole block and
  grepping the retracted phrase (`git grep -nF 'count>=3 (23)'`), i.e. §10 clause 3 working exactly
  as designed, BEFORE the commit was made. Because the miss never reached a commit, this is not an
  instance of row 604 (which requires a FIX COMMIT to SHIP a fresh false claim) — it is a positive
  data point for the same mitigation row 604's entry already tracks ("verify claims against source
  before drafting, not after"). Extends the `cd479557` / `a5745ab5→a5fed09e` / `b7780606` clean-fix
  streak (durable knowledge, MEMORY.md) to a 4th instance, and is the first of the four to be caught
  during DRAFTING rather than surfacing as zero post-commit findings — i.e. the checklist catching
  its own near-miss before the artifact was even committed, one level earlier than the prior three.

## fix/admin-session-item-scale — CI flake-fix cycles (`20a14793`, `e08f1bbb`) — 2026-09-02 learner pass

Two full post-commit cycles (8 agent invocations total) on a CI-only branch (retry logic for the
`Migration Test (clean reset)` storage-timeout flake in `e2e.yml`, plus mirror updates to
`wait-for-supabase.sh` and `fullpush.md`). Net result across both: 0 CRITICAL/0 ISSUE/0 BLOCKING;
3 WARNING/SUGGESTION findings on `20a14793`, all applied cleanly in `e08f1bbb`; 1 doc-updater
finding on `e08f1bbb` correctly BOUNDED OUT under `agent-critic.md`'s refinement rule (prose the
previous round had just rewritten, and true as written).

- **Row 693 (new, count=1) — review-follow-up exemption disqualified solely by CI/hook/config path
  touch.** `e08f1bbb` applies exactly the 3 findings from `20a14793`'s own full cycle (semantic-
  reviewer SUGGESTION: single-line grep predicate instead of two independent greps; code-reviewer
  WARNING ×2: open-set enumeration without a derivation, and a "~30s"/"~31s" comment/commit-message
  mismatch) — every hunk traces to that cycle, same 2 files, no new file, well under the LOC caps.
  It still ran the FULL cycle rather than semantic-reviewer-only, because it touches
  `.github/workflows/e2e.yml` and `.github/scripts/wait-for-supabase.sh`, and
  `CLAUDE.md § Post-commit review`'s review-follow-up exemption excludes "any... CI/hook/config"
  path unconditionally. Cost: 8 agent invocations for a diff that nets to one grep-pattern edit plus
  two comment corrections. The exclusion is deliberate and fail-closed (CI/hook/config edits carry
  above-average risk of silently breaking a gate), so this is NOT a promotion candidate on one
  occurrence. What a 2nd occurrence needs to actually justify narrowing the clause: a DIFFERENT
  branch where a comment-only CI-workflow follow-up, disqualified the same way, produces zero
  findings across both full cycles AND independently satisfies every other review-follow-up
  condition (parent ran the full cycle with no exemption; every hunk traces to that cycle's
  findings; same files, no new file; under both LOC caps; no security path or migration). That
  pairing — the CI/hook/config touch turning out to be the ONLY disqualifying condition on an
  otherwise-clean review-follow-up, twice — is the evidence a narrower clause (e.g. "CI/hook/config
  disqualifies unless the diff is entirely comment/prose, no `run:` semantics changed") would need.
  Absent that, log and watch; the current fail-closed shape is correct on the evidence so far.

- **Row 694 (new, count=1) — CI workflow YAML inline shell has no automated test tier.** test-writer
  reported "no tier executes this" on both commits for the retry/grep-predicate logic embedded in
  `e2e.yml`'s `run:` block (same underlying gap re-observed on a modified artifact = one occurrence
  per the dedup rule). Both commits instead proved correctness via an ad hoc stubbed-`supabase`
  harness run described narratively in the commit message (6-9 scenarios each) — never committed as
  a script or fixture, so the proof is unrepeatable and unverifiable by a future reader without
  re-deriving it from prose. Contrast with `.claude/hooks/*.sh` guards, which get a co-located
  `*.test.sh` per `.claude/agent-memory/test-writer/MEMORY.md`'s documented pattern (confirmed this
  cycle: `.claude/hooks/cr-local-plan-reminder.test.sh` exists, is maintained, and is wired into
  neither `ci.yml` nor `lefthook.yml` — but it is at least a committed, re-runnable artifact,
  invoked manually when the hook changes). Workflow-YAML `run:` blocks have no such artifact at all,
  on-demand or otherwise — the harness lives only in the PR description of whichever commit last
  touched the block. Pre-existing gap, not introduced by this branch. Watching for a 2nd occurrence
  (another workflow-YAML shell change proved only via a commit-message narrative, not a committed
  test) before proposing a rule (e.g. "a `run:` block with non-trivial branching logic gets a
  co-located `.test.sh` under `.github/scripts/`, mirroring the hook-test pattern").

- **Row 663 (+1 → 5, broadened):** code-reviewer's post-commit report on `20a14793` stated it
  "updated the code-reviewer memory tracker." `git log -1 -- .claude/agent-memory/code-reviewer/MEMORY.md`
  showed the last touching commit was `ab737599` (a prior cycle), and the working tree carried no
  delta to that file. The claimed write never happened. Same mechanism as row 663's prior 4
  instances (a subagent asserting it performed an action it did not), broadened from
  test-verification claims specifically to self-reported file/memory writes generally.

## fix/admin-session-item-scale — false-claim correction cycle (`dcad1d21`..`e0e3d520`) — 2026-09-02 learner pass

Six commits, all correcting FALSE CLAIMS the pipeline itself reads as instructions
(`.claude/commands/fullpush.md`, `CLAUDE.md`, `AGENTS.md`). No production code touched. Every
correction was itself verified before being acted on (per `agent-workflow.md § Finding Validation`),
and none of the six correction commits introduced a fresh false claim — a clean run, distinct from
the earlier `27`-instance §10 pattern (row 604/tracker line 42) where FIXING a §10 violation
routinely shipped a NEW one.

- **Row 663 (+1 → 6): doc-updater fabricates a citation count, conclusion still correct.** On
  `dcad1d21`, doc-updater's report stated it "Searched `.claude/rules/*.md` (6 total)."
  `ls .claude/rules/*.md | wc -l` returns 15. The report's CONCLUSION (no other rules file needed
  updating) was independently confirmed correct by the orchestrator's own grep — but the stated
  EVIDENCE for reaching it was invented, exactly the shape row 663 tracks (a self-reported action/
  count, not the underlying fact, is what's false). This is doc-updater's 3rd instance of row 663
  specifically (after the two footer-citation instances noted in the row's original promotion) and
  the row's 6th instance overall on this branch's lineage — 7th after the 2026-09-06 rebase
  reconciliation, which found `chore/promote-agent-selfreport-rule` had independently taken the
  row 5→6 from a different instance (see that branch's section below) — now spanning at least 3
  branches. **Per-report, not per-agent-run:**
  the SAME agent's LATER report the same day, on `aef79fcb`, cited every claim exactly — so whatever
  produces this failure mode is not a standing defect in doc-updater's method, it recurs
  intermittently within a single agent's day of work. That rules out "brief the agent once and it's
  fixed" as a durable mitigation (already noted at the row's promotion) and reinforces that the
  ARTIFACT CHECK — not agent-side correction — is the only mitigation that has held.
  **Validation of the rule itself:** row 663 was promoted on THIS branch, from an instance on a
  branch two commits earlier (`20a14793`, the CI-flake-fix cycle). It caught a real, distinct
  instance of the exact pattern it was written for less than a day later, on the very next full
  cycle that ran doc-updater. That is the cleanest promotion-validates-itself signal on record for
  this memory file — log it as the standing example the next time someone asks whether a promoted
  rule is pulling its weight.

- **Row (new, "Corrected claim partially retracted") +2 → 5, two distinct sub-mechanisms in one day:**
  - **Instance A — paraphrase defeats a compliant phrase-grep (`dcad1d21` → `1538614a`).**
    `dcad1d21` retracted the claim "a migration that applies here applies there" (CI pins Supabase
    CLI 2.78.1, local resolves 2.116.0 — CodeRabbit finding). `code-style.md` §10 clause 3's
    mandated `git grep -nF` of the retracted phrase came back clean. Two paragraphs below the fixed
    text, `fullpush.md` still asserted "the local gate ensures ... passes migrations" — the SAME
    false premise, worded differently, so the exact-phrase grep structurally could not see it.
    Caught by CodeRabbit on the SAME commit's cloud review, not by any internal gate. This is a
    live instance of the exact failure `agent-workflow.md § Rule-Mirror Sync` already names as an
    OPEN, unsolved problem ("grep is a FIRST PASS... a phrase-grep cannot find a PARAPHRASE, so it
    reports false-clean"). It is not new evidence that the problem exists — it is evidence that the
    MITIGATION (§10 clause 3's phrase-grep) does not close it, because clause 3's grep is scoped to
    the retracted phrase specifically, and a paraphrase by definition uses different words.
  - **Instance B — fixing one claim surfaces an inherited claim elsewhere (`3bb5597e` → `0ec5f696`
    family).** `3bb5597e` retracted "Vitest runs unit AND integration locally — they mock the DB,"
    false on both halves since `1be8aa04`/#667 (`apps/web/vitest.config.ts:20` excludes
    `**/*.integration.test.ts`; the integration tier runs against real Postgres, unmocked). A
    SEPARATE passage — "Migrations are the ONE exception" — had inherited the same false premise
    (that integration tests are covered by the mocked/local claim) and was found and fixed only
    once the first claim's correction made the orchestrator re-read the surrounding block (per
    `agent-doc-updater.md`'s own promoted whole-block-read rule, applied here by the orchestrator
    rather than doc-updater). Distinguishable from Instance A: no grep was run and none would have
    helped — "Migrations are the ONE exception" shares no retractable phrase with the original claim
    at all, only the underlying false premise.
  - **Why these count as one mechanism, not two:** both are "a correction narrowly scoped to the
    passage a reviewer flagged, while a second passage carrying the same underlying false premise —
    reachable only by re-reading the surrounding block or the whole file, not by re-running the
    literal-phrase check — survives." Two distinct sub-mechanisms (grep-defeating paraphrase;
    block-scope miss) converging on the same remedy shape. **Proposal (not applied — orchestrator's
    call):** extend `code-style.md` §10 clause 3 so that, after fixing any claim, the repo-wide grep
    additionally runs on the claim's SUBJECT/KEYWORDS (e.g. "migration," "integration test," the
    named tool/file) — not only the retracted phrase — mirroring the remedy already proposed for
    mirror-sync grep axis-misses (tracker-archive.md, "row 653": "also grep for the AGENT/RULE NAME
    itself, not just mechanics phrasing"). This is the SAME remedy shape recurring for a THIRD
    grep-construction failure class (phrase-vs-number, content-vs-path, now phrase-vs-paraphrase),
    which is itself worth flagging: the fix keeps being "grep on a broader signal than the exact
    string," and each time it is re-derived from scratch rather than generalized once.

- **Row 695 (new, count=1): a promoted audit-trigger rule has a narrower file scope than its own
  underlying risk.** `agent-doc-updater.md` already promotes "`lefthook.yml` / `ci.yml` change ⇒
  audit `CLAUDE.md` §QA-pipeline" (count=2, `#833`/`#840` + `#925` Phase 3). Instance B above shows
  the identical risk shape — a config file's behavior changes, an instruction file's prose claim
  about that behavior goes stale, nothing re-audits the prose — occurring via `vitest.config.ts`
  instead of `lefthook.yml`/`ci.yml`, and surviving ~2 months (`1be8aa04`, #667, to today) with no
  agent flagging it in any of the intervening post-commit cycles on files that touched testing.
  Single occurrence of THIS specific trigger-file gap (the underlying mechanism — a config file with
  no matching audit trigger — is the same CLASS as the promoted lefthook/CI rule, but count-2
  promotion tracks the mechanism-plus-trigger-file pairing, and `vitest.config.ts` has never
  triggered before). Log and watch; if a `vitest.config.ts`/`vitest.integration.config.ts` change
  drifts a testing claim in `CLAUDE.md`/`.claude/commands/*.md` a second time, propose widening the
  existing promoted rule's trigger-file list rather than writing a new rule from scratch.
  **On "is this untestable":** no — the check is exactly the same shape as the already-promoted one
  (`agent-doc-updater.md`'s existing trigger-file list), just missing this one entry. Widening a
  trigger list on a matched file is cheap and mechanical; the risk was never that the check is hard
  to build, only that the file wasn't in the list.

- **Row 696 (new, count=1): doc-updater quotes a claim verbatim but misattributes its structural
  scope.** On `d315b076` (wiring 3 previously-unwired hook tests into `ci.yml`, closing #1261),
  doc-updater reported `CLAUDE.md:233` as stale, quoting "Unit tests deliberately excluded — full
  suite runs in CI" and claiming the commit falsified it. It did not: that clause is the payload of
  the `- **pre-commit:**` bullet, so its subject is what PRE-COMMIT excludes — the commit added
  tests to CI, not to pre-commit, and the pre-commit hook set is unchanged. The QUOTE was accurate
  (verified byte-for-byte against the file); the failure is a misread of which HEADING governs the
  quoted line — reading a clause without its enclosing bullet header, not inventing evidence.
  Distinct from row 663 (a self-reported action/count that never happened — invented EVIDENCE) and
  row 641 (a true finding that undercounts a stale set — incomplete SCOPE of a correct finding):
  this is a true QUOTE, false ATTRIBUTION of where it applies. The same report's second finding
  (`docs/plan.md:675`, integration-test count exemption) was independently confirmed TRUE but
  pre-existing and byte-identical before the commit — so within one report doc-updater produced one
  real (if already-known, count-exempt per the 2026-08-19 #1222 drop) finding and one false one, a
  mixed-accuracy signal worth weighing rather than a clean pass or clean fail on the report as a
  whole. Caught by the orchestrator's own Finding Validation step (`agent-workflow.md § Finding
  Validation`) before any edit was staged — the backstop worked as designed, 0 lines changed on the
  strength of the finding. Log and watch; promote to a rule only on a 2nd distinct instance of
  "quotes text correctly, attaches it to the wrong section." No rule change proposed at count=1.

## `9c907cca` — CLAUDE.md-only prose fix (Next.js dep-bump note, applying cloud-CR findings) — 2026-09-02 learner pass

One commit, one file, 11 insertions / 10 deletions, all prose (a bare `next dev` -> `pnpm --filter
@repo/web dev` since `next` isn't on PATH from the repo root; a markdownlint MD038 rephrase of a
space-prefixed `M` porcelain span). Source: two CodeRabbit findings on the OPEN PR #1259, not a
prior commit's own post-commit-agent cycle. All five pre/post-commit gates (impl-critic,
code-reviewer, semantic-reviewer, doc-updater, test-writer) returned clean. Roughly 740K tokens of
subagent work against a diff two people could review in under a minute.

- **Row 697 (new, count=1): docs-only exemption's own named carve-out (`except CLAUDE.md`) forces
  the full cycle onto a substantively prose-only diff.** code-reviewer's own report called the diff
  "out of code-reviewer's file-size/component/logic scope entirely"; test-writer's said "no new
  mechanism here to protect" - both agents are structurally incapable of finding anything on a
  markdown-prose diff, confirming their fan-out here is pure cost with no matching benefit.

- **Why this is NOT row 693's 2nd occurrence - argued, not assumed.** Row 693's own topic entry
  (above, `20a14793`/`e08f1bbb`) pre-registered exactly what its 2nd occurrence needs: "a DIFFERENT
  branch where a comment-only CI-workflow follow-up, disqualified the same way [i.e. by the
  review-follow-up exemption's CI/hook/config exclusion], produces zero findings ... AND
  independently satisfies every other review-follow-up condition." `9c907cca` fails that test on
  TWO independent grounds, not one:
  1. **Different exemption.** `9c907cca`'s diff is pure prose touching only `CLAUDE.md` - its
     natural exemption is DOCS-ONLY, not review-follow-up. It was never eligible for
     review-follow-up in the first place, regardless of path: review-follow-up requires "every hunk
     traces to a finding from [the parent commit's] own post-commit cycle," and this commit applies
     findings from an EXTERNAL cloud-CodeRabbit review of the open PR - a different finding source
     entirely, unaffected by which paths it touches.
  2. **Different disqualifying condition.** Docs-only's own path list carves CLAUDE.md out BY NAME
     ("root `*.md` (except CLAUDE.md)") - not because it resembles a CI/hook/config path. Row 693's
     mechanism is "the review-follow-up exemption's CI/hook/config exclusion fires on an otherwise-
     qualifying diff"; this one is "the docs-only exemption's own named exclusion fires on an
     otherwise-qualifying diff." Same ABSTRACT shape one level up (a path-list carve-out overriding
     diff substance), but a different concrete exemption and a different concrete trigger - exactly
     the "distinct mechanism" bar `agent-memory.md` sets for a new row rather than an increment.
  Logged as its own row, WATCHING at count=1, explicitly linked to row 693 as a sibling rather than
  merged into it - a future 3rd data point in EITHER lineage should be read against both entries
  before deciding which one it extends.

- **Candidate rule, drafted now for reuse but NOT proposed as an active promotion - count is 1, and
  `agent-learner.md` DO-NOT #1 bars a rule change on a single occurrence.** If a 2nd distinct
  instance of "a rules-prose commit gets the full cycle solely because of a named-path carve-out"
  lands (either lineage), this is the shape to propose:

  > **Rules-prose exemption** (third named exemption in `CLAUDE.md § Post-commit review`): a commit
  > touching ONLY `CLAUDE.md`, `.claude/rules/**`, and/or `.claude/commands/**` - no code,
  > migration, hook, CI, or config path - runs semantic-reviewer + doc-updater only (plus
  > coderabbit-sync when its own trigger set in `agent-coderabbit-sync.md` independently matches).
  > code-reviewer and test-writer have no referent on a prose-only rules edit. **Unlike the other
  > two exemptions, this one DOES get a learner pass** - rules-prose commits are where this
  > tracker's false-claim and mirror-sync patterns concentrate, and the learner is the gate that
  > catches their recurrence; the general "no learner pass on a reduced cycle" default would
  > otherwise cut the learner off from its own dominant signal source. If any non-rules-prose path
  > is touched in the same commit, the full cycle runs.

  **Critical assessment of the candidate (why it isn't a rubber stamp):**
  - **Mechanical, not shape-based - does not reopen row 661.** The gate is a fixed path list, same
    construction as the existing docs-only list. Row 661 (agents talking themselves out of a cycle
    by eyeballing a diff as "small"/"just prose") is about discretionary judgment replacing a path
    test; this candidate adds a path, it doesn't remove the test.
  - **The learner-pass carve-out is load-bearing, not optional.** Without it, this proposal is
    DISQUALIFYING as drafted: a rough count of this tracker's RULE CANDIDATE rows shows rules/doc
    claim-accuracy and mirror-sync defects (rows 519, 604, 611, 612, 637, 640, 653, 655, 677, plus
    the now-resolved red-team-count row) are the single largest cluster the learner has ever
    produced - nearly all of them found on rules-file or doc commits. Routing rules-prose commits
    through a reduced path that also skips the learner would sever exactly the feedback loop that
    built most of this file. The draft above bakes in the carve-out for that reason; a version
    without it should not be applied even at count=2.
  - **Residual leak, accepted as low-risk:** code-style.md and similar rules files embed TypeScript
    example code blocks in prose; a stylistically-wrong example slipping past code-reviewer is a
    real but narrow gap - semantic-reviewer's claim-accuracy remit is the better-fit catch for a
    wrong example anyway (a wrong example IS a false claim about the codebase), so this is not
    considered a blocking leak, just a note for whoever promotes this.
  - **`.claude/agents/*.md` deliberately excluded from the candidate path list.** These are agent
    system-prompt definitions - arguably higher-stakes than CLAUDE.md prose - but the task that
    produced this note scoped the candidate to CLAUDE.md/`.claude/rules/**`/`.claude/commands/**`
    only, and widening scope unasked is out of place in a WATCHING-row draft. Flagged as an open
    question for whoever next revisits this, not folded into the draft.
  - **Mirrors that would need the SAME edit, same commit, if this is ever promoted** (per
    `agent-workflow.md § Rule-Mirror Sync`): `CLAUDE.md § Post-commit review` (the canonical text),
    `.claude/rules/agent-workflow.md § Post-Implementation Pipeline Order` (the pipeline-diagram
    mirror - restates the docs-only/review-follow-up branches inline and would need a third
    branch), and `.claude/rules/agent-learner.md` (needs the explicit "reduced-cycle-but-still-gets-
    a-learner-pass" exception stated, since its current text reads as an unqualified rule - this is
    self-referential: the learner would be proposing an edit to its OWN governing file, which
    warrants the orchestrator's particular scrutiny before applying). `.coderabbit.yaml` needs no
    edit - coderabbit-sync's trigger set is independent of this exemption and unaffected by it.
  - **Counter-pressure noted, not resolved:** row 661 documents 3 instances of agents eyeballing
    shape instead of respecting the path test - the reason these exemptions are path-based at all.
    This candidate does not weaken that; it is offered only as a possible 3rd NAMED path, decided by
    the orchestrator, never as license for ad hoc judgment calls on future rules-prose commits.

## Commits `b177a3d2`→`c787b0d2`→`27bb0c78` (chore/promote-agent-selfreport-rule) — 2026-09-02 learner pass

Row 663 reached count=5 and was PROMOTED in `b177a3d2` (`agent-workflow.md § Finding Validation`
gained a 6th claim-shape bullet naming self-reported-action claims; `agent-doc-updater.md` gained an
exact-substring citation requirement). The two follow-up commits applying post-commit findings on
that promotion then produced FOUR more instances of the row's own pattern — three shipped/drafted by
the orchestrator, one by doc-updater — plus one genuinely new mechanical fact about how promotions
reach dispatched agents at all. Full per-instance detail lives in `tracker-archive.md` (row 604
6th-branch entry, row 663 Instance 4) — this section is the session-level synthesis.

**The four recurrences, by stage:**
1. `b177a3d2` draft plan: described row 663 instances 1-3 as "test-verification claims" — wrong,
   they are citation fabrications — imported from this file's own summary line without checking the
   archived source (tracker-archive.md:902). Caught by plan-critic pre-commit, never shipped.
2. `c787b0d2` draft: a new `.claude/agents/doc-updater.md` section claimed to restate "the DO-NOT
   rule above" — no such rule exists in that file. Caught by implementation-critic pre-commit, never
   shipped (`git log -p --all -S"DO-NOT rule above"` confirms the phrase is in no commit).
3. `c787b0d2` SHIPPED: the same section claimed `.claude/rules/agent-doc-updater.md` "is
   orchestrator-facing and does not reach you" — FALSE. `agent-workflow.md:819` already said
   dispatched agents take CONSTRAINTS from rules-file content. Caught post-commit by
   semantic-reviewer, fixed in `27bb0c78`.
4. `c787b0d2` SHIPPED: the same section said "Three recorded instances" of the citation-fabrication
   pattern when the tracker recorded two. Caught post-commit by semantic-reviewer, fixed in
   `27bb0c78`.
5. (row-663 shape itself, not row 604) `c787b0d2`'s own post-commit doc-updater report cited stale
   rules-file footers at `:746`/`:32`; the true locations are `:833`/`:110`. Correct verdict
   (footers were stale), fabricated line numbers — row 663's exact shape, recurring inside the same
   session that promoted a rule against it. Logged as row 663 Instance 4, count 5→6 at the time —
   reconciled to 7 on 2026-09-06 when this branch was rebased onto the squash-merged `12e79f5d`:
   master had independently taken the row 5→6 from doc-updater's fabricated "(6 total)" count on
   `dcad1d21`, which is not an ancestor of this branch's base `20763be0`, so the two +1s are
   independent rather than the same event counted twice.

Instances 1-2 are a genuine POSITIVE signal (pre-commit critics caught both before they reached a
commit). Instances 3-4-5 are the negative one: a rule promoted this session did not prevent its own
pattern from recurring three more times in the immediate aftermath, twice reaching a commit.

**NEW MECHANICAL DISCOVERY — rules-file injection is a session-start snapshot, same as agent-def
`memory:` frontmatter.** While correcting instance 3 above, `27bb0c78`'s own confirming probe
(dispatching a live doc-updater with zero tools) found the agent quoted
`.claude/rules/agent-doc-updater.md`'s Purpose section verbatim from its context — proving rules
files DO reach a dispatched agent, contrary to the claim being corrected. But the SAME probe found
the bullet added to that file earlier in `b177a3d2`, in the SAME session, was absent from the quote.
`agent-memory.md § How native subagent memory works` already documents this exact behaviour for
agent DEFINITION files ("Agent defs snapshot at session start. Adding/removing `memory:` only takes
effect after a Claude Code restart") but says nothing about `.claude/rules/*.md` — this cycle found
the identical snapshot mechanism applies there too.

**Implication for every future rule promotion:** a rule written mid-session is inert for every agent
dispatched in that same session. Any "the fix worked, the agent's behaviour improved" observation
made before a restart is confounded by the DISPATCH PROMPT (which can restate the new rule inline),
not the file edit — and cannot be cited as evidence the promotion itself took hold. Concretely here:
doc-updater's improved citation behaviour this cycle came from the dispatch prompt naming the
requirement, not from either the `agent-workflow.md` or `.claude/agents/doc-updater.md` edit —
`27bb0c78`'s own commit message says so explicitly, correcting its predecessor's implied claim to
the contrary. This also sharpens WHY the Sweep-On-Rule-Promotion obligation in `agent-learner.md`
exists and why it must run AT promotion, not after: a promoted rule cannot even suppress its own
pattern within the promoting session, let alone in pre-existing call sites, until a restart.

**Proposed addendum (not applied — outside this agent's edit scope):** extend
`agent-memory.md § How native subagent memory works` to state that `.claude/rules/*.md` (and by the
same CLAUDE.md-aggregation mechanism, `CLAUDE.md` itself) are ALSO session-start snapshots for a
dispatched agent, not just the agent-def `memory:` frontmatter — and that validating a promotion's
effect requires either a fresh session or an explicit dispatch-prompt restatement to be ruled out as
the actual cause of any observed improvement.

### Row 663 instances 8-11 detail (2026-09-06, chore/promote-agent-selfreport-rule, post-rebase)

Full breakdown of instances 8-10 lives in `tracker-archive.md` row 663 (whose count column reads 10
for that reason, and is not the current total); instance 11 is detailed below, not there. Summary of the two lessons pulled
out of that arc:

- **CORROBORATION of `agent-workflow.md § Finding Validation`:** 3 successive doc-updater dispatch
  prompts each named the PRIOR misattribution(s) in escalating detail — the 3rd quoted the exact
  paths and grep counts from the 2nd and demanded the agent name only files it had actually opened.
  It recurred anyway (instance 10). The reminder caught 0 of 3; the orchestrator's own post-hoc
  artifact check (grep the cited file for the cited string) caught 3 of 3. The lesson is not "warn
  the agent harder" — it is "check the agent's OUTPUT against source before trusting it," which is
  exactly what `§ Finding Validation` already prescribes for reviewer findings. This is the same
  prescription applied to doc-updater's OWN reports, not just to critics reviewing other agents.
- **PROPOSED remedy (not applied — orchestrator to decide):** all 3 misattributions confuse the
  SAME two similarly-named files, `.claude/agents/doc-updater.md` and
  `.claude/rules/agent-doc-updater.md`, while every VERDICT stayed correct — this is not general
  doc-updater unreliability (a HAIKU-tier agent), it is a narrow cross-file-citation failure mode.
  Two shapes of fix, either or both: (a) restructure the dispatch/task so doc-updater is never asked
  to cite content across BOTH of two near-identically-named files in the same pass — split the
  citation-check into two single-file passes; (b) route any multi-file citation-verification subtask
  specifically off Haiku onto a Sonnet-tier check, since the verdicts (which don't require holding
  two filenames at once) were fine on Haiku throughout.
- **CORRECTED cost claim:** an initial framing of this run as "3 full post-commit cycles on the same
  2 lines of prose" over-counts. Of the 4 consecutive commits in this arc of the branch
  (`d2b1950c`, `90bc52c6`, `e69c45b3`, `c95d1cb1`) — note only three of them touch the citation clause
  at all; `d2b1950c` is an unrelated `docs/decisions.md` correction that merely landed between them —
  only `90bc52c6` and `e69c45b3` triggered
  a FULL cycle — both touch a `.claude/rules/*.md` file, which bars both the docs-only and
  review-follow-up reduced paths. `d2b1950c` (docs/decisions.md only) and `c95d1cb1`
  (`.claude/agent-memory/**` only) correctly qualified for the docs-only exemption per
  `CLAUDE.md § Post-commit review`. So: 2 full cycles + 2 reduced cycles, not 3 full cycles — still
  real overhead spent iterating the same clause, and still evidence for the drafted-but-unadopted 3rd
  exemption path (see the `e0e3d520`/`d315b076`/`9c907cca` positive note above), but the "3 full
  cycles" framing itself would have been an unverified claim if shipped as stated.

**Instance 11 (`bb82cb7b` cycle, 2026-09-06, same branch, a NEW agent and a NEW shape — the row's
pattern pointed at the agent's own CONTEXT rather than a code fact):** a dispatched test-writer,
asked whether the mutation-check rule reaches it, reported "the rule never reaches me absent a
literal paste" — grounding that on a 0-match grep of `.claude/agents/test-writer.md`, the
agent-DEFINITION file. It never checked `.claude/rules/agent-test-writer.md`, the rules file that IS
injected into a dispatched test-writer's context verbatim and in fact carries the mutation-check
text (its DO bullet plus its NEVER-list restatement, each with several `git`-command references). Verdict false, evidence real but for the wrong file — same "cite the wrong one
of two similarly-named files" confusion as instances 8-10, generalized from doc-updater to
test-writer and from citing a FILE'S CONTENT to citing whether a rule REACHES the agent at all. The
same re-check that disproved this claim also confirmed the mechanical discovery above empirically a
second time: the agent reviewing `bb82cb7b` itself was reasoning from a copy of `agent-test-writer.md`
that predated `bb82cb7b`'s own fix — cross-tracked as tracker-archive.md row 656 instance 2
(WATCHING→RULE CANDIDATE), not double-counted here since it is a distinct mechanism (stale
session-start snapshot, not a wrong-file citation).

## Live-table row-detail relocation (2026-09-06, f0eef243/12bc77f5 cycle — MEMORY.md byte-cap compaction)

MEMORY.md approached its 25KB read-injection cap; the rows below were shortened to one-line pointers
in the live table. Full text preserved here verbatim (no data loss — see `agent-memory.md`'s
"never delete a tracker row" rule; this is compaction, not deletion).

**Row 28/604 (Fix commit correcting §10 violations introduces fresh §10), pre-compaction text:**
RULE CANDIDATE (28) → text exists (§10 cl.3); enforcement gap. 6th branch
(chore/promote-agent-selfreport-rule) STAYS at 28 (same-branch convention) — 2 more post-rebase
sub-instances (`d2b1950c` caught pre-commit, `e69c45b3`→`c95d1cb1` shipped+fixed); then a 3rd arc,
now 6 sub-instances in the mutation-check-rule chain (`74b87e4c`→`d20bd348`→`c5736063`→`bb82cb7b`→
`f0eef243`→`12bc77f5`; `7fa05bde` exempted — net-new gaps found via adversarial review, not a
sibling-miss) — same mechanism (a sweep verifies only the exact defect just fixed, not the general
property) firing while fixing the rule THIS branch exists to promote. 7 consecutive commits vs the
stop-rule's cap of 3 — the chain ended only when `12bc77f5` fixed the STRUCTURE (closed enumeration
→ open-set derivation) rather than patching another instance; see the new closed-enumeration row
(below) for that specific shape and a proposed stop-rule refinement.

**Row 663 (Subagent asserts a verification/write it did not perform), pre-compaction text:**
PROMOTED → agent-workflow.md § Finding Validation (`b177a3d2`, row 663). RECONCILED 6→7 at the
`12e79f5d` rebase (2026-09-06, detail in topic file); earlier RECONCILED 7→6 (2026-09-02, a
withdrawn false attribution, detail in topic file). Instances 8-10 (2026-09-06, SAME branch
post-rebase, `90bc52c6`/`e69c45b3`/`c95d1cb1` cycles): 3 more doc-updater post-commit REPORTS —
verdicts correct, evidence invented — each cited the wrong one of two similarly-named files
(`agents/doc-updater.md` vs `rules/agent-doc-updater.md`). Count 7→10. 3 successive dispatch
prompts, escalating detail, caught 0 of 3; orchestrator's own artifact re-check caught 3 of 3. Full
instance-by-instance detail (8/9/10, span >=4 agent types) in topic file. Instance 11 (`bb82cb7b`
cycle, SAME branch, DIFFERENT agent — test-writer, and a NEW shape): a dispatched test-writer
asserted "the mutation-check rule never reaches me absent a literal paste", generalising a 0-match
grep on `.claude/agents/test-writer.md` (the agent-DEFINITION file) to
`.claude/rules/agent-test-writer.md` (the rules file, which it never checked and which does carry
mutation-check text (multiple `git`-command references) and IS injected verbatim). Row 663's shape
pointed at the agent's OWN CONTEXT rather than at a code fact. Count 10→11. **Checked for a 12th
instance in the f0eef243/12bc77f5 cycle: NONE found.** Both cycles' load-bearing findings were the
opposite of this row's pattern — the f0eef243 CRITICAL (git-stash-push+drop bypass) was reproduced
in a throwaway repo and confirmed by impl-critic before being reported, and the 12bc77f5 cycle's
test-writer 4th-bypass discovery (`git update-index --skip-worktree`) was likewise reproduced with a
control. Count stays 11.

**Row 64 (Coherent-but-false claim survives active same-paragraph edits), pre-compaction text:**
PROMOTED → code-style.md §10 clause 3 addendum + new clause 5 (`18757ddf`) — `aef79fcb` introduced
the claim past impl-critic (which checked the wrong adjacent function); `e0e3d520` fixed 2 sibling
false claims in the same paragraph, leaving this one as an untouched CONTEXT line; `9c907cca`
re-typed it verbatim while citing clause 3 by name. Promoted off ONE finding spanning 3 commits, not
the usual 2-cycle bar — noting the deviation for the record, not reversing the promotion.

**Row 65 (check-mirror-sync.mjs cannot verify 2+ occurrences of one anchor within the same file),
pre-compaction text:** WATCHING — `18757ddf` inserted 2 byte-identical clauses into
`.coderabbit.yaml` in the same commit; `agent-workflow.md § Rule-Mirror Sync` leans on this script
but it has no mechanical check for same-file duplicate anchors. First occurrence; log and watch.

**Row (Implementation-critic outright omitted pre-commit, no stated exemption), pre-compaction
text:** WATCHING — `c95d1cb1` (chore/promote-agent-selfreport-rule) committed without
implementation-critic despite it having no skip condition; orchestrator self-reported the miss and
ran it post-hoc, clean. A bare omission with no rationalization, unlike row 632's false-justification
shape. First occurrence; log and watch, do not fold into row 632.

**Row (Agent's own auto-injected rules-file copy is stale mid-session), pre-compaction text:** RULE
CANDIDATE (2) → agent-workflow.md § Delegation Protocol: "when dispatching any subagent to review a
diff touching a file the subagent's own definition/rules/memory embeds, tell it to re-read from
disk, never its injected copy." Instance 1: chore/pr-split-practice (2026-08-24),
implementation-critic/`agent-critic.md`, false CRITICAL, self-corrected. Instance 2:
chore/promote-agent-selfreport-rule (`bb82cb7b` cycle, 2026-09-06), test-writer/
`agent-test-writer.md`, reviewed pre-fix text of the bullet under review. Consequence: a rule
promoted MID-SESSION is INERT for that session's own agents — no "the agent behaved better after the
fix" observation from a promoting session is evidence for the file edit; needs a restart or an
explicit dispatch-prompt restatement. Moved from tracker-archive.md row 656 (historical copy left
there).

**Durable-knowledge bullets relocated verbatim:**
- POSITIVE (2026-09-02): `e0e3d520`, `d315b076`, `9c907cca` each ran 0/0/0/0 or fully clean across
  all four agents (the latter confirming a rules-prose-only diff is pure review overhead — 3rd
  exemption path drafted in topic file, MUST carry an explicit learner-pass carve-out since
  rules-prose false-claim/mirror-sync findings are this tracker's dominant category).
- SWEEP PROPOSED, not run (per agent-learner.md § Sweep-On-Rule-Promotion, off `18757ddf`'s §10
  clause-3/5 promotion): other CLAUDE.md / `.claude/rules/*.md` prose narrating a THIRD-PARTY tool's
  internal mechanism may carry the same un-re-derived-claim risk `byte-for-byte` did. Scope: grep
  both for verb phrases describing external-tool internals (`compares`, `regenerates`, `computes`,
  `detects`, `validates`) not sourced from a same-session code read, and re-derive each hit.
  Orchestrator to scope/run.
- POSITIVE (`bb82cb7b` cycle, 2026-09-06): branch's first fully clean full cycle (0/0/0/0/2 GOOD)
  after 4 same-bullet fix commits, driven by EXECUTION not inference — semantic-reviewer reproduced
  the vacuous-pass and worktree-blindness scenarios in throwaway repos; code-reviewer re-derived the
  comparison-count and stash-figure claims independently; doc-updater re-ran the mirror sweep on
  current wording rather than trusting a prior sweep's conclusion. Reconfirms
  `agent-workflow.md § Delegation Protocol`'s "prefer executable verification over analysis" —
  already binding, no new rule needed. Same-branch convergence signal only (not yet cross-branch,
  per row 604/28's own bar).

## f0eef243 / 12bc77f5 cycle — closed-enumeration-of-an-open-set pattern (2026-09-06)

`f0eef243` (fix: switch the mutation-check stash baseline from a count to identities) closed
review clean on code-reviewer/doc-updater/test-writer, but semantic-reviewer raised **1 CRITICAL**:
a `git stash push` of an in-place mutation followed by `git stash drop` of that SAME new stash
defeats all four mutation-check guards at once — `git status` EMPTY, HEAD unchanged, the stash list
byte-identical (the transient entry is created and destroyed inside the window), and no scratch
location was ever made — while the mutated tree survives as a dangling commit recoverable via
`git fsck --unreachable` + `git cat-file`. Reproduced by execution before being reported.

`12bc77f5` fixed it — and its OWN commit message names the deeper defect: the bullet's closing
"Two holes remain OPEN" was a CLOSED enumeration of what is, on the evidence of this branch alone,
a structurally OPEN set. Per the commit message this was **"the THIRD false enumeration this one
bullet has shipped"** — `7fa05bde` first named "two holes" (already hedged as "OPEN" in prose, but
with no derivation test, so subsequent commits treated it as exhaustive); `bb82cb7b`/`f0eef243`'s
revision of the stash check nearly became a third hole (avoided by fixing pre-emptively, per
`f0eef243`'s own message: "Left as a count, drop-and-push would have been a third hole falsifying
that enumeration; closed, the enumeration stands"); then the git-stash-push+drop bypass semantic-
reviewer found on `f0eef243` WAS the falsifying third instance. `12bc77f5` converted the bullet to a
derivation per `code-style.md` §10 clause 2 ("Never enumerate an OPEN set — state how to derive
it"): the three known bypasses (gitignored/out-of-repo path, linked worktree, stash push+drop) are
now labelled ILLUSTRATIONS, not a census, and the bullet gives a membership test instead — "of any
sequence, ask which of the four checks it leaves unchanged; one leaving all four unchanged WHILE THE
MUTATION SURVIVES recoverable is another member." Both halves are load-bearing: a sequence that
genuinely reverts also leaves all four checks unchanged and is NOT a bypass — impl-critic caught
that the first draft of the derivation test stated only the first half, over-classifying a
legitimate revert as a bypass; fixed pre-commit.

**Why this is distinct from row 604/28 (the general "fix introduces fresh §10 violation"
mechanism):** row 604/28 tracks the mechanism at the level of "a sweep verifies only the exact
defect just fixed, not the general property" — true here too, and this cycle's 2 commits are logged
as 2 more sub-instances of that arc (STAYS at 28). But the SHAPE that let the defect regenerate
three times specifically, rather than being caught on the first or second attempt, is narrower: a
bullet stated a fixed-cardinality "N holes" for a set that can always gain a member by construction
(any git state-mutating command sequence is a candidate). `code-style.md` §10 clause 2 already
states the general rule ("Never enumerate an OPEN set — state how to derive it... Name members only
as explicit ILLUSTRATIONS or with an as-of date"); this is therefore an ENFORCEMENT-depth gap, not a
missing-text gap — the same framing already used for row 604/28 itself. New tracker row opened
(see live table) at count 3 (7fa05bde's original framing, the near-miss at f0eef243, and the
git-stash-push+drop instance that forced the fix) — all on ONE bullet, ONE branch, so this is a
same-bullet recurrence rather than a cross-branch one; flagged as RULE CANDIDATE on the strength of
that count, but the recommended action is NOT new rule text (§10 clause 2 already covers it) —
propose citing this precedent inline under clause 2 itself, the way clauses 3 and 5 already cite
`generate-agent-files.js` / `aef79fcb`-`9c907cca` as worked examples. That gives reviewers (and
future rules-file authors) a concrete "this is what an open set masquerading as closed looks like"
example, rather than only the abstract principle.

**Validation event (positive signal):** immediately after `12bc77f5`, the post-commit test-writer
applied the new derivation's membership test to a candidate of its own choosing and found a
**FOURTH** bypass: `git update-index --skip-worktree` after an in-place mutation leaves status
empty, HEAD unchanged, and the stash list unchanged, with the mutated content plainly on disk (the
index simply stops reporting it as modified). It also ran a CONTROL — mutate, then `git checkout --`
to genuinely revert — showing all three first-half checks (status/HEAD/stash) read IDENTICALLY to
the bypass case, which is what makes the derivation's second clause ("the mutation survives
somewhere recoverable") load-bearing rather than decorative: without it, a genuine revert would be
misclassified as a bypass. Under the old closed wording, this discovery would have forced an 8th
commit on this bullet; under the derivation it falsified nothing — the 4th bypass is just another
member of a set already declared open — and was logged as residue instead of triggering a new fix
commit. This is the concrete evidence that converting an enumeration to a derivation can
STRUCTURALLY end a fix-chain, not merely defer it to the next discovery.

**Chain-cap deviation:** seven consecutive commits applied the previous one's findings to this
single bullet (`74b87e4c`, `d20bd348`, `c5736063`, `7fa05bde`, `bb82cb7b`, `f0eef243`, `12bc77f5`)
against the `CLAUDE.md § Post-commit review` stop-rule's cap of 3 consecutive commits. Each was
individually justified as fixing a FALSE claim in prose, which the stop rule explicitly never bounds
out — but that justification was available on every one of the seven, which is exactly why a bare
cap-of-3 with a false-claim carve-out cannot terminate a chain generated by a structural defect: the
carve-out re-applies to the (N+1)th instance for the same reason it applied to the Nth. The chain
only ended when the FIX changed from "add an Nth instance to the enumeration" to "stop enumerating."
PROPOSED (not applied — orchestrator to decide) refinement to the stop rule: when a chain of fixes
to the SAME bullet/paragraph is about to exceed the cap, and each fix has taken the form "name one
more exception/hole/bypass," treat that repetition itself as a signal to check the bullet against
`code-style.md` §10 clause 2 (open-set enumeration) BEFORE authoring the next instance-level fix —
if the set the bullet enumerates is open by construction, the correct Nth commit is a STRUCTURAL
rewrite (derivation + membership test), not another named exception, and that structural rewrite is
allowed to land even past the cap because it is categorically different from "one more instance
patch." This is a single-branch, single-bullet data point (count=1 for the refinement itself,
distinct from the count=3 closed-enumeration pattern above and the count=28 general row) — logged
per `agent-learner.md`'s DO-NOT-on-a-single-occurrence rule as a proposal to watch for recurrence,
not a promotion. If a second bullet on a different branch shows the same "cap-exceeded because the
fix needed to be structural, not instance-level" shape, this refinement clears the 2-occurrence bar
for the stop-rule text itself.

## Commits `dc9789f9`→`a8f92eab`→`c7686957` (chore/pipeline-spec-as-data) — 2026-09-07 learner pass

Branch codifies pipeline governance into `.claude/pipeline.json` + `.claude/pipeline.test.mjs`. No
product code, SQL, or migration touched — the entire diff is the governance/spec layer itself
(plus `ci.yml`, `docs/decisions.md`, two agent-memory pointers). All findings below were validated
against source before being logged.

### New pattern 1 — mutation-check executed but doesn't falsify the claim (count=2, RULE CANDIDATE)

`.claude/agents/test-writer.md` § "Mutation-check every test that pins a mechanism" is entirely
about ARTIFACT CLEANLINESS (proving a mutation genuinely happened and left no trace — the `git
status`/`HEAD`/stash-list checks and their bypasses). It says NOTHING about whether the mutation
was DESIGNED correctly to falsify the claim. Verified by grep (`isolate`, `confound`, "two things at
once", "does nothing" — no hits outside this new entry). This is a genuine gap, not an unfollowed
existing rule.

- Instance 1, `a8f92eab`: a frontmatter-parser fix (closing the `dc9789f9` semantic-reviewer CRITICAL
  — `frontmatter()` scanning for the first `\n---` anywhere) was mutation-checked and reported
  CLOSED. It was not: the added check was inert, and only a LATER, unrelated mutation (run
  afterward, for a different purpose) revealed the gap. The reporting mutation was green either way
  — it never exercised the specific new logic the fix added.
- Instance 2, `c7686957`: a lefthook-grounding fix (closing an implementation-critic finding — the
  grounding check substring-matched the whole command block, so it passed after a rename because the
  unrelated path `run-security-auditor.sh` contains the agent's own name) was mutation-checked and
  reported CLOSED. It was not: the mutation changed two things at once, so it never isolated the
  mechanism the fix claimed to close.

**Draft addendum** (insert in `.claude/agents/test-writer.md`, after the "BEFORE reporting, verify
ALL of" artifact-cleanliness block, before "This is the ONE case where..."):

> **Design the mutation before running it — isolation and targeting are separate failures from the
> artifact-cleanliness checks above, and BOTH have shipped a false "closed" report on this repo:**
>
> - **Isolate exactly one change per mutation.** If confirming a fix requires touching two
>   independent code paths, run two separate mutation passes, one per path. A mutation that
>   conflates two edits and reddens proves only "something in this diff matters" — never that the
>   SPECIFIC check under test does. (`chore/pipeline-spec-as-data`, `c7686957`.)
> - **Target the specific gap the fix claims to close, not "any mutation that eventually reddens."**
>   State in one sentence what the fix is supposed to catch before choosing the mutation, then
>   confirm the mutation you are about to apply would trigger exactly that condition. A mutation
>   that reddens for an unrelated reason — or a LATER, different mutation that happens to expose the
>   gap — does not retroactively validate an earlier "closed" claim. (`chore/pipeline-spec-as-data`,
>   `a8f92eab`.)

Also extends to `agent-workflow.md § Finding Validation`'s "I ran/verified X" self-report bullet:
these are the ORCHESTRATOR's own self-executed mutation checks failing, not a subagent's — the
existing bullet's examples are all subagents; this is the first orchestrator-self instance of the
same failure class (verify the artifact, not the claim — here the artifact check itself was flawed).

### New pattern 2 — verification/gate check accepts membership/substring, not exact identity (count=2)

`code-style.md` §7 "A Test Must Fail If Its Mechanism Is Removed" already states the general
principle ("would it go red if I deleted the code?") and explicitly says its two named sub-rules
"are worked examples... it also covers cases neither of them names." This is NOT a new rule — it's
a third nameable shape the existing principle already anticipates but doesn't yet illustrate.

- Instance 1, `dc9789f9` (semantic-reviewer CRITICAL): a model-literal check in
  `pipeline.test.mjs` asserted that *a* known model string appeared in the BLOCKING pre-push hook,
  never that the RIGHT one did. Swapping `sonnet`→`haiku` passed clean.
- Instance 2, pre-`c7686957` (implementation-critic): a lefthook-grounding check substring-matched
  the whole command block. It passed even after the command key was renamed, because the unrelated
  path `run-security-auditor.sh` still contains the agent's own name.

**Draft addendum** (3rd bullet in the existing list under §7, after the REVOKE-tests example):

> - A check verifies **category/substring membership instead of exact identity**, so a SWAP passes
>   as easily as a deletion. A model-literal check asserted that *a* known model string appeared in
>   a blocking hook, never that the RIGHT one did — swapping `sonnet`→`haiku` passed clean. A
>   sibling lefthook-grounding check substring-matched a whole command block, so it passed after a
>   rename because an unrelated path happened to contain the agent's own name.

### New pattern 3 — schema/spec validator has no closed key set (count=2, RULE CANDIDATE → code-style.md §5)

Verified NOT covered elsewhere (grep for "closed key", "unknown key", `.strict()`, "exhaustive",
"extra key" in code-style.md and this file — no hits before this entry).

- Instance 1, `dc9789f9` (test-writer): `.claude/pipeline.json`'s validator checked each known field
  but had no closed key set — a future edit could reintroduce the exact unchecked-field defect the
  introducing commit's own message claimed to have removed.
- Instance 2, `a8f92eab`: `.md` frontmatter validation had no closed-key check (semantic-reviewer) —
  a contradictory `role:` key was invisible to the test; the same commit's data file also carried an
  unreferenced `models` alias no check would ever catch (test-writer).

**Draft new bullet** for `code-style.md` §5 (TypeScript Rules), title "Closed-Key Validation for
Schema/Spec Files":

> Any validator that checks a JSON/YAML/frontmatter object against an expected shape (a spec file, a
> `.md` frontmatter block, a config schema) must reject or explicitly flag keys OUTSIDE the expected
> set — not merely confirm that expected keys hold the right values. A validator that only checks
> "does key X have the right value," with no `Object.keys(obj).every(k => KNOWN_KEYS.has(k))` (or an
> explicit Zod `.strict()` decision), lets an unreferenced, resurrected, or contradictory extra key
> sit invisible indefinitely — including the exact defect a prior fix's commit message claimed to
> have removed.
>
> ```ts
> // ❌ WRONG — checks known fields, says nothing about extras
> for (const key of EXPECTED_KEYS) assert(obj[key] != null)
>
> // ✅ CORRECT — closes the key set
> const unknown = Object.keys(obj).filter(k => !EXPECTED_KEYS.has(k))
> assert(unknown.length === 0, `unexpected keys: ${unknown.join(', ')}`)
> ```
>
> Promoted at count=2 (`chore/pipeline-spec-as-data`, `dc9789f9`/`a8f92eab`).

### One-off watch items (count=1 each — logged, NOT promoted)

- **Delimiter-scan parser matches the first occurrence anywhere, not the paired/anchored one**
  (`dc9789f9`, semantic-reviewer CRITICAL): `frontmatter()` scanned for the first `\n---` anywhere in
  the file; deleting a file's real closing `---` made it swallow ~190 lines of body and still pass.
  A distinct parsing-robustness shape from pattern 2 above (that's membership-vs-exact-identity in a
  VALUE check; this is unanchored-vs-paired in a DELIMITER scan). Watch for a second instance before
  proposing a rule.
- **Orchestrator encodes its own unresolved design PROPOSAL into a durable data file as settled
  fact** (implementation-critic, commit unconfirmed — likely pre-`a8f92eab` or pre-`c7686957`):
  caught two of the orchestrator's own proposals encoded as established fact in
  `.claude/pipeline.json` (both CRITICAL, same catch — counts as one occurrence). Related to the
  already-tracked row "Orchestrator drafts its own unverified 'because X'/attribution claim in
  comment prose" (count=4) but a distinct shape: a settled-sounding VALUE in a DATA FILE, not a
  causal claim in PROSE. Deliberately not folded into that row's count (would conflate two
  observably different failure modes under one number). Watch for a second data-file instance.
- **`EXPECTED_ROLES` asserts the test's own belief with nothing reading reality** (`a8f92eab`,
  semantic-reviewer ISSUE) and **regex false positives / unescaped flag in `new RegExp`**
  (`a8f92eab`, semantic-reviewer ISSUEs): ordinary code-correctness bugs in the test file itself.
  The `EXPECTED_ROLES` shape reinforces the existing §7 general principle (not a new pattern); the
  regex bugs are one-off implementation defects, not a systemic pattern at n=2 within one commit.

### §10-class findings feeding existing rows (not new patterns — incrementing established rows)

- `dc9789f9` CR WARNING trio: SCOPE header under-listed its own assertion list; `docs/decisions.md`
  self-contradicting mutation tally (body "nine", footer "7/7"); "existence of every declared path"
  false for one glob entry. Split across the two existing §10 rows: the arithmetic/tally mismatch →
  "Rules-file claim true in its hunk, false vs another section/mirror/arithmetic" (now 13); the false
  universal ("every X") claims → "Rules-file bullet closes an enumeration of a structurally OPEN
  set" (now 5).
- `a8f92eab` CR pair: "every agent file carries a third bare `---`" (true of 1/10) left standing NINE
  LINES BELOW the orchestrator's own correction of it (→ the "closes an enumeration" row, now 5);
  "four reviewer defs use `--- FINDINGS ---`" when one uses `--- DETAILS ---` (→ the
  "arithmetic/mirror" row, now 13). The "every agent file" claim was ALSO caught again by
  implementation-critic pre-`c7686957`, i.e. it survived a full post-commit CR pass before being
  fixed — an enforcement-gap data point for the "Fix commit correcting §10 violations introduces
  fresh §10" row (stays at 28 per its own same-branch convention; noted as a possible uncounted 4th
  arc, attribution to "c7686957 introduced a fresh violation" vs "took one extra round to fully
  clean up" is not confirmed).
- `dc9789f9` doc-updater: reported 1 stale pointer, orchestrator found a 2nd. Matches the
  already-PROMOTED whole-block-read rule in `agent-doc-updater.md` § DO almost exactly — this is a
  3rd instance showing an ENFORCEMENT-GAP recurrence (the written rule exists; a Haiku-tier agent
  still missed it), not a missing-text gap. Whether the 2nd pointer was in the SAME block as the 1st
  (the rule's exact trigger) or a genuinely separate location is unconfirmed from the task
  description — flagged as a caveat on the increment.

### Q4 — "defects land in the prose describing a mechanism, not in the mechanism"

NOT well-supported by this evidence, taken at face value, and there are two separate reasons to
push back:

1. **Severity runs the opposite way.** Of ~14 distinct findings across the three commits, the two
   most severe (both semantic-reviewer CRITICAL) were LOGIC bugs in the verification code itself
   (the model-literal check's weak matching; the frontmatter delimiter scan) — not prose/comment
   inaccuracies. Counting roughly: ~7 findings were prose/§10-class (CR warnings, doc-updater), ~7
   were logic/mechanism bugs in the test/validator code (both CRITICALs, the TW closed-key gaps, the
   two self-inflicted mutation-check failures, the IC lefthook-substring finding). That's close to
   even, and severity-weighted toward mechanism.
2. **The comparison is close to tautological for this branch.** The whole diff IS the governance/
   spec layer (`.claude/pipeline.json` + `.claude/pipeline.test.mjs`) — no `lefthook.yml`, CI script,
   or agent definition file was touched. So "defects land in the description layer, not the
   mechanism" is nearly guaranteed by construction: that's the only layer this branch edits. It says
   nothing about whether prose-type defects are MORE COMMON than logic-type defects in general — only
   that when you edit exclusively the descriptive/governance layer, defects (unsurprisingly) show up
   there.

Recommend NOT generalizing the thesis from this branch. A cleaner, evidence-backed reformulation:
**verification/gate mechanisms that check "does X roughly look right" (membership, substring,
unclosed-key) are as failure-prone, and at least as severe, as the prose claims describing them** —
that's what patterns 1-3 above actually show.

## Branch `chore/settle-policy-contradictions` (2026-09-08, 6 commits `7a4580ab`..`ec9ba068`)

`7a4580ab` settled 5 policy contradictions and closed a lint gap (`pnpm lint` never reached repo
root; the lefthook glob omitted `.mjs`). The 5 commits after it are ALL fixups to the guard that
closed that gap — each version mutation-proven vacuous by the NEXT reviewer:

1. `269667d7` — glob check used substring matching (`'*.{jsx}'.includes('js')` true); lint check
   matched a mere mention. Both vacuous → row 46 (SWAP/category-membership), 3rd instance, threshold
   reached — write the 3rd worked example under code-style.md §7 now.
2. `b63c1019` — added a recursion pin at depth>=1; vacuous because every lintable file below
   `.claude/` already sits at depth 1. No clean existing-row match; folded into the meta-lesson below
   rather than forced into an existing row.
3. `5ed08515` — deleted the hand-rolled walk for `git ls-files`, pinned via named anchors; vacuous
   because a pathspec unioning the anchors' own directories satisfies them all. Self-referential
   scoping (the check's search space is DERIVED from the same anchors it's meant to verify) — related
   to row 85's "no independent anchor" shape but not force-fitted (row 85's named shape is
   specifically "co-removing from both passes clean," which this isn't); folded into the meta-lesson.
4. `8867ccea` — added a no-pathspec cross-check + `BIOME_EXTS` reverse pin; residual: co-editing both
   `git ls-files` calls passes → row 85, 4th instance (2->4 after this branch, with `807b6658` between).
5. `ec9ba068` — pinned the extraction step; residual (found by semantic-reviewer AND test-writer):
   `present` collapses to `{'mjs'}` via the `.map()`/`.filter()`, because every downstream check is
   one-directional (`present ⊆ X`, never `X ⊆ present`). Test-writer's OWN tracker (not this file)
   already carries this exact shape at count=2 (`test-writer/MEMORY.md`, "derived SUBSET-filtered
   value has no check on its own extraction step") — not double-counted here; cross-referenced only.

### Q2 answer — what would have stopped the 5-generation loop itself

Not any single vacuity fix. Each generation was validated by "does this defeat the ONE mutation I
just found" rather than "does this defeat every INDEPENDENT axis this guard's correctness depends
on." A guard whose job is closed-set/coverage enforcement (a lint-glob pin, an inventory check, a
cross-reference check) has (at minimum) FOUR independent axes: (a) the input enumeration step, (b)
any extraction/transform step, (c) the filter/predicate step, (d) the comparison DIRECTION
(A⊆B vs B⊆A vs equality). A mutation passing on axis (d) certifies nothing about (a)-(c) — that is
exactly what happened generation to generation here (gen1 mutated the match-exactness axis; gen4
mutated the input-derivation axis; gen5 mutated the extraction axis; no single generation checked
more than the one axis its predecessor had just failed).

PROPOSAL (not yet applied — routes to whichever rules PR next touches test-writer.md or code-style.md
§7): when mutation-testing a GUARD SCRIPT (as opposed to an ordinary unit test pinning app logic),
require the mutation set to cover all four axes above before the guard is considered validated, not
just the axis of the most recently found defect. This generalizes the existing §7 "kill the mechanism,
watch it go red" discipline from single-mechanism unit tests to multi-axis coverage/inventory guards,
where "the mechanism" is actually several independent mechanisms stacked.

### Other findings, mapped

- Three false claims shipped in commit messages on this branch (269667d7: "each mutation verified to
  produce exactly one failure," true only for tried shapes; b63c1019: "Three assertions added in
  269667d7," two were; 8867ccea: attributed a "cannot narrow" sentence to the prior commit — it
  appears in no committed version, only a pre-commit draft) — folded into row 42 as ONE branch
  instance per that row's established per-branch counting unit (29→30).
- `8867ccea` SHIPPED the bounded-count-plus-universal pair "Seven generations ... Every one of those
  sentences was falsified" as ONE claim; `ec9ba068` removed both and pointed at commit-notes.md
  instead → row 43, 7th instance. The "every previous generation ... every one falsified" wording
  quoted in `ec9ba068`'s own message never reached a committed file — it was a pre-commit draft that
  implementation-critic caught. Attributing it to `ec9ba068` (as this entry first did) is the SAME
  draft-vs-committed misattribution the "cannot narrow" bullet above disentangles; it recurred
  inside the row that tracks it.
- A semantic-reviewer ran `git checkout HEAD -- <path>` in the MAIN repo believing it was cleaning
  its own contamination, destroying test-writer's legitimate uncommitted work. Both agents behaved
  per their own definitions. `agent-workflow.md` withholds Write/Edit from every agent but test-writer
  specifically to prevent this and already names Bash as the residual hole — first confirmed
  materialization of an already-anticipated gap, logged as its own new row (count=1, WATCHING) rather
  than merged into the `git reset --hard` archive row (different actor, different command, no
  concurrent-agent race in the archived case).
- The learner's own mutation run silently failed to apply (Python quoting error), printing a clean
  pass; only incidental stderr text revealed it → row 40, 4th instance.
- A test-writer report claimed a file was modified when the write was made inside a scratch worktree
  since removed → row 68, 12th instance, POST-PROMOTION (the promoted Finding Validation
  artifact-check caught it; the report itself did not self-correct).
- PR 3's scope was planned citing learner rows as `638, 639, 649, 657, 668, 670, 677` — an unstable
  mixture of MEMORY.md line numbers, archive line numbers, and literal `(row NNN)` IDs; several
  resolved to nothing or the wrong pattern. New row (count=1, WATCHING): `(row NNN)` is not a stable
  identifier — both files renumber on every edit/compaction. If it recurs, propose citing by the
  Issue-Type text (grep-able) or a stable slug instead.

### Q4 — rows 42 (count 30) and 69 (count 14), both far past threshold, neither promoted

- **Row 42** ("fix commit correcting §10 violations introduces fresh §10 violations"): the remedy
  TEXT already exists (§10 cl.3, "a partial comment edit is the tell — grep repo-wide"), so the
  35-crossing-and-climbing count is an ENFORCEMENT gap, not a missing-text one — and it keeps firing
  because cl.3 is scoped to comment/doc edits, not to the commit MESSAGE prose where a large share of
  these instances actually live (this branch's 3 false claims all shipped in commit-message bodies,
  not source comments). Concrete next step: (1) extend §10's scope to state explicitly that commit
  message bodies/footers carry the same grep-and-verify obligation as source comments; (2) since text
  alone has failed at this count, pair it with a MECHANICAL gate — require an EVIDENCE: line (command
  + output) for any quantified/absolute claim ("every," "each," "exactly," a count) written into a
  commit message, mirroring the EVIDENCE: requirement #1254 already put on agent reports for runtime
  claims. Do not let this sit at RULE CANDIDATE through a 6th branch.
- **Row 69** ("rules-file claim true in its hunk, false vs another section/mirror/arithmetic"): the
  row's own status text says the remedy is "still unwritten in §10 text" — unlike row 42, this one
  genuinely lacks drafted language. Concrete next step: write a NEW §10 clause 6 requiring that a
  claim be checked not just for LOCAL truth (within its own paragraph/hunk) but for consistency
  against (a) other sections of the SAME file, (b) mirror files per Rule-Mirror Sync, and (c) simple
  arithmetic/counts stated elsewhere in the same doc. This is a distinct check from cl.3's "grep the
  retracted phrase" — cl.3 catches a phrase left behind after editing; cl.6 would catch a phrase that
  was never edited but was always inconsistent with something else in the document.

## Branch `chore/settle-policy-contradictions` — CR-local rounds 1-4 (2026-09-08, commits `24f6983d`..`2c42c970`)

Continuation of the section above (same branch, later commits). Four CR-local rounds, each producing
one fixup commit per § PR Batching: round 1 → `24f6983d` (3 findings, 3 applied); round 2 → `ee0186d9`
(5 findings, 4 applied, 1 skipped, PLUS this cycle's four core agents); round 3 → `c740169b` (4
findings, 3 applied, 1 skipped, plus semantic-reviewer); round 4 → `2c42c970` (1 finding, applied,
plus the four core agents). The loop stopped at `2c42c970` because round 4 is the 4-fixup ceiling
(agent-coderabbit-local.md § Stop Conditions rule 2) — **not** because a round came back clean. 0 of 4
rounds were clean; the M=2 floor (this is not a security-path branch) was numerically met at round 2
but every round through round 4 still carried an apply-worthy finding, so extend-by-one kept firing
until the ceiling did.

### Patterns, mapped

- **Rename-blind `--name-only` pathspec used to derive a security-path floor or a path-based
  exemption.** `24f6983d`: the agent-memory-only implementation-critic exemption was derived from
  `git diff --cached --name-only`, which prints only a rename's DESTINATION — a file renamed INTO
  `.claude/agent-memory/` from outside read as agent-memory-only and skipped implementation-critic.
  `ee0186d9`: the security-path floor was derived the same way in FOUR places — moving
  `packages/db/src/admin.ts` (the service-role key module) out of its tree matched zero security
  paths, silently dropping the reviewer/CR-local floor from M=3 to M=2 and skipping the mandatory
  red-team run. Both fixed to `--name-status -M`, taking both paths of an `R` entry. **2 distinct
  commits, RULE CANDIDATE → RULE, and already swept clean**: `git grep -n -- '--name-only'` across
  `.claude/rules/*.md`, `.claude/commands/*.md`, `docs/*.md`, `CLAUDE.md` (run 2026-09-08) returns
  zero unguarded hits — every one of the 6 sites that ever cited `--name-only` for a security/
  exemption derivation (`agent-critic.md:28`, `agent-coderabbit-local.md:83`, `crlocal.md:100/104`,
  `fullpush.md:125/131`, `agent-workflow.md:306`, `docs/decisions.md:1514`) now uses
  `--name-status -M`. Mark PROMOTED, not RULE CANDIDATE — the text is written AND the sweep is
  independently confirmed, which is the two-part bar `agent-learner.md § Sweep-On-Rule-Promotion`
  sets. New tracker row.
- **`Rules-file bullet closes an enumeration of a structurally OPEN set` — row 43, 8th instance.**
  `ee0186d9`: six files asserted a literal count ("exactly TWO" accepted defer-ratio justifications).
  CR flagged two of the six; the orchestrator's own sweep found all six, all introduced by this
  branch, all falsified at once by adding a third justification. Named, not counted, in the fix. This
  is a DIFFERENT commit and a different subject (defer justifications, not "seven generations") from
  the 7th instance already recorded on this row from `8867ccea`/`ec9ba068` — row 43's own counting
  convention is per-commit (its 7th-instance note is tied to the specific commit that shipped it), so
  this increments to 8, unlike row 42 below.
- **`Fix commit correcting §10 violations introduces fresh §10 violations` — row 42, same branch,
  NOT incremented.** Two more self-correction cycles landed on this branch after the six commits
  already folded into row 42's count=30: `24f6983d`'s own commit message misattributed which bullet
  in row 43 carried the "cannot narrow" sentence (off by one), corrected by `ee0186d9`'s message;
  `c740169b`'s own prose said the merge-base fallback prints "TODAY's date" — true only when HEAD was
  committed today, corrected by `2c42c970`. A third near-instance (the `CHANGED=$(git diff | cut |
  tr) || abort` fix in `ee0186d9` reopening the same class of hole WIDER) never shipped —
  implementation-critic caught it pre-commit, so per the row's own established precedent (the "every
  previous generation" wording in the earlier section above) a caught draft does not increment the
  count. Per row 42's OWN established counting unit ("folded into row 42 as ONE branch instance per
  that row's established per-branch counting unit" — see the section above), these two are additional
  evidence on the SAME already-counted branch, not a new branch, so the numeric count stays at 30.
  Recorded here as reinforcement: this branch alone now shows FIVE separate self-correction touches
  (3 original false claims + 2 more here) to the exact defect class row 42 tracks, and the row's own
  Q4 note already says "Do not let this sit at RULE CANDIDATE through a 6th branch" — the next branch
  to exhibit this is that 6th branch; the EVIDENCE: line gate proposed there should be applied before
  it arrives, not after.
- **`Verification gate's pass condition is empty result — fails open on malformed input` — row 58,
  3rd instance, threshold cleared, ready to write.** `c740169b`: semantic-reviewer found an inlined
  `$(git log -1 --format=%cI $(git merge-base ...))` printed as the command to run in the
  Apply-vs-Defer `filed`-derivation section, three lines above prose that already forbade exactly
  that inlining (a pre-existing bullet, not one this branch introduced). On a failed inner
  `merge-base`, the substitution is empty, `git log -1 --format=%cI` (no ref) silently defaults to
  HEAD and exits 0, printing a plausible date that narrows the window and under-counts `filed` — a
  ratio check that should fail instead passes. Fixed by capturing and exit-code-checking each step
  separately. Same shape as the row's first two instances (`git log --since` empty=PASS; `gh issue
  list` default `--limit 30` truncating silently) — "any check whose PASS is absence must also prove
  the mechanism ran," and here the near-equivalent: any check whose INPUT is itself a command
  substitution must prove THAT ran too. Count 2→3. Propose: `agent-workflow.md § Always diff against
  origin/master` already carries the fix inline ("Capture it, check the exit code, abort on failure,
  then query" — the corrected text); the remaining action is a repo-wide sweep for any OTHER
  printed/runnable example anywhere in `.claude/rules/*.md`, `.claude/commands/*.md`, `CLAUDE.md`
  containing a nested `$(...)`-within-`$(...)` substitution, verifying each captures and checks the
  inner command's exit code separately before use.
- **`Mirror sweep scoped by file extension, not claim phrase — misses .ts hits` — row 59, 4th
  instance, text CONFIRMED present, recurrence is enforcement not authoring.** `2c42c970`:
  `CLAUDE.md` and `.claude/hooks/post-commit-reminder.sh` both still carried the unqualified "only
  agent holding Write/Edit" claim that `docs/plan.md` had already retracted one commit earlier
  (`c740169b`). The doc-shaped grep that found the first two mirrors missed the `.sh` file — which is
  EXACTLY the case `agent-workflow.md`'s own Rule-Mirror Sync table already names: confirmed present
  at `agent-workflow.md:719` ("`.claude/hooks/*.sh` | **executable mirrors** — ... Not `.md`, so
  doc-shaped greps miss them"). The rule text is not the gap; the orchestrator's own sweep habit
  (defaulting to a `.md`-extension grep) is. Count 3→4.
- **New pattern, count=1, WATCHING — detection regex enumerates one flag spelling, misses a
  documented CLI alias.** `c740169b` added a lint-mode guard rejecting `--write`; `biome check --help`
  documents `--fix` as its alias, and `biome check --fix .claude` passed a gate whose stated purpose
  is rejecting write mode. Found independently by test-writer AND semantic-reviewer in the same
  round, both mutation-proven. Fixed in `2c42c970` by widening to `--(?:write|fix)` (confirmed live at
  `.claude/pipeline.test.mjs:431`). Distinct from row 46 (SWAP/category-membership — a check too LOOSE,
  accepting something it should reject via substring/category match): this is a check too NARROW,
  rejecting only one exact spelling and missing an equivalent alias — the opposite direction. Also
  distinct from row 45 (test-writer's formal Mutation-check protocol running unisolated/untargeted) —
  this was the ORCHESTRATOR's own ad hoc mutation test ("I had mutation-tested only the shapes I
  thought of and called it verified"), not test-writer's protocol, so it doesn't share row 45's
  proposed remedy location. Mechanical lesson for next time: before writing a detection regex for any
  CLI flag, grep the tool's own `--help` / documented alias list, not just the spelling used in the
  finding that prompted the guard. Single occurrence — log and watch.
- **New pattern, count=1, WATCHING — `cd` into a stale/removed worktree fails silently and the
  write lands in the real repo.** A semantic-reviewer's `cd` into a scratch worktree that no longer
  existed failed silently (no `set -e` / no `|| exit`), so the script continued in the original
  working directory and its mutation landed in the REAL `package.json`. Self-caught: the agent
  verified its own mutation had applied (per `agent-workflow.md § Finding Validation`'s artifact-check
  discipline) before trusting it, found the wrong file changed, and restored it. Positive signal on
  the verify-before-trusting discipline; distinct from the existing `git checkout HEAD` /
  concurrent-work-destruction row (different command, different actor, no concurrent-agent race here)
  — both are materializations of the same already-named Bash residual hole
  (`agent-workflow.md § Every agent dispatch is ASYNCHRONOUS`: Bash is the one write path every agent
  keeps, deliberately, and it is not sandboxed). Single occurrence — log and watch.
- **Positive — 3-way corroboration, no action needed.** `docs/decisions.md`'s stale citation of the
  superseded `--name-only` derivation (for the agent-memory exemption) was found INDEPENDENTLY by
  doc-updater, semantic-reviewer, AND CR-local in the same round (`ee0186d9`'s cycle) — three
  different reviewers, three different mechanisms, same finding, zero disagreement. Confirms the
  four-core-agents-plus-CR-local design is not wastefully duplicative on a real defect; it is
  redundant in the way that catches things reliably.
- **Environment note, not a rule-change candidate.** The session's tmpfs hit 0 bytes free mid-cycle
  (own agent transcripts + scratch worktrees), blocking every Bash call until cleared. Operational
  hygiene, not a code-style/security pattern — logged here for continuity, no tracker row.

### Q2 — CR-local's stop rule on a large, prose-heavy, self-referential branch

**Data.** Round-by-round finding counts: 3, 5, 4, 1 — zero rounds clean across all 4. The loop ended
at the 4-fixup ceiling (Stop Conditions rule 2), never at the minimum-rounds-met + last-round-clean
floor (rule 1), even though the floor (M=2, not a security-path branch) was numerically reachable by
round 2.

**Is the extend-by-one arithmetic broken?** No — re-derive it directly: extend-by-one requires that
the loop cannot stop ON a round that still carries an APPLY verdict, and cannot stop BEFORE round M.
Every one of rounds 1-4 carried an APPLY verdict, so by the rule's own text the loop was REQUIRED to
keep extending; it did, correctly, until the independent ceiling (a hard cap "even if the floor is
unmet") terminated it. The arithmetic did exactly what it says. The symptom is not a bug in that
mechanic.

**What's actually going on.** Two known facts compound: (1) CR-local's `--committed --base
origin/master` reviews the WHOLE branch diff every round, by design, to preview what cloud CR will
see on the pushed PR — so the reviewed surface grows every round as each round's own fixup commit
lands on the branch. (2) This branch's subject matter — settling rules-file self-contradictions — is
exactly the row-42/row-69 defect class (a fix commit correcting one instance has an outsized,
independently-tracked tendency to introduce a fresh one; row 42 sits at count=30 and row 69 at
count=14, both already flagged ESCALATE/needs-mechanical-gate). Each round's fixup is therefore drawn
from a population of edits with an unusually high empirical rate of containing the exact defect
CR-local is tuned to catch. A clean round is not "bad luck failing to arrive" on this branch; it is
the CR-local loop functioning as an effective row-42/row-69 detector on a target that keeps
regenerating the thing it's detecting. This is corroborated by history, not a first observation: the
archived pipeline-audit #1110 loop (2026-07-11, the OLDER consecutive-clean-reset mechanic, since
replaced 2026-09-06) is recorded as closing "at the 4-fixup ceiling per stop-condition — non-
convergence as documented (CR finds new nits on unchanged code each round)" — same externally visible
shape (ceiling-only termination) under a DIFFERENT stop-rule mechanic, on a 60-file diff. Contrast
with `batch/928-1010-1041-client-hardening` (2026-07-13), which achieved BOTH the floor+clean-round
condition AND the ceiling simultaneously on a 5-round loop with mechanical (non-self-referential)
fixups — proof that convergence IS reachable when the fixups aren't drawn from a self-regenerating
defect class. Given the stop-rule mechanic differs between the two ceiling-only instances (old
counter-reset vs current extend-by-one), this is the FIRST test of the current mechanic under this
condition — count=1 under the current design, though the underlying symptom has now recurred twice
across two different mechanics.

**Verdict: not a defect in the stop-rule's arithmetic. It is an undocumented interaction between
"review the whole branch every round" and the already-escalated row-42/row-69 defect rate, and there
is a compliance gap in how the ceiling is being closed out.** Two concrete, separately actionable
fixes:

1. **`agent-workflow.md § PR Batching § "The non-convergence signal"`** (currently written for
   plan-critic only: "If a review round surfaces a NEW critical in a section an earlier round already
   reviewed, the diff is too large. Split — do not run another round."). Extend this explicitly to
   CR-local with a mechanically checkable trigger: *"The same signal applies to a CR-local loop that
   reaches its 4-fixup ceiling with ZERO clean rounds (every round 1..ceiling carried an apply-worthy
   finding) — split the remaining scope into a separate branch/PR rather than trusting the ceiling to
   terminate the review. This is distinguishable at write time from ordinary CR-local non-convergence
   (§ agent-coderabbit-local.md's documented re-raise/noise behavior, which the minimum-rounds rule
   was designed to accommodate and does not by itself warrant a split) by whether the findings across
   rounds are on DIFFERENT material each time (a fixup's own fresh text failing review — split-worthy)
   versus re-raises of the SAME already-adjudicated finding on unchanged code (accepted noise — not
   split-worthy)."*
2. **`agent-coderabbit-local.md § Stop Conditions` rule 2** — currently reads "...escalate to user
   judgment rather than looping further," but this session's fixup-commit messages narrate the ceiling
   firing as "Round 4 is the 4-fixup ceiling, so the CR loop stops here by rule" with no distinguishable
   escalation step — the loop stopping "by rule" is being treated as if it were itself the disposition,
   when the rule's own text calls for something stronger (explicit user-facing judgment). Propose
   tightening the clause so the ceiling firing REQUIRES a stated line in the round summary — e.g. "N/4
   rounds clean — ceiling reached; escalating" — addressed to the user, distinct from and in addition
   to "stops here by rule." This does not change the mechanic; it closes a visibility gap between what
   the rule already says to do and what closing-by-ceiling currently reads like in practice.

Both are DRAFT proposals, not promotions — the underlying symptom is at count=1 under the current
extend-by-one mechanic (the pipeline-audit #1110 precedent used the retired mechanic, so it does not
cleanly co-count). Apply now on the strength of the reasoning if the orchestrator judges it
sufficient, or hold for a second same-mechanic recurrence per the standard threshold.

## Branch `chore/evidence-gate` — 6th-branch row-42 instance, full detail (2026-09-08, commits `4ec5b894`..`d728e389`)

Built `.claude/hooks/check-commit-claims.mjs` (a lefthook commit-msg guard blocking a message that
cites a commit SHA which does not resolve), partially discharging row 42's ESCALATE note. Row 42
itself is compacted to a pointer in MEMORY.md; this section is the detail it points to.

**The prototype that was rejected, not shipped.** Row 42's own escalation proposed a literal
`EVIDENCE:` line gate. It was prototyped and MEASURED before being written as a rule: over 300 commit
messages it blocks 84% of MESSAGES (the trigger-shape figures are hit counts against a different denominator, so they do not decompose that rate — re-derive both) — at that rate the only survivable author response
is a token `EVIDENCE: git log` line that satisfies the gate while verifying nothing, i.e. row 40
rebuilt as a hook (a check whose pass condition a bad-faith or rushed author can satisfy without doing
the work it exists to enforce). Rejected ON THE MEASUREMENT, recorded so it is not rebuilt.
`check-commit-claims.mjs` instead gates the CHECKABLE subset only: a cited SHA must resolve via
`git rev-parse --verify` (no `--quiet` — verified to collapse an AMBIGUOUS prefix and an ABSENT one
into one exit-1/empty-stderr signature, which the guard must distinguish). Recall re-measured at
280/352 = 80% of real commit-SHA citations over 400 messages; precision measured only against real
history (4 would-block cases, all pre-squash artifacts resolved by fetching).

**All twelve findings, mapped to what actually happened (verified against the four commits' own
messages, not inferred):**

1. **plan-critic (one pre-commit run, `4ec5b894`'s plan): measured precision, never proposed
   measuring recall.** → row 65 (Empirical measurement correct for tested scenario but excludes the
   failure case), 4th instance.
2. **The row-40-shaped `EVIDENCE:` line design, rejected on measurement before being written.**
   Not a tracker increment — a design decision, recorded so the (bad) design is not rebuilt. See
   above.
3-5. **Three defects caught by TWO implementation-critic rounds on `4ec5b894` itself, all fixed
   BEFORE the first commit landed (no separate fix commit; captured in `4ec5b894`'s own message):**
   two vacuous tests, a prose trigger-word list that stated 13 positions against the code's 16 (later
   corrected further — see below), and an action-pin exclusion scoped to the whole line that turned a
   real citation into a SILENT DROP (exit 0, "0 refs verified"). All three folded into row 42's
   per-branch count (30→31, already applied, do not re-increment).
6. **A DIFFERENT overbroad exclusion — the precedes-a-trigger-word rule, not the action-pin
   rule — had the SAME silent-drop shape, escaping both `4ec5b894`'s critic rounds because it targets
   a SIBLING code path the first fix never touched.** Caught post-commit by semantic-reviewer in
   cycle 2 as CRITICAL, fixed in `33c8ff79`. This is the sibling-fix-gap meta-pattern (MEMORY.md
   Durable Knowledge: "partial fix to a sibling-file group," ~20 instances) recurring WITHIN one file
   across two exclusion rules rather than across two files — reinforcing an already-well-past-
   threshold pattern; no new row, folded into row 42's per-branch count (same branch, already
   counted).
7. **Same as 6 — the CRITICAL is the sibling-exclusion silent drop, not a distinct 7th finding.**
8. **code-reviewer cycle 2: `33c8ff79`'s own message claimed a "3 refs vs expected 4" symptom was
   caused by the silent-drop bug it fixed.** False — the token being counted was all-digit and never
   a SHA candidate under either version of the guard; 3 was correct before and after. Retracted by
   `029bee6f`'s own message ("The symptom was real; my inference about its cause was wrong"). Folded
   into row 42's per-branch count (already counted).
9. **Two findings in `029bee6f`, both fixed same-commit:** the remedy text sent an author to rewrite
   a TRUE citation whenever the cited commit had not been fetched yet (fixed by naming
   `git fetch origin` first in the remedy); and a "Two known limits" paragraph — an enumeration of a
   structurally open set — was falsified by a third limit one round later (fixed by converting it to
   a derivable list, citing §10 cl.2 explicitly in the commit's own body). Both folded into row 42's
   per-branch count.
10. **`d728e389`: the test file's header claimed every test goes red when its mechanism is deleted.**
    An audit of all 32 found this false for two (a Dependabot-URL test no rule accepts either way, and
    a redundant paren-with-prose test). Folded into row 42's per-branch count.
11. **`d728e389`: mutation audit (not reading) found the guard's REMEDY.ambiguous branch was
    classification-pinned but never reached by any assertion path** — corrupting the remedy string to
    "WRONG TEXT ENTIRELY" left all 32 tests green. → "Mutation-check executed but doesn't falsify the
    claim" row, 3rd instance.
12. **`d728e389`: rewriting the false-universal header (finding 10) immediately reproduced the defect
    it was fixing** — the new wording promised a per-test exception comment that the paren-with-prose
    test did not carry. Caught by implementation-critic round 5 before landing, no git artifact.
    Folded into row 42's per-branch count.

**The three-way-inconsistent-measurement finding (drafting of `33c8ff79`, impl-critic round 2,
pre-commit).** One recall/precision figure was stated three different ways in the same draft message
— 79%/276/350 in the body, "77%, 0 FP/312" in the footer and the learner-row draft, with "0 FP"
directly contradicting "4 blocked" two paragraphs above. `33c8ff79`'s own committed message names this
class explicitly: "propagated to all four sites that state it, since inconsistent figures across
files already occurred twice here." → row 69 (Rules-file claim true in its hunk, false vs another
section/mirror/arithmetic), 15th instance, and the FIRST of that row's instances to land in a commit
message rather than a rules/doc file — direct supporting evidence for row 42's own Q4 proposal to
extend §10's grep-and-verify obligation to commit-message bodies/footers, not just source comments.

**Dominant pattern, stated once.** Ten of the twelve findings (all but 1 and 2, which are a
plan-critic measurement gap and a rejected design respectively) are the SAME mechanism: an author
(orchestrator or agent) writes a claim, a test, or an exclusion rule that is correct for the ONE
case/scenario/commit in front of them and silently wrong or absent for a SIBLING case the fix never
re-examined — a sibling exclusion rule (6), a sibling section of the same message (the three-way
figure), a sibling code branch (11), or the header's own newly-written replacement text immediately
repeating the violation it was written to fix (12). This is row 42's already-established shape
("fix commit correcting the class introduces a fresh instance of the SAME class") generalized one
level: the recurrence is not always literally "the next commit reopens what the last one closed" —
on this branch, SOME instances (3-5, 12, and the three-way-measurement one) never reached a commit
at all, caught pre-commit by implementation-critic across five rounds. The rest — including 9 and
10 — DID land and were caught by a post-commit cycle, each producing its own follow-up commit:
`33c8ff79` carried the "Two known limits" count that `029bee6f` corrected, and `4ec5b894` carried
the test-header claim that `d728e389` corrected. This sentence read "MOST ... never reached a
commit" until a code-reviewer checked it against those four messages — a claim true of the
instances it was drafted from and false against the history in the same file, which is the shape
catalogued two rows above. That is the one genuinely new information this branch adds to row 42's 31-instance
record: the mechanism fires at the SAME rate inside a single drafting session as it does across
separate commits — the defect class is not specific to "a fix commit," it is specific to "an author,
including this one, correcting one instance of a self-referential/enumerative claim without checking
whether a sibling instance has the same defect." Five implementation-critic rounds and one
semantic-reviewer CRITICAL were required to converge a ~150-line hook plus its test suite to a state
with no further self-reported defect — and `d728e389`'s message names this
explicitly ("Four of them are mine").

**Is "a fix introduces a fresh instance of the class it fixes" mechanically checkable?** No, not in
general, and this branch is itself the evidence: the twelve instances above span at least five
distinct SURFACES (a JS regex exclusion rule, a prose enumeration, a test-file header comment, a
commit-message figure, a mutation-coverage gap) with no shared syntactic shape a linter or hook could
key on — the common thread is semantic (an author is now trusted to have fixed X, and the fix's OWN
correctness is being taken on faith) not structural. §10 clause 3 ("a partial comment edit is the
tell — grep the retracted phrase repo-wide") is the closest existing mechanical proxy, and it already
exists; the recurrence is an ENFORCEMENT gap in a fundamentally semantic check, not a missing
mechanical rule. The one narrow exception found on THIS branch: finding 11 (an unreached branch in a
mutation-check regime) IS mechanically detectable in principle — a coverage tool that reports
per-branch mutation kill rate, not just per-file, would have caught it without a human/LLM audit. That
is a testing-infrastructure gap (test-writer.md § Mutation-check), not a general answer to the
broader question, and it is already captured at its own row ("Mutation-check executed but doesn't
falsify the claim").

**Promotion assessment.** Nothing here clears a threshold NOT already covered by existing rule text.
Row 42 (31, ESCALATE) already proposes the two concrete next steps (extend §10 cl.3 to commit-message
bodies; pair it with a mechanical EVIDENCE: gate) and this branch's own commit `4ec5b894` already
executed the second proposal in the only form the branch's own measurement showed was survivable — the
SHA-resolution gate, not a literal EVIDENCE: line. Row 69 (15, cross-section/mirror/arithmetic) still
has NO drafted §10 cl.6 text; this branch adds supporting instance count but not new textual scope.
Row "Mutation-check executed but doesn't falsify the claim" (3, THRESHOLD REACHED at 2+) has NOT yet
had its addendum written into `test-writer.md` § Mutation-check — this is the one item here at or past
promotion that lacks drafted text; propose in the next PR touching that file: "A mutation-check pass
over a guard/validator with multiple classification branches must mutate EACH branch's output
independently (not just the branch most recently touched), and the report must name which branches
were exercised." Route to a future PR — not this branch, which is at its 3-commit fixup ceiling.

### Continuation — commits `4cebe91c`/`ade3f05f` (2026-09-09), plus CR-local round 1

13. **`4cebe91c`: the new `check-commit-claims.test.mjs` was the only hook test on disk absent from
    `.github/workflows/ci.yml`'s enumeration — while `ci.yml` already carried a comment naming this
    exact failure mode plus the enumeration command to prevent it.** Same dominant pattern as 3-12: a
    fix trusted without checking it against an EXISTING sibling safeguard the repo itself provides.
    Folded into row 42's per-branch count (31→32).
14. **`4cebe91c`: five previously-unreported silent-drop positions in the guard, confirmed by
    EXECUTING `extractRefs`** — the enumeration-fragility shape (findings 6-7) recurring a third time
    in the same file. Treated as ONE further row-42 instance, not five: same underlying enumeration
    gap rediscovered, not five independent mechanisms.
15. **`4cebe91c`: a "Known uncovered position" doc section stated the set was singular; the real set
    was larger.** Same shape as finding 9's "Two known limits" (an enumeration of a structurally open
    or under-counted set). Folded into row 42 (→33, with 14 above).
16. **`4cebe91c`: doc-updater proposed 2 edits, both wrong on the merits, and mis-cited a decision
    header date by echoing the ILLUSTRATIVE EXAMPLE given in its own dispatch prompt rather than
    reading the file.** A new sub-mechanism, not previously tracked: an agent's dispatch-prompt
    example text leaking into its own output as if it were a real citation. The agent DID look — but
    at the wrong source (its own prompt scaffolding) — which is why it is distinct from row 68
    (asserting a verification never performed at all). Logged as its own WATCHING row, count=1.
17. **`4cebe91c`: test-writer found 7 MORE mutation-blind mechanisms in the same guard** (deleting
    each left the suite green); `ade3f05f`'s cycle found an 8th (interior-whitespace tolerance in two
    paren regexes). Both fold into "Mutation-check executed but doesn't falsify the claim" as
    reinforcing volume on the SAME branch/file (row moved 3→4) — the drafted `test-writer.md` §
    Mutation-check addendum above is now overdue given how much evidence has accumulated on one file.
18. **CR-local round 1 (3 findings, all verified against source before triage, all APPLIED):**
    `docs/decisions.md` L1538 and L1589 — 2 more instances of row 69 (internally-contradictory
    arithmetic within one document; L1538's "never fires on a true claim" contradicted its own
    entry's UNMEASURED-precision section, L1589 carried two different stale tallies for the same
    fact) — now 16th-17th; plus 5 hardcoded `34/34`-style suite-count lines in
    `check-commit-claims.test.mjs`, stale against the grown suite (row "Claim-correction commit
    updates a count...", 7th instance, and a THIRD branch for that row's cross-branch tracking,
    joining the 2026-08-08 branch and `chore/run-log-1242-merged`).

### Reassessed 2026-09-09: a narrow checkable SUBSET of "fix introduces a fresh instance" now exists

The "no shared syntactic shape" verdict two sections up stands for the GENERAL class — finding 11
(mutation-coverage gap) and finding 6 (sibling-exclusion silent drop) still share no syntactic shape
with each other or with a prose enumeration. But three more instances on this branch cluster on ONE
shape specifically:

- (a) `4cebe91c`→`33c8ff79` removed 5 hardcoded `N/N`-style suite-count literals from
  `check-commit-claims.test.mjs` and simultaneously ADDED 6 more of the same shape — and CR-local
  round 1 later found even those stale again (finding 18 above).
- (b) The same drafting pass de-quantified one overclaim ("never fires on a true claim") while ADDING
  a fresh one ("one per revision, without exception") — finding 65's 4th instance and this branch's
  own three-way-measurement finding are siblings of this shape.
- (c) A `docs/decisions.md` bullet fixing a false claim overcorrected into a different false one
  ("neither SHA is checked" against a real, position-dependent behaviour).

All three are a DIFF that DELETES a line matching an absolute-quantifier-or-hardcoded-count regex
class (`\b(all|every|never|always|only|none|exactly)\b`, or a bare `\d+\s*(/|of)\s*\d+` ratio) and
ADDS a line matching the SAME class, in the same file, in the same commit. That pairing IS
mechanically detectable — not as a truth-checker (a mechanical check cannot know whether the NEW
claim is correct), but as a MANDATORY-reverify flag: a non-blocking check that scans a commit's diff
per file and WARNs whenever a removed line and an added line both match the regex class above.

**Proposed text** (for `code-style.md` §10 clause 3, pending orchestrator review — not yet applied):
widen "a partial comment edit is the tell — grep the retracted phrase repo-wide" to also grep the
retracted phrase's REGEX CLASS (absolute quantifiers, hardcoded ratios/counts), not only its exact
text — so a REWORDED recurrence of the same rot-shape is caught, not only a verbatim repeat. This
does not close the general mechanical-checkability question (findings 6 and 11 remain genuinely
semantic, no shared shape), but it converts three-plus recurrences of one specific shape into
something a hook or a review-prompt checklist item can flag without human judgment about truth —
only about whether the shape recurred.

### File-size codification slice — `chore/file-size-codification` (2026-09-09, commits `7ca1f522`/`3752c88a`/`fa52e34f`)

Learner pass over 2 completed post-commit cycles (cycle 1 reviewed `7ca1f522`, fixed by `3752c88a`;
cycle 2 reviewed `3752c88a`, fixed by `fa52e34f`). Five findings, all reinforcing existing rows;
none required a brand-new tracker entry beyond the two below.

- **Row 613 instances 4-5** (`Verification gate's pass condition is empty result`, 3→5,
  THRESHOLD-CLEARED further): cycle 1 found a committed dangling symlink — `readFileSync` throws
  ENOENT on it, and the guard treated that read failure as "path gone mid-run, skip" rather than
  "path exists and cannot be read, block" — permanently exempt at exit 0, no trace. `3752c88a`'s fix
  introduced `lstat` to distinguish "gone" from "unreadable". Cycle 2 found that fix itself wrong:
  `lstat` traverses every parent directory, so `chmod 000` on ONE directory made `lstat` fail
  identically for every path beneath it — hid NINE already-baselined violators and reported them
  RESOLVED. `fa52e34f`'s real fix: delete the lstat distinction entirely; every path comes from
  `git ls-files`, which already asserts existence, so ANY read failure — genuine mid-run deletion
  included — now blocks. Two "fix the specific escape reported" iterations before landing on
  "delete the disambiguation, don't refine it" — the FIX pattern to watch for next time this row
  recurs: prefer removing the fail-open branch over hardening its guard.
- **Row 602 instance 5** (`Proposed verification command silently verifies nothing`, 4→5): cycle 2's
  BLOCKING finding — a derivation command embedded in `.claude/limits.json` (meant to let a reader
  regenerate a cited number) threw when run as written, due to an unbound placeholder. It replaced a
  wrong hardcoded literal with something that LOOKED checkable and wasn't — worse than the literal
  it replaced, because a reader trusts "there's a command for this" without running it.
- **Row 519 instance 8** (`Claim-correction commit updates a count but leaves its arithmetic stale`,
  7→8): cycle 1 found types.ts "1807" (real 1806) and "502 of 553" (real 504/554) wrong. `3752c88a`
  fixed both — but ONLY at the specific line under review. Cycle 2 (reviewing `3752c88a`) found both
  numbers STILL wrong in sibling comments elsewhere in the same file family — the fix corrected the
  instance being looked at, not the class. Textbook row-519 shape: same document, same fact,
  uncorrected copy survives a commit whose whole purpose was correcting it.
- **NEW — Ratchet/baseline keyed on PATH, not content, is defeated by content-swap or rename**
  (2 instances, RULE CANDIDATE): (1) cycle 1: the ratchet's ONLY key is the file path string. Editing
  a baselined file's content in place — replacing it with different content that is STILL over the
  limit but UNDER the recorded baseline number — reports nothing at all: not even a stale-baseline
  warning, because the path never left the violators list. Ordinary refactor, no adversarial intent,
  applies to all 92 baseline entries simultaneously. (2) cycle 2: classification (which line-cap
  applies) ALSO derives from the path — specifically the filename suffix (`.test.ts` vs `.ts`,
  `use-*.ts` vs plain). `git mv foo.ts foo.test.ts` moves a 103-line Server Action from the 100-line
  cap to the 500-line test-file cap; the only trace was the old baseline row going stale, reported
  as an ADVISORY "this violation is resolved" notice — exactly backwards, since the rename didn't
  fix anything, it just changed which rule applied. `fa52e34f`'s fix: a stale baseline row now
  BLOCKS instead of advising, forcing the rename through `limits.json` where a human sees it. This is
  the SAME general lesson as the PROMOTED `--name-only` row (88, "a rename's other half is invisible")
  — path is an unstable identity — but manifesting in a hand-rolled JSON baseline schema rather than
  a `git diff` flag, so it's tracked as a distinct mechanism rather than folded into 88's count.
  Propose (2 occurrences, same slice, different commits — meets the letter of the 2+-occurrences
  rule; note this is the SAME open ambiguity as row 106's "2nd-branch" gate, since both instances are
  on one slice/branch): any NEW ratchet/baseline data file must key entries on `path + content-hash`
  (so content-swap is visible), and must derive rule-classification fresh from the CURRENT filename
  every run rather than trusting a stored classification — a stale classification is exactly the
  rename escape. No existing mirror for this (`.coderabbit.yaml` and `security-auditor.md` do not
  cover `check-file-size-guard.mjs`); flag as a candidate mirror-sweep target if/when promoted.
- **NEW — generalizes WATCHING row 690** (`Commit-message verification citation carried over from an
  earlier draft, not re-derived after the code moved`, 1→2, now RULE CANDIDATE): row 690 was scoped
  to a single line-number citation. `7ca1f522`'s cycle-1 findings are the same root cause on
  COUNTS/TOTALS instead: FOUR wrong figures in one commit message — "502 of 553" files (real
  504/554), "one Server Action outside actions/" (real 4), "2 of 7 files under actions/" (real 7 of
  11), types.ts "1807" lines (real 1806) — every one stale because the commit ITSELF split two
  over-limit Server Actions into four files and made other edits AFTER the counts were taken, so the
  counts were wrong from the moment they were written, not from later drift. (Per the same-commit
  convention, these 4 instances count as ONE occurrence for promotion purposes — they share one
  originating commit.) Generalized text to propose for `code-style.md` §10, as a clause distinct from
  cl.2 (open-set framing) and cl.3 (partial comment edit — that's about EDITING an existing claim;
  this is about AUTHORING one against a moving target): "Any count of files/lines/instances stated in
  a commit message or comment must be (re)computed as the LAST step before finalizing the message,
  against the commit's OWN final diff — never against a pre-edit, draft, or mid-edit state." This is
  a THIRD distinct §10 failure shape (open-set enumeration; partial-edit staleness; and now
  authorship-ordering staleness on an otherwise-closed, computable count) — worth a clause of its own
  rather than folding into cl.2 or cl.3, since neither's fix (derive-a-command / grep-the-retracted-
  phrase) addresses "recompute at the end, not the start."

**What did NOT recur (positive signals).** No occurrence of: row 43 (open-enumeration rules-file
bullet) — the whole POINT of this slice was replacing prose enumerations with a JSON data file a
test validates, and it worked for the numbers themselves (no stale §1 cap literal found in either
cycle). Row 69 (rules-file claim true in its hunk, false vs. another section/arithmetic) — none of
the wrong counts found here were internally CONTRADICTORY within one document; they were externally
wrong against the filesystem, a narrower and different defect. Row 602's usual shape (a proposed
verification command that runs but checks the wrong scope) — this cycle's row-602 instance is the
stronger sub-case, a command that does not run at all. And genuinely positive: the commit message
states both CRITICALs in `3752c88a` "were reproduced as working exploits before the fix and re-run
against it after" — proper mutation-check discipline (row 602's sibling "Mutation-check executed but
doesn't falsify the claim" did NOT recur here; the checks shipped were real: `chmod 000` and a
same-path content-swap are both isolated, targeted reproductions, not category-membership checks).
