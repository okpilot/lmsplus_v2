# Agent Memory — plan-critic

> Index of durable plan-review knowledge. Recurring-pattern tracker + stable recipes.
> Per `.claude/rules/agent-memory.md`: keep < 200 lines / < 25 KB. No session logs — git holds history.
> Rows are never deleted, only state-transitioned. Detail lives in `topics/` — keep rows to ONE line.

## Recurring Issues Tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Importer new-type `buildRow` branch specified as "set ONLY the type-specific columns" drops `explanation_text` — `common` spreads `base` so it carries the GENERIC value, and both existing branches re-resolve the authored one; NOT NULL is satisfied so nothing fails and the authored text vanishes silently. | 2026-08-11 | 1 | 2026-08-11 | WATCHING (VFR RT Part 2 dialog_fill; caught by BOTH plan-critic lenses independently) |
| Guard plan keyed on an OPTIONAL content field is sized "~4 lines" and omits the `typeof === 'string'` check, crashing the one file that lacks the field — here Part 1, the DEFAULT import target and the path that reached prod. | 2026-08-11 | 1 | 2026-08-11 | WATCHING (the "~4 lines" sizing is what invites the unguarded form) |
| CR-fixup plans sweep siblings by the finding's IDENTIFIER (RPC name), not by CODE STRUCTURE (`rpc<T[]>` + array-only guard). ([details](topics/cr-fixup-sweep-axis-1185.md#1)). | 2026-08-11 | 1 | 2026-08-11 | RESOLVED-WATCH (rev 2 rewrote the sweep by code structure) |
| New try/catch uses `(err as Error).message`; repo is 100:1 `instanceof Error`, incl. the sibling importer. ([details](topics/cr-fixup-sweep-axis-1185.md#2)). | 2026-08-11 | 1 | 2026-08-11 | RESOLVED-WATCH (rev 2 switched to `instanceof Error`) |
| Plan enumerates prior art, then picks the OPPOSITE disposition (reject-all vs sibling skip-the-row) — diff DISPOSITION, not just shape. ([details](topics/cr-fixup-sweep-axis-1185.md#5)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Deferred-issue acceptance uses a path prefix narrower than the cross-dir enumeration; Apply-vs-Defer cond. 3 argued on the wrong branch. ([details](topics/cr-fixup-sweep-axis-1185.md#6)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Rejection log emits `typeof data` — null/array/object all collapse to `'object'`, so log + its two tests can't tell inputs apart. ([details](topics/cr-fixup-sweep-axis-1185.md#7)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| One predicate guarding N serializations of a union field gets DIFFERENT strictness per branch, vs a risk register claiming exact contract match. ([details](topics/cr-fixup-sweep-axis-1185.md#8)). | 2026-08-11 | 1 | 2026-08-11 | RESOLVED-WATCH (rev 4 adopted the single coerce-then-isFinite form) |
| A plan's `Mirrors <file>:<line>` cross-ref is mis-numbered AND behaviourally false — the "mirror" adds a gate the cited sibling lacks; written from shape, never re-read. ([details](topics/cr-fixup-sweep-axis-1185.md#10)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| §3/§1 line budget carried forward from an earlier revision while later revs grew the body — final formatted body lands exactly at cap with the plan claiming margin. ([details](topics/cr-fixup-sweep-axis-1185.md#11)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Plan assigns all CR findings terminal states (incl. SKIP) but never schedules the `/replycoderabbit` posting step in its execution list. | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Guard computes a `findIndex` only to name it in a message; no test pins the INDEX, so `some()`+hardcoded `row 0` stays green. ([details](topics/cr-fixup-sweep-axis-1185.md#9)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Skip-with-reason on a "missing test" finding argues scope/backlog without grepping the caller's EXISTING `*.integration.test.ts`. ([details](topics/cr-fixup-sweep-axis-1185.md#3)). | 2026-08-11 | 1 | 2026-08-11 | RESOLVED-WATCH (rev 2 added the integration file + run step) |
| `tsc --noEmit <file.ts>` positionally on a tsconfig-excluded dir — CLI-listed files make tsc ignore tsconfig entirely. ([details](topics/cr-fixup-sweep-axis-1185.md#4)). | 2026-08-11 | 1 | 2026-08-11 | RESOLVED-WATCH (rev 2 dropped it; biome lints scripts/ but is not a TYPE gate) |
| RLS-narrowing plans (`FOR ALL`→`FOR SELECT`): right change, wrong justification (WITH-CHECK vs `RETURNING` visibility; unverified `prosecdef`). ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#5)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| Breaking-RPC-**arg**-change plans miss the multi-line `.rpc()` form + tests whose SEMANTICS change. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#1)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| Plans fixing a client-fabricated identifier must name the CI job catching a regression — Discovery has zero coverage. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#2)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| §15 carve-outs verify only the UPDATE half — `BEFORE UPDATE OF` never fires on INSERT; probe the INSERT path. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#3)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| Mode-conditional answer-key strips keyed on the TARGET row's attacker-writable column are self-defeating — key on the CALLER. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#4)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| New `_hooks/` modules ship without their OWN co-located test (§7). ([details](topics/extraction-and-guard-plan-gaps.md#1)). | 2026-07-13 | 1 | 2026-07-13 | WATCHING |
| Snap/clamp plans fix `disabled` but leave `onClick` on the raw page value. ([details](topics/extraction-and-guard-plan-gaps.md#2)). | 2026-07-13 | 1 | 2026-07-13 | RESOLVED (applied pre-stability-round) |
| Plans grow an already-over-cap hook without a same-commit extraction. ([details](topics/extraction-and-guard-plan-gaps.md#3)). | 2026-07-13 | 1 | 2026-07-13 | WATCHING |
| Re-entry ref-guard plans cite a confirm-less builder as precedent — ref lands before the confirm, locking re-attempts. ([details](topics/extraction-and-guard-plan-gaps.md#4)). | 2026-07-13 | 1 | 2026-07-13 | WATCHING |
| Page-BODY→async-server-component extractions keep `page.test.tsx` as the logic test; RTL can't render the async child. ([details](topics/extraction-and-guard-plan-gaps.md#5)). | 2026-07-08 | 1 | 2026-07-08 | WATCHING |
| Session-lifecycle save/discard/resume plans (#1085): positive-whitelist, all-3-save-callers, resume-from-session-row traps. ([details](topics/session-lifecycle-1085.md)). | 2026-07-03 | 1 | 2026-07-03 | WATCHING |
| UI-reuse & question-type-CLONE plans miss the reveal-mechanic + shared touch-points. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-26 | 2 | 2026-07-02 | WATCHING (2) |
| Drag-drop question-type CLONE plans under-enumerate execution-only SQL + CHECK/REVOKE/distractor tests. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-07-02 | 1 | 2026-07-02 | WATCHING |
| RPC-signature-change plans (RETURNS TABLE DROP+recreate) miss types.ts drift, LATERAL row-drop, multi-key fan-out key-split. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-21 | 3 | 2026-07-02 | RULE CANDIDATE (3) |
| Data-layer-CHECK + regex-hardening answer-leak plans (#951): 22023 traps, DDL-in-test infeasibility, plan.md count-literal. ([details](topics/regex-hardening-answer-leak-951.md)). | 2026-06-23 | 6 | 2026-06-26 | RULE CANDIDATE (2) |
| VFR-RT Phase 4/5 report-rendering: pagination/builder, field-repurpose, sibling-audit, DIALOG_FILL-CLONE checklist. ([details](topics/vfr-rt-phase4-report-rendering.md)). | 2026-06-24 | 3 | 2026-06-25 | RULE CANDIDATE (3) |
| Plans gate a new SECURITY DEFINER RPC "internal-only" by omitting GRANT — false premise; REVOKE is required. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-06-21 | 2 | 2026-07-02 | WATCHING (2) |
| New key-revealing grader RPC plans under-enumerate §15 ordering + per-type correctness guards. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-06-21 | 1 | 2026-06-21 | WATCHING |
| Mechanical static-analysis guard plans under-specify scan scope (scripts/ exclusion). ([details](topics/mechanical-guard-plan-925-phase3.md)). | 2026-06-20 | 1 | 2026-06-20 | RESOLVED-WATCH |
| New test-tier plans under-specify unit-vitest + tsconfig ingestion exclusions. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | RESOLVED-WATCH |
| Integration-test negative assertions go vacuous when RLS (not the helper) hides the excluded row. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| App-tier mutation-action integration plans under-cover the action contract (null-vs-string, lifecycle, coalesced fields, error maps). ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 2 | 2026-06-20 | WATCHING |
| Integration fixture flat admin INSERTs omit NOT NULL/UNIQUE columns the RPC path supplies. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Rule/docs-promotion plans hard-code learner counts + offender inventories that drift — re-derive at exec, git-verify hashes. ([details](topics/rule-promotion-count-drift.md)). | 2026-06-21 | 3 | 2026-07-03 | RULE CANDIDATE (3) |
| Plans cite a stale migration as "latest" RPC body — trace the CREATE OR REPLACE chain. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Tooling/guard-script plans put new scripts under gitignored root /scripts/ — relocate to .claude/hooks/. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| biome `overrides` deep-merges per-rule — a narrow per-glob OFF override is safe. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Dual-client app-layer integration: action reads the cookie-jar session, fixtures seed via a separate client — same user required. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Rules-change proposals claim to "keep existing caps" while replacing the numbers — diff against the binding text. ([details](topics/multi-round-critic-protocol-draft.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Multi-round review-loop proposals risk learner double-counting within-gate re-findings. ([details](topics/multi-round-critic-protocol-draft.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| MC-only→new-question-type pipeline plans omit DraftAnswer/AnswerFeedback widening + the loadSessionQuestions caller. ([details](topics/new-question-type-storage-and-pipeline.md)). | 2026-06-20 | 3 | 2026-06-20 | WATCHING (3) |
| New-type answer storage-shape ambiguity hits report pagination AND score-aggregation — specify both. ([details](topics/new-question-type-storage-and-pipeline.md)). | 2026-06-20 | 2 | 2026-06-21 | RULE CANDIDATE (2) |
| Report query SELECT string not updated alongside AnswerRow widening — fields stay undefined at runtime. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| RETURNS TABLE extension requires DROP+CREATE, not CREATE OR REPLACE. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Session-storage validator whitelist not widened for a new exam mode — breaks tab-refresh round-trip. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-19 | 1 | 2026-06-19 | WATCHING |
| Migration re-timestamp/rebase plans must enumerate inline `mig NNN` SQL-comment cross-refs too. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-19 | 1 | 2026-06-19 | WATCHING |
| Migration renumbering must update all 3 tech.md spec-count occurrences + decisions.md, from master's current value. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-19 | 1 | 2026-06-19 | WATCHING |
| Multi-query test mocks: one mockFrom/mockRpc keyed by name can't distinguish N sequential calls — need call-order dispatch. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 6 | 2026-05-31 | WATCHING (6) |
| UI-sweep text-swap plans must enumerate every test querying that button by its pre-loading accessible name. ([details](topics/test-mock-scoping-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| UI-sweep spinner plans must distinguish sync-nav from async-action buttons. ([details](topics/test-mock-scoping-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| Multi-query test mocks: one mockFrom can't distinguish N parallel calls to a table, or count-head vs range-data. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 6 | 2026-06-01 | WATCHING (6) |
| Test-update scope underspecified: "test update" without naming the assertion/fixture/prop that breaks. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 8 | 2026-06-18 | WATCHING (8) |
| SECURITY DEFINER RPC plans omit project SQL conventions: is_admin(), soft-delete filters, cached v_admin_role. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-04-11 | 5 | 2026-06-18 | WATCHING (5) |
| Sibling-file audit missed: defensive pattern added to one action/query file, identical sibling untouched. | 2026-04-11 | 2 | 2026-05-22 | RULE CANDIDATE → CLAUDE.md sibling-audit |
| Plans citing a constraint/mode value must trace the FULL migration chain — a later one may have widened it. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-05-08 | 3 | 2026-05-28 | WATCHING (3) |
| Red-team fixture INSERTs into student_responses need selected_option_id (TEXT NOT NULL CHECK a/b/c/d). ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 2 | 2026-05-31 | WATCHING (2) |
| Cross-org non-vacuity: assert BOTH that the victim org HAS the resource and the attacker org does not. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| Red-team scaffolds needing multiple caller roles must enumerate every required client fixture. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| Red-team success-path plans: numeric-field type-only specs, audit-tracker fixture registration, pool-seed idempotency. ([details](topics/redteam-success-path-gaps.md)). | 2026-07-03 | 1 | 2026-07-03 | WATCHING |
| Red-team specs for aggregation RPCs need an instructor fixture not in seed.ts by default. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 2 | 2026-05-31 | WATCHING |
| Red-team plans must verify Vector IDs against the LIVE attack-surface.md matrix + tech.md/decisions.md spec-counts. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 4 | 2026-06-09 | WATCHING (4) |
| Red-team spec additions omit the attack-surface.md vector row / GAP→COVERED flip. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-01 | 4 | 2026-06-06 | WATCHING (4) |
| Two-dir migration mirror drift — identify the authoritative dir before reproducing a body. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-06 | 1 | 2026-07-11 | RESOLVED (packages/db/migrations frozen 2026-07-11; supabase/ sole truth — #1111) |
| Prop-threading plans must enumerate all 4 files: source, form/trigger, state-holder, consumer. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-18 | 1 | 2026-06-18 | WATCHING |
| App-invoke "proxy" of a REVOKE-gated grader RPC re-introduces the forgery the REVOKE prevents. ([details](topics/elp-oral-exam-security-lessons.md)). | 2026-07-02 | 1 | 2026-07-02 | WATCHING |
| Split-module refactors declaring a module "standalone" must verify every function CALL inside it, not just imports. ([details](topics/misc-plan-review-lessons.md)). | 2026-07-02 | 1 | 2026-07-02 | WATCHING |
| Pure-structural refactors: React-hook block moved into a plain helper + missing tests for new _hooks/ files. ([details](topics/structural-refactor-hook-and-test-gaps.md)). | 2026-07-03 | 1 | 2026-07-03 | WATCHING |
| ELP #1069 grader-audit-event: service-role-finalizer audit-INSERT deviation documented; both blocking fixes verified. ([details](topics/elp-oral-exam-security-lessons.md)). | 2026-07-03 | 1 | 2026-07-03 | RESOLVED-WATCH |

## Positive signals
- See [tracker-archive § Relocated positive signals](topics/tracker-archive.md) — 6 plans that verified assumptions correctly.

## Topic pointers
- [cr-fixup-sweep-axis-1185](topics/cr-fixup-sweep-axis-1185.md) — sweep by code STRUCTURE not by the finding's identifier; diff the prior art's DISPOSITION (skip-row vs reject-all), not just its shape; `instanceof Error` vs `as Error`; `typeof` collapses null/array/object; per-branch predicate strictness; grep for the caller's existing integration test before arguing scope; positional `tsc` ignores tsconfig.
- [durable-review-checks](topics/durable-review-checks.md) — per-domain checklists: SQL/migrations, pagination, extraction/file-split, component/UI, red-team specs, validation discipline, return contracts.
- [1165-rpc-scoping-and-rls-narrowing](topics/1165-rpc-scoping-and-rls-narrowing.md) — RPC arg-change enumeration, §15 INSERT-path carve-outs, caller-keyed answer strips, RLS `FOR ALL`→`FOR SELECT` semantics (FORCE RLS vs BYPASSRLS, WITH CHECK on SELECT, RETURNING visibility).
- [extraction-and-guard-plan-gaps](topics/extraction-and-guard-plan-gaps.md) — `_hooks/` test omissions, snap/clamp `onClick`, over-cap hook growth, re-entry ref placement, async-component test relocation.
- [tracker-archive](topics/tracker-archive.md) — older count=1 rows + positive signals, verbatim. **Check here before concluding a pattern is new** — 15 cold rows (last seen ≤ 2026-06-13) were relocated 2026-08-11 to stay under the injection budget; re-promote one into the tracker if it recurs.
- [pr-836-report-ui](topics/pr-836-report-ui.md) — VFR-RT report/flagging UI facts: `useFlaggedQuestions` is server-result-driven, `active_flagged_questions` security_invoker view.
