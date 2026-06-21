# PLAN — #925 Phase 4 (rule + policy + docs promotion)

Branch `feat/925-phase4-rules-docs` off master @ `248820da` (Phase 3 merged). Pure docs + rules + coderabbit-sync — **no code-behavior change, no migration, no UI** → `/automerge`-eligible (no manual eval).

> **Provenance note:** branch-local commit hashes cited below (`21d86dc5`, `4e462cf0`, `ba6a378e`, `2aaf5a03`, `03cb2fa7`) are **pre-squash** and unreachable on a fresh clone — they were squashed into PR #927 (`fb2921c6`) / PR #930 (`f4c76c83`). The **binding rule text in `code-style.md` cites the reachable squash commits**, not these. The hashes are retained here only as the working-record breakdown of the cross-commit basis.

## Objective
Promote the integration-tier learnings from Phases 0–3 into binding rules + project docs, so the patterns are enforced going forward and the architecture is recorded.

## Sweep results (Explore, 2026-06-21)
- **§7 non-vacuous assertions sweep — 0 offenders.** The 2 candidate negative assertions (`quiz-report-questions.integration.test.ts:157`, `reports.integration.test.ts:159`) both have proper preconditions. Rule added; files already clean (positive signal).
- **§5 cast-in-tests sweep — ~48 unguarded `as unknown as T` casts** on RPC results across the `packages/db/src/__integration__/rpc-*.integration.test.ts` suites. The Explore pass named 6 files; a fresh `grep -l 'as unknown as'` finds **9 candidate files** (adds `rpc-start-session`, `rpc-vfr-rt-constraint-regression`, `trigger-stamp-last-active`). **DEFERRED to one tracking issue** (Apply-vs-Defer: ≥30 LOC + separate concern [packages/db test-hardening] + design decision [shared `assertRow` helper vs ~48 inline guards]). **The deferred issue instructs a FRESH repo-wide sweep of every `*.integration.test.ts` (candidate set = the 9 grep hits, verify each), NOT a frozen 6-file list** — freezing the list is the exact `agent-learner.md § Sweep On Rule Promotion` failure mode (rule enforced on new code while 2 files silently linger). Rule lands now; offenders tracked (satisfies "GitHub Issues for each remaining offender").

## Files to change

