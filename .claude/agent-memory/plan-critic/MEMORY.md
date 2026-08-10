# Agent Memory — plan-critic

> Index of durable plan-review knowledge. Recurring-pattern tracker + stable recipes.
> Per `.claude/rules/agent-memory.md`: keep < 200 lines / < 25 KB. No session logs — git holds history.
> Rows are never deleted, only state-transitioned. Detail lives in `topics/` — keep rows to ONE line.

## Recurring Issues Tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| RLS-policy-narrowing plans (`FOR ALL`→`FOR SELECT`) get the change right but the justification wrong: WITH-CHECK mis-attribution vs the real `RETURNING`-visibility blocker, and "all readers are SECURITY DEFINER" without grepping `prosecdef=false`. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#5)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| Breaking-RPC-**arg**-change plans miss the multi-line `.rpc()` form and test cases whose SEMANTICS (not just args) change. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#1)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| Plans fixing a client-fabricated identifier must name the CI job that catches a regression — Discovery has zero automated coverage. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#2)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| §15 soft-delete carve-outs verify only the UPDATE half — `BEFORE UPDATE OF` triggers never fire on INSERT, so probe the INSERT path. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#3)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| Mode-conditional answer-key strips keyed on the TARGET row's own attacker-writable column are self-defeating — key on the CALLER's state. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#4)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| New `_hooks/` utility modules ship without their OWN co-located test (§7 covers every new file in the dir). ([details](topics/extraction-and-guard-plan-gaps.md#1)). | 2026-07-13 | 1 | 2026-07-13 | WATCHING |
| Snap/clamp plans fix `disabled` but leave `onClick` on the raw page value. ([details](topics/extraction-and-guard-plan-gaps.md#2)). | 2026-07-13 | 1 | 2026-07-13 | RESOLVED (applied pre-stability-round) |
| Plans grow an already-over-cap hook without a same-commit extraction. ([details](topics/extraction-and-guard-plan-gaps.md#3)). | 2026-07-13 | 1 | 2026-07-13 | WATCHING |
| Re-entry ref-guard plans cite a confirm-less builder as precedent — ref lands before the confirm and locks re-attempts. ([details](topics/extraction-and-guard-plan-gaps.md#4)). | 2026-07-13 | 1 | 2026-07-13 | WATCHING |
| Page-BODY→async-server-component extractions keep `page.test.tsx` as the logic test; RTL can't render the async child. ([details](topics/extraction-and-guard-plan-gaps.md#5)). | 2026-07-08 | 1 | 2026-07-08 | WATCHING |
| Session-lifecycle save/discard/resume plans adding a NEW `quiz_sessions` soft-delete (#1085) — positive-whitelist, all-3-save-callers, resume-from-session-row traps. ([details](topics/session-lifecycle-1085.md)). | 2026-07-03 | 1 | 2026-07-03 | WATCHING |
| UI-component-reuse & question-type-CLONE plans miss the reveal-mechanic + shared touch-points. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-26 | 2 | 2026-07-02 | WATCHING (2) |
| Drag-drop question-type CLONE plans under-enumerate execution-only SQL + CHECK/REVOKE/distractor tests. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-07-02 | 1 | 2026-07-02 | WATCHING |
| RPC-signature-change plans (RETURNS TABLE DROP+recreate) miss types.ts drift, LATERAL row-drop, multi-key fan-out key-split. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-21 | 3 | 2026-07-02 | RULE CANDIDATE (3) |
| Data-layer-CHECK + regex-hardening answer-leak plans (#951 dialog_fill) — 22023 traps, DDL-in-test infeasibility, plan.md count-literal. ([details](topics/regex-hardening-answer-leak-951.md)). | 2026-06-23 | 6 | 2026-06-26 | RULE CANDIDATE (2) |
| VFR-RT Phase 4/5 report-rendering plans — pagination/builder, field-repurpose, sibling-audit, DIALOG_FILL-CLONE checklist. ([details](topics/vfr-rt-phase4-report-rendering.md)). | 2026-06-24 | 3 | 2026-06-25 | RULE CANDIDATE (3) |
| Plans gate a new SECURITY DEFINER RPC "internal-only" by omitting GRANT — false premise; REVOKE is required. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-06-21 | 2 | 2026-07-02 | WATCHING (2) |
| New key-revealing practice grader RPC plans under-enumerate §15 ordering + per-type correctness guards. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-06-21 | 1 | 2026-06-21 | WATCHING |
| Mechanical static-analysis guard plans under-specify scan scope (scripts/ exclusion). ([details](topics/mechanical-guard-plan-925-phase3.md)). | 2026-06-20 | 1 | 2026-06-20 | RESOLVED-WATCH |
| New test-tier plans under-specify unit-vitest + tsconfig ingestion exclusions. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | RESOLVED-WATCH |
| Integration-test negative/exclusion assertions are vacuous when RLS (not the helper) hides the excluded row. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| App-tier mutation-action integration plans under-cover the action contract (null-vs-string, lifecycle, coalesced fields, error maps). ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 2 | 2026-06-20 | WATCHING |
| Integration fixture flat admin INSERTs omit NOT NULL/UNIQUE columns the RPC path would supply. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Rule/docs-promotion plans hard-code learner counts + offender inventories that drift — re-derive at exec, git-verify every hash. ([details](topics/rule-promotion-count-drift.md)). | 2026-06-21 | 3 | 2026-07-03 | RULE CANDIDATE (3) |
| #925-family plans cite a stale migration as "latest" RPC body — trace the CREATE OR REPLACE chain. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Tooling/guard-script plans place new scripts under root /scripts/ which is gitignored — relocate to .claude/hooks/. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| biome `overrides` deep-merges per-rule — a narrow per-glob OFF override is safe. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Dual-client app-layer integration pattern: action reads cookie-jar session, fixtures seed via a separate client — both must point at the same user. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Rules-change proposals claim to "keep existing caps" while replacing the numeric values — diff against the binding text. ([details](topics/multi-round-critic-protocol-draft.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Multi-round review-loop proposals risk learner double-counting within-gate re-findings as separate occurrences. ([details](topics/multi-round-critic-protocol-draft.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Plans generalizing an MC-only pipeline to new question types omit DraftAnswer/AnswerFeedback widening + loadSessionQuestions caller. ([details](topics/new-question-type-storage-and-pipeline.md)). | 2026-06-20 | 3 | 2026-06-20 | WATCHING (3) |
| New-type answer storage-shape ambiguity affects report pagination AND score-aggregation — must specify both. ([details](topics/new-question-type-storage-and-pipeline.md)). | 2026-06-20 | 2 | 2026-06-21 | RULE CANDIDATE (2) |
| Report query SELECT string not updated alongside AnswerRow type widening — fields stay undefined at runtime. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| RETURNS TABLE extension requires DROP+CREATE, not CREATE OR REPLACE. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Session-storage validator whitelist not widened when adding a new exam mode — breaks tab-refresh round-trip. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-19 | 1 | 2026-06-19 | WATCHING |
| Migration re-timestamp/rebase plans must enumerate inline `mig NNN` SQL-comment cross-refs too. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-19 | 1 | 2026-06-19 | WATCHING |
| Migration renumbering must update ALL 3 tech.md spec-count occurrences + decisions.md, using master's current value. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-19 | 1 | 2026-06-19 | WATCHING |
| Multi-query test mocks: one mockFrom/mockRpc keyed by name can't distinguish N sequential calls — scope call-order dispatch. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 6 | 2026-05-31 | WATCHING (6) |
| UI-sweep text-swap plans must enumerate every test querying that button by its pre-loading accessible name. ([details](topics/test-mock-scoping-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| UI-sweep spinner plans must distinguish sync-nav buttons from async-action buttons. ([details](topics/test-mock-scoping-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| Multi-query test mocks: one mockFrom can't distinguish N parallel calls to a table, or count-head vs range-data. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 6 | 2026-06-01 | WATCHING (6) |
| Test-update scope underspecification: "test update" without naming the assertion/fixture/prop that breaks. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 8 | 2026-06-18 | WATCHING (8) |
| SECURITY DEFINER RPC plans omit project SQL conventions: is_admin(), soft-delete filters, cached v_admin_role. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-04-11 | 5 | 2026-06-18 | WATCHING (5) |
| Sibling-file audit missed: defensive pattern added to one action/query file, identical sibling untouched. | 2026-04-11 | 2 | 2026-05-22 | RULE CANDIDATE → CLAUDE.md sibling-audit |
| Plans citing a constraint/mode value must trace the FULL migration chain — a later migration may have widened it. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-05-08 | 3 | 2026-05-28 | WATCHING (3) |
| Red-team fixture INSERTs into student_responses must supply selected_option_id correctly (TEXT NOT NULL CHECK a/b/c/d). ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 2 | 2026-05-31 | WATCHING (2) |
| get_student_streak always returns one {0,0} row for anon/cross-org — generic error/length assertions fail. ([details](topics/misc-plan-review-lessons.md)). | 2026-05-31 | 1 | 2026-05-31 | WATCHING |
| Cross-org non-vacuity gap: assert BOTH that the victim org HAS the resource and the attacker org does not. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| Red-team spec scaffolds needing multiple caller roles must enumerate every required client fixture. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| Red-team success-path plans: numeric-field type-only specs, audit-tracker fixture registration, pool-seed idempotency. ([details](topics/redteam-success-path-gaps.md)). | 2026-07-03 | 1 | 2026-07-03 | WATCHING |
| Red-team specs for aggregation RPCs need an instructor fixture not in seed.ts by default. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 2 | 2026-05-31 | WATCHING |
| Red-team plans must verify Vector IDs against the LIVE attack-surface.md matrix + tech.md/decisions.md spec-counts. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 4 | 2026-06-09 | WATCHING (4) |
| Vector-label collision sweeps must grep ALL red-team spec files, not just the two being renamed. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-09 | 1 | 2026-06-09 | WATCHING |
| Red-team spec additions omit the attack-surface.md vector row / GAP→COVERED flip. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-01 | 4 | 2026-06-06 | WATCHING (4) |
| Two-dir migration mirror drift — identify which dir is authoritative before reproducing a body. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-06 | 1 | 2026-07-11 | RESOLVED (packages/db/migrations frozen 2026-07-11; supabase/ sole truth — #1111) |
| Sibling-function inline-role-subquery audit must enumerate ALL siblings with the same pattern. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-06 | 1 | 2026-06-06 | WATCHING |
| Column-GRANT plans on `users` must verify writable columns from the CREATE TABLE — only full_name is authenticated-writable. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-06 | 1 | 2026-06-06 | WATCHING |
| FK-into-global-table audit: "X is the only FK into Y" claims must grep ALL migrations for REFERENCES Y. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-06 | 1 | 2026-06-06 | WATCHING |
| Spec-count doc updates must grep the FULL steering doc for every occurrence of the number string. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-06 | 1 | 2026-06-06 | WATCHING |
| Red-team RAISE-string assertions must read the exact string in the LATEST def of EACH RPC. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-07 | 1 | 2026-06-07 | WATCHING |
| #781 cookie-rewrite approach for @supabase/ssr token-refresh is sound; config.toml jwt_expiry fallback has CI-wide blast radius. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-07 | 1 | 2026-06-07 | WATCHING |
| E2E un-skip plans for AlertDialogAction with isPending text-flip — plan's assumptions were correct. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-09 | 1 | 2026-06-09 | WATCHING |
| Red-team spec-split plans must read the test BODY before labeling it "probe-only/no cleanup". ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-09 | 1 | 2026-06-09 | WATCHING |
| Spec-split plans updating the Spec-File column must confirm the Vector ID's description matches the test. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-09 | 1 | 2026-06-09 | WATCHING |
| File-split plans marking an extraction "possibly" needed must verify it is the ONLY path under the line-count ceiling. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-09 | 1 | 2026-06-09 | WATCHING |
| Idempotent-resume RPC race-handlers must re-read+return the existing row, not mirror a raise-only sibling. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-10 | 1 | 2026-06-10 | WATCHING |
| docs/plan.md distinguishes current-state count lines from historical Phase-delivery records (must NOT be edited). ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-11 | 1 | 2026-06-11 | WATCHING |
| Red-team probe-only→seeding conversions must update the file header comment + add afterAll cleanup. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-13 | 1 | 2026-06-13 | WATCHING |
| Prop-threading plans must enumerate ALL 4 files: source, form/trigger, state-holder, consumer. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-18 | 1 | 2026-06-18 | WATCHING |
| App-invoke "proxy" of a REVOKE-gated grader RPC re-introduces the forgery the REVOKE prevents. ([details](topics/elp-oral-exam-security-lessons.md)). | 2026-07-02 | 1 | 2026-07-02 | WATCHING |
| Split-module refactor plans declaring a module "standalone" must verify every function CALL inside it, not just its imports. ([details](topics/misc-plan-review-lessons.md)). | 2026-07-02 | 1 | 2026-07-02 | WATCHING |
| Pure-structural-refactor plans: React-hook block moved into a plain helper + missing tests for new _hooks/ files. ([details](topics/structural-refactor-hook-and-test-gaps.md)). | 2026-07-03 | 1 | 2026-07-03 | WATCHING |
| ELP #1069 grader-audit-event plan — service-role-finalizer audit-INSERT deviation documented; both blocking fixes verified. ([details](topics/elp-oral-exam-security-lessons.md)). | 2026-07-03 | 1 | 2026-07-03 | RESOLVED-WATCH |

## Positive signals
- See [tracker-archive § Relocated positive signals](topics/tracker-archive.md) — 6 plans that verified assumptions correctly.

## Topic pointers
- [durable-review-checks](topics/durable-review-checks.md) — per-domain checklists: SQL/migrations, pagination, extraction/file-split, component/UI, red-team specs, validation discipline, return contracts.
- [1165-rpc-scoping-and-rls-narrowing](topics/1165-rpc-scoping-and-rls-narrowing.md) — RPC arg-change enumeration, §15 INSERT-path carve-outs, caller-keyed answer strips, RLS `FOR ALL`→`FOR SELECT` semantics (FORCE RLS vs BYPASSRLS, WITH CHECK on SELECT, RETURNING visibility).
- [extraction-and-guard-plan-gaps](topics/extraction-and-guard-plan-gaps.md) — `_hooks/` test omissions, snap/clamp `onClick`, over-cap hook growth, re-entry ref placement, async-component test relocation.
- [tracker-archive](topics/tracker-archive.md) — older count=1 rows + positive signals, verbatim.
- [pr-836-report-ui](topics/pr-836-report-ui.md) — VFR-RT report/flagging UI facts: `useFlaggedQuestions` is server-result-driven, `active_flagged_questions` security_invoker view.
