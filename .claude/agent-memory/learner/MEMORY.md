# Learner Agent — Memory

> Cross-agent pattern synthesis + false-positive frequency tracking.
> Governed by `.claude/rules/agent-memory.md`. **Update rows IN PLACE — never append a dated session log.** History lives in git (`git log -p -- .claude/agent-memory/learner/`).
> Migrated 2026-05-29 from the 6606-line append-only `patterns.md` journal. The pre-migration body is recoverable via git.

## Issue Frequency Tracker (live — count≥2)

Full record in `topics/tracker-archive.md`; journal in git at `2e87c3e6`. Schema: `Issue Type | Count | Last Seen | Status`. Terminal-state rows archived; active rows are terse stubs. Curations: 2026-06-07 (30 rows), 2026-06-10 (budget pass), 2026-06-10 (count=1 rows moved to archive-only per header spec).

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Test fixture shape mismatch (wrong/missing field in fixture object) | 2 | 2026-03-13 | RULE CANDIDATE — both caught pre-commit by type-check; … [full → topics/tracker-archive.md] |
| Bare `catch {}` without error-type narrowing | 2 | 2026-04-08 | RULE CANDIDATE → code-style.md §6 — swallowed redirect() from requireAdmin → 500; … [full → topics/tracker-archive.md] |
| Inconsistent guard between related RPCs (sibling missing guard) | 2 | 2026-03-14 | RULE CANDIDATE — auth.uid() guard + NULL correct_option guard each added to one RPC, missed sibling; … [full → topics/tracker-archive.md] |
| Partial fix applied to sibling file group (cross-cutting concern) | 10 | 2026-06-14 | RULE CANDIDATE (count 10, active) — fix applied to the instance seen, not all instances in file + siblings; … [full → topics/tracker-archive.md] |
| useTransition + manual loading state hybrid fragility | 2 | 2026-03-13 | RULE CANDIDATE — isPending + manual isLoading can both be false mid-fetch, flashing idle button; … [full → topics/tracker-archive.md] |
| Silent numeric fallback without observability logging | 2 | 2026-03-13 | RULE CANDIDATE — fallback to 0/min on empty/malformed data with no server signal; … [full → topics/tracker-archive.md] |
| Query missing student_id scope (returns wrong student's data) | 2 | 2026-03-15 | RULE CANDIDATE → security.md (propose on 3rd) — auth check ≠ ownership scoping; … [full → topics/tracker-archive.md] |
| UI event handler missing re-entry guard (double-fire) | 2 | 2026-03-16 | RULE CANDIDATE — async lock + event-propagation mechanisms; … [full → topics/tracker-archive.md] |
| UPDATE returning zero rows treated as success (silent no-op) | 2 | 2026-03-20 | RULE CANDIDATE → code-style.md §5 — ownership-scoped DELETE/UPDATE must `.select('id')` + check row count; … [full → topics/tracker-archive.md] |
| Error path in existing function untested (count-error branch) | 5 | 2026-06-10 | RULE CANDIDATE (count 5) — new edge/error branches added to existing tested files lack test updates in the same commit; … [full → topics/tracker-archive.md] |
| Derived value correct by coincidence (index used as count proxy) | 2 | 2026-03-13 | RULE CANDIDATE — value co-varies with metric but diverges on edge cases; … [full → topics/tracker-archive.md] |
| Auth callback guard ordering error (guards in wrong order → bypass) | 2 | 2026-03-17 | RULE CANDIDATE — session actions must precede existence/registration checks; … [full → topics/tracker-archive.md] |
| Supabase SELECT error swallowed in auth helper (distinct from mutation) | 3 | 2026-06-04 | RULE CANDIDATE → code-style.md §5 (extension) — auth-path + seed SELECTs must destructure `{ data, error }`. … [full → topics/tracker-archive.md] |
| Zod error message pinned to exact internal text | 2 | 2026-03-16 | RULE CANDIDATE — Zod internal messages aren't public API; … [full → topics/tracker-archive.md] |
| Missing `setSubmitting(true)` before async call in form/button handler | 2 | 2026-04-27 | RULE CANDIDATE → code-style.md (on 3rd) — set loading state before awaiting, not after; … [full → topics/tracker-archive.md] |
| Idempotent RPC returns hardcoded values instead of reading DB state | 2 | 2026-04-27 | RULE CANDIDATE — replay paths returned hardcoded pass/100% instead of querying config; … [full → topics/tracker-archive.md] |
| Code-reviewer flags file outside the commit diff scope | 2 | 2026-04-08 | RULE CANDIDATE → agent-code-reviewer.md (false positive) — agent scans full file; … [full → topics/tracker-archive.md] |
| Pre-existing file-size violation surfaced when commit adds lines to over-limit file | 3 | 2026-06-06 | RULE CANDIDATE — file at/over limit must be split in the same additive commit, not deferred; … [full → topics/tracker-archive.md] |
| Function exceeding 30-line limit in Server Action file | 3 | 2026-04-10 | RULE CANDIDATE (count 3) → code-style.md §3 — extract row-transform/business logic as named `mapXxxRow()` helper; … [full → topics/tracker-archive.md] |
| ZodError escaping Server Action via parse() without try/catch or safeParse | 2 | 2026-03-26 | RULE CANDIDATE → code-style.md — use `Schema.safeParse()` (or wrap `.parse()` in try/catch); … [full → topics/tracker-archive.md] |
| Hardcoded constant values in tests instead of importing source constants | 3 | 2026-05-29 | RULE CANDIDATE → test-writer/MEMORY.md — import production constants, never duplicate literal values that drift on rename; … [full → topics/tracker-archive.md] |
| CodeRabbit false-positive rate elevated on exam-mode PRs | 2 | 2026-04-14 | RULE CANDIDATE → .coderabbit.yaml — CR lacks project context (hard-delete exceptions, DB-level constraints); … [full → topics/tracker-archive.md] |
| Manual-eval bug invisible to unit tests (dual-source UI only in full app) | 2 | 2026-04-28 | RULE CANDIDATE → code-style.md §7 (extends Refresh/Reload) — dual server+client surfaces need an integration/E2E test; … [full → topics/tracker-archive.md] |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (promotion deferred — same file/migration) — payloads.ts notes drift after guard change; … [full → topics/tracker-archive.md] |
| Server Action ERROR_MESSAGES not synced with new RPC `RAISE EXCEPTION` literals | 2 | 2026-05-07 | RULE CANDIDATE (held for 3rd in different RPC/Action family); … [full → topics/tracker-archive.md] |
| Red-team spec-count prose drift across multiple doc surfaces (tech.md ×N + decisions.md) | 4 | 2026-06-14 | RULE CANDIDATE — numeric red-team spec counts go stale on every spec-addition batch; … [full → topics/tracker-archive.md] |
| Spec-doc literal counts drifting from distinct-count implementations | 2 | 2026-05-31 | RULE CANDIDATE — #673 fixtures return distinct-question count, yet spec claimed fixed literals; … [full → topics/tracker-archive.md] |
| Red-team RLS error-code assertions pinned to 42501 (instead of generic error non-null) | 2 | 2026-06-04 | RULE CANDIDATE (count 2) — orchestrator DEFERRED hard-rule promotion 2026-06-04. … [full → topics/tracker-archive.md] |
| CR-local false positives on Postgres CREATE OR REPLACE migration chain | 2 | 2026-06-05 | RULE CANDIDATE → agent-coderabbit-local.md — CR reads one mig in isolation, misses forward chain. … [full → topics/tracker-archive.md] |
| Doc residual-vector claims missing DB-level constraint that exists (symmetric drift) | 2 | 2026-06-05 | RULE CANDIDATE — grep migrations for unique constraints before asserting absence in known-gap vector doc. … [full → topics/tracker-archive.md] |
| Migration added to packages/db/migrations but not supabase/migrations (or vice versa) | 2 | 2026-06-05 | RULE CANDIDATE — mig 084 shipped to packages/db only; already in supabase/migrations same cycle. … [full → topics/tracker-archive.md] |
| ON CONFLICT clause with no supporting UNIQUE constraint (dead code or 42P10 at execution) | 2 | 2026-06-06 | RULE CANDIDATE — (1) student_responses a09c6be: ON CONFLICT silently ignored (non-unique index); … [full → topics/tracker-archive.md] |
| plpgsql function body contains deferred-validation SQL (clean migration apply ≠ execution correctness) | 2 | 2026-06-10 | RULE CANDIDATE — (1) mig 085 ON CONFLICT non-unique → 42P10; (2) mig 101 POSIX regex bracket-class → 2201B. … [full → topics/tracker-archive.md] |
| Semantic reviewer stale-baseline false positive (compared wrong predecessor migration/definition) | 2 | 2026-06-06 | RULE CANDIDATE — reviewer compared against wrong migration; … [full → topics/tracker-archive.md] |
| Stale local Supabase volume / in-place migration edit causing local e2e failures | 2 | 2026-06-10 | RULE CANDIDATE — `supabase db reset` fixes both — but wipes E2E seed; re-run `seed-e2e.ts` after. … [full → topics/tracker-archive.md] |
| Haiku code-reviewer false positives on Playwright E2E spec complexity (#611 cycle) | 2 | 2026-06-05 | RULE CANDIDATE (elevated FP rate on E2E scope); … [full → topics/tracker-archive.md] |
| Query helper promoted to throw on error, but SA caller missing catch boundary | 2 | 2026-06-01 | RULE CANDIDATE — #627 (c26ef61f + b7cf6852): throw-posture sweep missed SA callers. … [full → topics/tracker-archive.md] |
| Red-team spec field-type assertion without nullability check across RPC modes | 2 | 2026-06-06 | RULE CANDIDATE — agent assumes RPC field type/shape without reading the migration; … [full → topics/tracker-archive.md] |
| Red-team RPC output-contract assertions under-asserted (positive paths assert existence but not field values) | 4 | 2026-06-13 | RULE CANDIDATE (count 4 — codified via PR-G/#742 §7 "RPC Output Contract") — #736, #557, PR-A #256/#257, #818. … [full → topics/tracker-archive.md] |
| Shared test-infra helpers (setup.ts, helpers/*.ts) exceed 200-line utility cap (wrongly under .test.ts exemption) | 2 | 2026-06-06 | RULE CANDIDATE — setup.ts/helpers/*.ts are utility files (200-line cap), not test files (500-line exemption). … [full → topics/tracker-archive.md] |
| Red-team spec self-labels vector mnemonic colliding with existing matrix ID | 3 | 2026-06-09 | RULE CANDIDATE (count 3) — ID collision ×3: #793, #802, #326. Root: not reading WORKING-TREE master before allocating. … [full → topics/tracker-archive.md] |
| Test cleanup: throw inside finally block / multi-block afterAll without error accumulator (noUnsafeFinally) | 3 | 2026-06-14 | PROMOTED → code-style.md §7 "Multi-Step Cleanup Needs a Per-Step Error Accumulator" (#794). The accumulator half is now a hard rule; the throw-in-finally half stays Biome-enforced (noUnsafeFinally), not duplicated. Sweep done: 4 e2e offenders fixed (consent/exam-recovery/settings/exam-config-reactivation-guard); 3 already compliant. (1) 64339b28; (2) 4f918ded; (3) 13fa0249. … [full → topics/tracker-archive.md] |
| Integration-test count in plan.md goes stale on each test-adding commit | 4 | 2026-06-11 | RULE CANDIDATE (count 4) — (1) 115→121; (2) 121→125; (3) 125→127; (4) 127→136 (#833/#840 cycle): impl-critic used static `grep 'it('` count (121) as baseline instead of vitest runtime count (144 after +8), generating a false ISSUE. Root: static grep is not the count convention; vitest runtime is authoritative. False-positive logged to archive. Update plan.md count in the same commit as the test files. … [full → topics/tracker-archive.md] |
| Identical type union declared in N Server Action files instead of extracted to lib/ | 2 | 2026-06-07 | WATCHING (count 2) — QuestionFilter + ActionResult both required retroactive sweeps. On 3rd: propose code-style.md §4 rule. … [full → topics/tracker-archive.md] |
| CR local suggests wrong fix rejected on a documented architectural decision | 2 | 2026-06-10 | RULE CANDIDATE — (1) VFR RT Phase A: CR suggested question-level correct_count, contradicts row-level decision; (2) #838 cycle: same suggestion re-raised. On 3rd: propose .coderabbit.yaml path-scope context note. … [full → topics/tracker-archive.md] |
| Test-writer agent generates cleanup/restore mutation without `{ error }` destructure | 2 | 2026-06-10 | RULE CANDIDATE — (1) 13fa0249; (2) 50c81b94 (#838). Finally-block cleanup path not covered by §5 in agent-generated code. Propose note to test-writer/MEMORY.md. … [full → topics/tracker-archive.md] |
| `as unknown as T` cast without runtime guard in test helper / integration test (§5) | 2 | 2026-06-13 | RULE CANDIDATE — (1) #818 `expectWithinTimeSubmitContract` helper (impl-critic); (2) #845 `AnswerRow[]` cast in integration test (semantic-reviewer). §5 rule already mandates guard pairing but test files treated as exempt. Propose note to code-style.md §5: "§5 cast-guard applies equally to test helpers and integration test assertions — test files are not exempt." … [full → topics/tracker-archive.md] |

## Count=1 WATCHING rows

All count=1 WATCHING rows live in `topics/tracker-archive.md` only (moved 2026-06-10 to respect the count≥2 live-table spec). New WATCHING rows added this cycle (#851):
- Shell script parsing LLM output for a gate decision via exact-string match — fails open on prose-wrapped token (#832, f7ec4a11; fail-closed parse_verdict fix). Full row in archive.
- CLAUDE.md QA-pipeline section claims pre-commit runs unit tests; lefthook.yml has unit-test step intentionally commented out (#833/#840 cycle). Full row in archive.
- Blueprint RPC `STABLE`/`VOLATILE` annotation carried verbatim into cloned variant without verifying correctness for the new RPC's semantics (#833/#840 cycle: ORDER BY random() annotated STABLE from 099b). Full row in archive.
- Newly-published transitive-dep advisory causes `pnpm audit --audit-level=high` pre-push hook to block all pushes mid-run; fix = bounded pnpm override pin mirroring existing pattern (chore/esbuild-0281-audit-fix, f02a3a87). Full row in archive.
- Stale in-file spec file-header test-count after adding a test case to an existing spec (#851, 680c77e4). Full row in archive.
New WATCHING rows added this cycle (#842):
- Race/concurrency test accesses `data?.[0]` without prior `toHaveLength` guard — opaque failure on regression (#842, b8109233; semantic-reviewer ISSUE). Full row in archive. Distinct from TS2532 array-index pattern (archive rows 163/269).
- attack-surface.md gap-row Notes stale after gap closed by test in a different PR (#842; red-team caught in same cycle, fix applied in-commit). Full row in archive.
New WATCHING rows added this cycle (#825):
- Sub-vector prefix collision — new sub-vector group (DQ1/DQ2/DQ3) reused a 2-letter prefix (DB) already allocated to a different far-away vector; impl-critic caught it; fix: rename to DR1/DR2/DR3. Distinct from the live-table "max-ID" allocation rule (that guards sequential new-ID allocation; this guards 2-letter prefix reuse when labeling sub-vectors under an existing parent). Full row in archive.
New WATCHING rows added this cycle (#849):
- Plan cites superseded RLS policy (DROP POLICY + CREATE POLICY chain not traced forward) — plan-critic caught orchestrator citing mig 043 USING clause; binding policy is mig 050. Full row in archive.
- Asymmetric afterAll guard variable initialization (victimUserId lacking '' initializer vs attackerUserId = '') — semantic-reviewer ISSUE; undefined filter in cleanup on beforeAll failure. Full row in archive.
New WATCHING rows added this cycle (#844):
- Single-concern sequential DB-seed/infra helpers (no branching logic, sequential awaits only) exceeding the 30-line function cap — code-reviewer flagged 4 helpers in vfr-rt-helpers.ts (33/32/35/33L) as WARNING (non-blocking). code-reviewer classified all as structurally equivalent to the known-structural E2E infra exception (helpers/cleanup.ts cleanupFixtures 137L; helpers/audit-helpers.ts buildAnswersForSession 46L). code-reviewer's own "Utility function > 30 lines" row is now count=3, WATCHING. Full row in archive.
New WATCHING rows added this cycle (#818):
- `as unknown as T` cast without runtime guard in test contract helper (impl-critic §5 catch, `expectWithinTimeSubmitContract` — applied typeof/Array.isArray guard). **PROMOTED to live table at count=2 (#845 cycle).** Full row in archive.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Doc migration-range footer literal stale across multiple doc surfaces | 1 | 2026-06-10 | WATCHING — #838 cycle: database.md footer 094–103→094–104 (round 1), decisions.md same drift (round 2). Two doc surfaces, one PR = 1 occurrence. On 2nd (different PR): propose doc-updater note to grep migration-range footer literals when adding a migration. … [full → topics/tracker-archive.md] |
| Mode/role whitelist evaluated mechanically without checking admitted values vs. output sensitivity | 1 | 2026-06-10 | WATCHING — fce9a871: internal agents verified whitelist rejects vfr_rt (correct) but not whether admitted exam modes are compatible with is_correct/correct_option_id output. Cloud CR caught the answer-oracle gap. On 2nd: propose semantic-reviewer note — check each admitted value against RPC output sensitivity. … [full → topics/tracker-archive.md] |
| Mechanism-pin suggestion applied then reversed next cycle (premature pin churn) | 1 | 2026-06-10 | WATCHING — fce9a871: actor_role assertion pinned at CR suggestion, reverted one cycle later when explicit gate landed. Single occurrence; no prevention signal visible at pin time. On 2nd: look for mechanism change pending in same session. … [full → topics/tracker-archive.md] |
| Stale in-file spec file-header test-count after adding a test case | 1 | 2026-06-13 | WATCHING — #851, 680c77e4: rpc-cross-tenant-isolation.spec.ts header had `// 13 tests`; adding Vector DX left it stale at 13→14; caught by PR-level semantic sweep (not per-commit doc-updater). Distinct from "Red-team spec-count prose drift" (that rule covers external doc surfaces: tech.md, decisions.md). This is an in-file `//N tests` header comment in the spec itself. On 2nd (different spec file or PR): propose adding to agent-doc-updater.md or code-style.md §7 — "when adding a test case to a spec with a file-header test-count comment, update the count in the same commit." … [full → topics/tracker-archive.md] |
| Plan cites superseded RLS policy (DROP POLICY + CREATE POLICY chain not traced forward) | 1 | 2026-06-13 | WATCHING — #849: plan cited flagged_questions USING clause from mig 043; binding policy is mig 050 (drops 043 policy, ownership-only, no deleted_at filter). plan-critic caught it. Same family as "trace the chain to latest" but this is the orchestrator's own plan, not a reviewer FP. On 2nd: propose agent-workflow.md plan-validation impact-analysis note. … [full → topics/tracker-archive.md] |
| Asymmetric afterAll guard variable initialization (victim var lacks '' initializer) | 1 | 2026-06-13 | WATCHING — #849 6e258f6a: victimUserId declared without '' init; attackerUserId = '' had one. If beforeAll fails, afterAll soft-delete WHERE sees undefined. Semantic-reviewer ISSUE. On 2nd (different spec): propose code-style.md §7 E2E Hermiticity note — sentinel vars must be initialized to '' or null. … [full → topics/tracker-archive.md] |

## Durable knowledge (cross-agent)

- This agent does cross-agent synthesis + owns **false-positive frequency tracking** — see `topics/cross-agent-lessons.md` for the FP catalog and the full rule-promotion record.
- A count reaches promotion threshold at **2 distinct mechanisms** across different commits; same-file/same-migration repeats are NOT distinct (several count=2 rows above are held below promotion for this reason — noted inline).
- On any rule promotion, schedule the **Sweep-On-Rule-Promotion** (`agent-learner.md`): fix or file issues for ALL existing offenders, not just the triggering sites (lesson from issue #573).
- The biggest recurring defect class is **partial fix to a sibling-file group** (tracker count 9) — always grep all instances of a pattern in the file AND sibling files before committing.
- *(Other bullets relocated to `topics/cross-agent-lessons.md` § Durable knowledge relocated 2026-06-07.)*

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — durable rule-promotion record, false-positive catalog, recurring meta-lessons.
- [tracker-archive](topics/tracker-archive.md) — full tracker record; original journal at git `2e87c3e6`. **Before adding a NEW row, grep this file first — if it exists, increment it and lift to live table.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — Server Actions must catch now-throwing query helpers at the client boundary; throw-posture safe for Server Components but crosses unsafe RPC boundary when SA returns output to client.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — two valid test forms (real helper + mocked queries, vs. helper as dependency mock) for caller-level page-error recovery; promoted to code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — SECURITY INVOKER functions on RLS-protected tables return `error: null + data: []` on unauth calls (RLS gatekeeper, not GRANT denial); impl-critic false-positive suppression pattern.