### Rules (commit C1 — triggers coderabbit-sync + learner)
1. **`.claude/rules/code-style.md` §5** — add TWO notes:
   - **(a) Soft-delete filter requires the column to exist** (promote the Phase-3 mechanical guard to a written rule). Names the 7 no-soft-delete tables; points to `.claude/hooks/check-soft-delete-guard.mjs`; cites the RT origin bug (#925) + the schema-aware successor (#933).
   - **(b) Cast-guard applies to test files too** (learner **count=4** — tracker MEMORY.md:59 — #818 red-team helper + #845 + `03cb2fa7` + PR #930 [squash `f4c76c83`]): an unguarded `data as unknown as T` on an RPC/query result is not exempt in `.test.ts`/`.integration.test.ts` — it throws an opaque `TypeError` on a null/shape regression instead of a clean assertion failure. Guard (`expect(data).not.toBeNull()` then cast, or `Array.isArray`/`typeof` before use). Note the existing-offender sweep is tracked in the new issue.
2. **`.claude/rules/code-style.md` §7** — add TWO rules:
   - **(c) New Supabase query sites require an integration test (HARD)**: every NEW `.from()`/`.rpc()` site in **app-layer code** (`apps/web/lib/queries/**`, `apps/web/app/**` Server Actions) ships a co-located `*.integration.test.ts` against real Postgres (the tier). **Scope qualifier MUST stay explicit — this is about app-layer query code, NOT `packages/db` migration/RPC-definition PRs** (those have their own `__integration__` suite + migration tests; don't let this rule be mis-cited to block a migration PR). Applies to NEW code; ~40 pre-existing uncovered app-layer sites tracked as #926 backlog.
   - **(d) Integration-test negative assertions must be reachable** (learner **count=2, cross-commit** — Phase-1 **Commit 1** `21d86dc5`(+fix `4e462cf0`): two sub-mechanisms A+B; and **Commit 2** `ba6a378e`(+fix `2aaf5a03`): git-verified 2nd occurrence — added the both-perspective non-vacuous fix "A and B answer the same 3 questions… asserting === 2 catches it". The archive detail row `tracker-archive.md:~419` is STALE — narrates only Commit 1 + says "on 2nd occurrence promote"; **UPDATE it to record the Commit-2 occurrence + PROMOTED → §7 status** as part of the learner step, so the cross-commit basis is auditable): the 3 failure modes (RLS-already-enforces → use service-role to test helper logic; shared `beforeAll` → assert both actor+victim perspective; DISTINCT-aggregate cap → verify the leaked value is distinguishable). Note the #925 sweep found the files clean.
3. **`.claude/rules/agent-red-team.md`** — add a one-line cross-ref under the existing "read the migration before writing a column filter" DO: the soft-delete column guard (code-style.md §5 / `.claude/hooks/check-soft-delete-guard.mjs`) mechanically blocks `.is('deleted_at')` on the no-soft-delete tables in PRODUCTION code (spec files are not covered — still read the migration).

### Docs (commit C2)
4. **`docs/decisions.md`** — append **Decision 46** (app-layer DB integration tier + mechanical guards) after the Decision 45 block, before the footer; update the footer "Last updated" line to lead with Decision 46.
5. **`docs/plan.md`** — insert the new `## App-Layer DB Integration Tier (#925) — 2026-06-21` section **immediately after the head `---` (the divider closing the title/intro block, ~line 6), as the first `##` content section** (most-recent-first ordering) — i.e. directly above the current first `## ...` heading ("Quiz Question Filtering — Image-Presence Filter", ~line 8). (Ignore the later `---` dividers at ~line 24/40 — those are between existing sections, NOT the insertion point.) Summarize Phases 0–4 (harness, read+mutation coverage, mechanical guards, rule promotion), follow-ups (#926/#933 + the new §5-sweep issue). Update the head "Last updated" line. **Do NOT bump the packages/db integration-test count literal** (separate suite; per agent-doc-updater.md).
6. **`.spec-workflow/steering/tech.md`** (use TEXTUAL anchors, not line numbers — A/B disagreed on exact lines, the text is unique): (i) the **Unit/integration** bullet (`- **Unit/integration**: Vitest with v8 coverage provider. 2000+ tests across 165+ files. Co-located ...`) has no mention of the integration tier (the drift) — append the second tier: `apps/web/vitest.integration.config.ts` / `*.integration.test.ts` runs real app-layer query code vs real local Postgres under RLS (#925). (ii) Fix the stale **`Biome v2.4.16`** → `v2.5.0` (in-file accuracy; biome.json $schema + package.json `^2.5.0` confirm). **Steering edit** — under `/automerge` autonomy the orchestrator applies it (the goal is the approval); **PR body MUST flag BOTH edits** (i)+(ii) per agent-doc-updater.md steering-approval note.

### coderabbit-sync (commit C3 — conditional)
7. After C1, run the **coderabbit-sync agent**. `.coderabbit.yaml` `path_instructions` mirror code-style.md. If the agent finds the new §5/§7 notes warrant a mirrored instruction (e.g. a soft-delete-column-guard line, or cast-in-tests), apply the agent's reviewed diff as C3. No-op is an acceptable outcome (report it).

### Deferral + finalize
8. **File the §5-sweep tracking issue** — P2/M, `tech-debt`, on board. Body: instruct a FRESH repo-wide sweep of every `*.integration.test.ts` (candidate set = the 9 `grep -l 'as unknown as'` hits under `packages/db/src/__integration__/`, verify each) + acceptance (shared `assertRow` guard helper or inline `Array.isArray`/`expect(data).not.toBeNull()` guards) + source link. **Note in the body:** the 25 `apps/web` unit `.test.ts(x)` files that contain `as unknown as` are **mock-shape casts (exempt), not RPC/query-result casts** — `apps/web` integration tests carry ZERO such casts (positive signal); the sweep targets RPC/query-result casts in the `packages/db` integration suite. (Covers stability-round-A suggestion so a future reader doesn't think the sweep silently scoped out a real offender.)
9. **Finalize the spec** — update HANDOVER.md (Phase 4 DONE / epic #925 closeable), mark this the terminal phase. (HANDOVER is gitignored — local only.)

## Commit structure
- **C1** `docs(925): promote integration-tier rules — code-style §5/§7 + red-team cross-ref`
- **C2** `docs(925): Decision 46 + plan.md integration-tier section + steering tech.md tier`
- **C3** `chore(925): sync .coderabbit.yaml with promoted rules` (only if coderabbit-sync finds drift)

impl-critic before each commit; full post-commit fleet after each; coderabbit-sync after C1; learner after the cycle.

## Validation
- **Impact:** code-style.md / agent-red-team.md are read by the code-reviewer/red-team agents + CodeRabbit (`.coderabbit.yaml` mirror) — C3 keeps them in sync. Docs are read-only references; no code imports them.
- **Contracts:** no test asserts on these doc/rule files. No code/type/schema contract touched.
- **Patterns:** Decision block mirrors the Decision 45 shape (Date/Context/Decision/Rationale/Scope); plan.md section mirrors the existing phase-section shape; §5/§7 notes mirror existing rule-note prose (bold lead + rationale + precedent count).
- **Docs/schema:** Decision 46 = next number (45 is latest, verified). Footer + head timestamps updated. No database.md change (no schema/RPC change).
- **Security:** none of the touched files is in the security-path trigger set (no migrations, `packages/db/src`, quiz actions, auth, `proxy.ts`, `docs/security.md`). NOT security-path → plan-critic floor **N=2**. Rule promotion is high-stakes → **Opus** critics.

## Risks
- **R1 (rule wording drift from CodeRabbit):** code-style.md and `.coderabbit.yaml` could diverge → C3 coderabbit-sync closes it; CR-local will also flag a mismatch.
- **R2 (steering approval):** tech.md is a steering doc normally gated by approval — applied under `/automerge` autonomy. **PR body MUST explicitly flag BOTH steering edits** (no human approver fires under /automerge): (1) the Unit/integration testing bullet — add the app-layer integration tier; (2) `Biome v2.4.16 → v2.5.0` accuracy fix. So a reviewer can retroactively object to either.
- **R3 (defer-budget):** 1 new deferral (the §5 sweep). Within the 0–2 budget. Effort+priority+acceptance + offender list included so it doesn't rot.

## Out of scope (do NOT expand)
- Fixing the 48 §5 cast sites inline (→ deferred issue).
- Red-team spec-count / database.md / packages/db integration-count literals.
- The fixtures.ts split (separately tracked) and #928/#929 (TOCTOU / restoreMocks).
