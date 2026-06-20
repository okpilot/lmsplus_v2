# PLAN — #925 Phase 3 (mechanical guards)

Branch `feat/925-phase3-mechanical-guards` off master @ `f4c76c83`. Carries 2 uncommitted learner-memory files forward (per HANDOVER).

## Objective
Two mechanical guards that make the integration-tier's two failure classes impossible to reintroduce:
- **(a) soft-delete column guard** — block `.is('deleted_at', …)` on tables with no `deleted_at` column (the original RT bug: `easa_subjects`).
- **(b) test-helpers import guard** — block PRODUCTION code from importing `@repo/db/test-helpers` (wraps the service-role key via `getAdminClient`). Convention-only; zero production importers today.

Plus two opportunistic fixes carried in the HANDOVER.

## Validation facts (verified against the tree, 2026-06-20)
- All 7 no-soft-delete tables confirmed to have **no `deleted_at`** column: `easa_subjects, easa_topics, easa_subtopics, quiz_session_answers, student_responses, audit_events, quiz_drafts` (zero `ADD COLUMN deleted_at` in migrations).
- 148 `.is('deleted_at')` usages exist in production — all on genuinely soft-deletable tables. **Guard must be chain-aware** (associate the filter with its chain's `.from('<table>')`), not a bare line grep.
- Verified **zero** current production chains pair a forbidden table with `.is('deleted_at')` → **guard starts green**. The 3 apparent hits were false positives: exam-config/queries.ts (the `deleted_at` belongs to an adjacent `exam_configs` chain, not the `easa_topics`/`easa_subtopics` chains) and a red-team spec (test file + the match was inside a comment).
- Only importer of `@repo/db/test-helpers` repo-wide: `apps/web/lib/integration-support/harness.ts:23` (legit test infra). Zero production importers.
- biome 2.5.0 binary; `noRestrictedImports` is **stable** (since 1.6.0), diagnostic category `lint/style/noRestrictedImports` → config key `linter.rules.style.noRestrictedImports`, `options.paths: { "<specifier>": "<message>" }`. Biome overrides **deep-merge** rule objects (they do NOT replace `linter.rules`) — so a narrow `noRestrictedImports: "off"` override CANNOT re-enable other relaxed rules. The existing test-override proves this (it sets only 2 keys, yet root rules still apply to tests). R3 ordering worry is therefore unfounded; only the group-name needs confirming (done: `style`), gated again by the smoke test.
- **Node floor: 20+** (`node:test` stable since v20). CI pins Node **22** (ci.yml:17, used by lint job setup-node); local is 24. Do not cite 24 as the basis.
- **`/scripts/` (root) is GITIGNORED** (`.gitignore:48`, root-anchored — does NOT match tracked `apps/web/scripts/`). A guard there can't be committed and biome won't lint it. → put the guard + test in **`.claude/hooks/`** (tracked; home of the `run-security-auditor.sh`+`.test.sh` precedent; biome WILL lint a `.mjs` there, so it must pass biome: single quotes, no semicolons, no `any`, `useConst`, no unused imports).
- lefthook pre-commit uses `glob:` + `run:` with `{staged_files}`; ci.yml `lint` job runs `pnpm lint` then `bash .claude/hooks/run-security-auditor.test.sh` (line 42) — the model for a guard + its standalone test in CI.
- fixtures.ts is 198/200 lines, **no clean split seam** (all 3 exports are coupled session seeders). Phase 3 adds **0 lines** to it → split is premature; **defer**.

## Files to change

### (a) Soft-delete column guard
1. **`.claude/hooks/check-soft-delete-guard.mjs`** (NEW, Node ESM — tracked path, NOT root `scripts/`)
   - Const `NO_SOFT_DELETE_TABLES` = the 7 tables.
   - Export a pure `analyze(source) → violations[]` (so the test imports it); the CLI wraps it over files.
   - With file-path args → scan those (lefthook staged mode), **skipping any path that doesn't exist on disk** (deleted/renamed staged files → ENOENT-tolerant via `fs.existsSync`); no args → scan default globs `apps/web/**/*.{ts,tsx}` + `packages/db/src/**/*.ts`, excluding `*.test.ts(x)`, `*.integration.test.ts`, `__integration__/`, `e2e/`, `lib/integration-support/`, **`scripts/` and `apps/web/scripts/`** (operational/seed scripts — not production query code; green there is by adjacency luck per correctness-critic ISSUE), `node_modules`, `.next`.
   - Per file: strip `//` line and `/* */` block comments (do NOT strip inside string literals — guard against a `//` or `deleted_at` appearing inside a quoted string/URL/regex); split into call chains (terminate a chain at `;`, a statement/array-element boundary, or the next `.from(`/`.rpc(`); for each chain containing `.from('<forbidden>')` (or `"`), flag if the same chain also contains `.is('deleted_at'` / `.is("deleted_at"`.
   - On violations: print `file:line  — <table> has no deleted_at column; remove the soft-delete filter` for each, exit 1. Clean → exit 0 with a one-line OK.
   - **Must pass biome** (single quotes, no semicolons, no `any`, `useConst`, no unused imports) — it will be linted at this tracked path.
2. **`.claude/hooks/check-soft-delete-guard.test.mjs`** (NEW, `node:test`; run via `node --test`)
   - Cases (inline-string analysis via the exported `analyze(content)`):
     - forbidden table + `.is('deleted_at')` same chain → 1 violation
     - forbidden table, no deleted_at → 0
     - soft-deletable table (`users`) + deleted_at → 0
     - **exam-config false-positive shape**: forbidden `.from` chain ending in `.order(...)`, then a separate `exam_configs` chain with `.is('deleted_at')` → 0
     - **GDPR adjacency shape**: multiple `.from()` in a `Promise.all([...])` array, one of them a soft-deletable table with `.is('deleted_at')`, a forbidden one without → 0 (empirically the harder adjacency the correctness critic verified)
     - multi-line forbidden chain with deleted_at → 1
     - deleted_at inside a `//` comment on a forbidden-table file → 0
     - `deleted_at` / `.from('audit_events')` inside a string literal (not a call) → 0
     - (as-built additions, commit 440b7581) `/* */` block-comment stripping ×2; `.rpc(` chain boundary; `;` statement separator → 0 each
   - **Dropped during implementation:** the originally-listed "reverse order (`.is('deleted_at')` before `.from()`)" case — the Supabase JS builder always calls `.from()`/`.rpc()` FIRST, so `.is()` cannot precede `.from()`; testing it would force a contradictory heuristic. As-built suite = 14 cases.
   - Document the known limitation: a table name held in a **variable** (`.from(tbl)`) is not matched (string-literal only) — acceptable for a mechanical guard; the Phase-4 schema-aware successor covers it.

### (b) test-helpers import guard
3. **`biome.json`** — add to `linter.rules.style`:
   ```json
   "noRestrictedImports": {
     "level": "error",
     "options": { "paths": { "@repo/db/test-helpers": "test-helpers wraps the service-role key (getAdminClient). Import only from integration tests or lib/integration-support/**." } }
   }
   ```
   Add an override exempting the allowed globs (turn the rule off there):
   `**/*.test.ts`, `**/*.test.tsx`, `**/*.integration.test.ts`, `**/lib/integration-support/**`, `**/e2e/**`, `**/__integration__/**`.
   (Existing test-file override already relaxes other rules — extend/parallel it; verify override ordering so the OFF wins for those globs.)
   - **Smoke test (execution gate):** temporarily add `import { getAdminClient } from '@repo/db/test-helpers'` to a production file (e.g. `apps/web/lib/queries/profile.ts`) → `pnpm lint` must flag it; `harness.ts` must NOT be flagged. Revert the temp import.
   - **Fallback** (only if biome 2.5 can't express the per-glob exemption): fold the production-import check into the guard script from (a) (it already classifies production vs test/infra paths). Decide during execution from the smoke test.

### Wiring
4. **`lefthook.yml`** — add a pre-commit parallel command (`glob` makes lefthook skip it when no ts files are staged, so the no-arg whole-tree branch is never reached from lefthook):
   ```yaml
   soft-delete-guard:
     glob: "*.{ts,tsx}"
     run: node .claude/hooks/check-soft-delete-guard.mjs {staged_files}
   ```
5. **`.github/workflows/ci.yml`** — in the `lint` job, after the security-auditor test step (line 42; job already checks out + sets up Node 22 before it), add:
   ```yaml
   - name: Soft-delete column guard
     run: node .claude/hooks/check-soft-delete-guard.mjs
   - name: Soft-delete column guard — unit test
     run: node --test .claude/hooks/check-soft-delete-guard.test.mjs
   ```

### Opportunistic (HANDOVER)
6. **`apps/web/lib/integration-support/fixtures.ts`** — `throw new Error(...)` → `throw new TypeError(...)` at **line 155** (Sonar MINOR, `typeof sessionId !== 'string'` guard) **and line 112** (sibling `typeof`/row-shape guard, same class — fix together for consistency). The other 5 throws stay `Error` (RPC/value/range errors).
7. **DEFER the fixtures.ts split** — no clean seam, file not growing in Phase 3. Track: split when #926 backfill pushes it past 200 with genuinely distinct seeders.

### Memory carry-forward
8. Commit the 2 uncommitted learner-memory files (`.claude/agent-memory/learner/MEMORY.md`, `topics/tracker-archive.md`) as the first `chore(agent-memory)` commit. Do not discard.

## Commit structure
- **C1** `chore(agent-memory): carry forward learner Phase 2 tracker updates`
- **C2** `test(925): soft-delete column guard + block test-helpers prod import` (parts a + b — cohesive "mechanical guards"; script + test + lefthook + ci + biome)
- **C3** `fix(925): use TypeError for fixtures.ts type-guard throws (Sonar)`

impl-critic before each commit; full post-commit fleet after each.

## Follow-up issue to file (HANDOVER)
- Schema-aware (full-column-existence) guard: generalize beyond the hardcoded 7-table allowlist to read the live schema and flag `.is('<col>')` on any table lacking `<col>`. P2/M. Source: this Phase 3.

## Affected / callers / tests
- No production code imports the guard or changes behavior. fixtures.ts importers (9 integration tests) unaffected by `Error`→`TypeError` (they don't assert the throw type).
- biome change affects lint only; smoke-tested.
- Phase 4 (later) promotes the column-existence rule to `code-style.md §5` + the HARD policy + docs + coderabbit-sync — NOT in this phase.

## Risks
- **R1 (guard false-negative):** chain-splitting heuristic could miss an obfuscated chain. Mitigation: keep the chain terminator conservative; the 7-table set is the known-dangerous surface; Phase-4 schema-aware guard is the durable successor. Acceptable for a mechanical pre-commit guard.
- **R2 (guard false-positive):** flagging a legit `exam_configs`-style adjacent chain. Mitigation: the dedicated test case for that exact shape + verified-green on the full tree before commit.
- **R3 (biome exemption):** per-glob OFF override may not win. Mitigation: smoke test gate + script fallback.
- **R4 (path set):** Phase-3 is NOT in the security-path trigger set (no migrations/db-src/quiz-actions/auth/proxy/security.md) → normal change, plan-critic floor N=2. But the guard is the load-bearing point of the tier → run critics on **Opus**.

## Security surface
- The guard *strengthens* security (blocks service-role-key import + a schema class of bug). No auth/RLS/answer-exposure code changes. biome change is lint-only.
