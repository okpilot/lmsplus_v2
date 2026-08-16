Pre-push quality gate. Run this BEFORE pushing to catch drift, lazy triage, and missed issues.

## Self-Audit Checklist

Before doing anything else, answer these questions honestly. Do NOT skip any. Print each answer.

### Verification quality
1. **For every reviewer/agent finding this session:** Did you READ the actual source file and cross-reference tests, specs, and related files — or did you rely on labels/summaries?
2. **For every SKIP or DEFER verdict:** Can you cite the specific line numbers that support your verdict? If not, go back and verify now.
3. **Did you apply the "< 10 lines = fix now" rule** before marking anything SKIP or DEFER?

### Completeness
4. **Are there any unresolved CRITICAL, BLOCKING, or ISSUE findings** from any agent or reviewer?
5. **Did all post-commit agents run on EVERY commit in the push range** — not just on HEAD? Enumerate with `git rev-list origin/master..HEAD` and account for each one. Checking only the latest commit lets an earlier unreviewed commit through whenever HEAD happens to be clean, which is precisely how this branch reached 24 commits with post-commit agents on 2 of them. For each commit: the full four, or a named exemption. The four are code-reviewer, semantic-reviewer, doc-updater and test-writer, in parallel. The **learner** is not one of them — it runs after all four report, takes their findings as its input, and is skipped entirely on a reduced cycle; check it separately rather than as a fifth member of the set. When applicable also: red-team if the diff touches security files, coderabbit-sync if rules changed. A commit covered by one of the two exemptions in `CLAUDE.md § Post-commit review` (docs-only → doc-updater only; review-follow-up → semantic-reviewer only) satisfies this — **name the exemption and the condition that qualified it**, rather than answering a bare "yes". A commit that merely felt small does not qualify.
6. **If production code changed after initial review**, did you re-run semantic-reviewer on the fix commit?
7. **For every DEFER verdict this session:** Did you create a GitHub Issue to track it? List the issue numbers. No silent deferrals — every deferred item gets a ticket or it's not really deferred, it's forgotten.

### Docs, rules and mirrors — land them BEFORE the push, not in wrap-up
7b. **Every doc, rule and mirror update this change requires must already be committed on this
    branch.** This is a pre-push gate, not a wrap-up item. If a rule changed, its mirrors changed
    with it; if schema or an RPC changed, the docs that describe it changed too.

    Check, and fix now if any is missing:
    - `docs/` — anything the change makes inaccurate (database.md matrices, security.md rules,
      decisions.md entry for a real decision, plan.md phase/count literals).
    - `.claude/rules/*.md` — the rule text itself.
    - **The mirror set for that rule — all SEVEN.** A rule lives in more than one place and the copies
      do not auto-track: `docs/security.md`, `.claude/rules/*.md`, `.coderabbit.yaml`,
      `.claude/agents/*.md`, `.claude/commands/*.md`, `.claude/skills/*.md`, AND any other binding
      doc that re-states the mechanics rather than pointing at them — notably `docs/database.md`,
      whose §7 describes what the security-auditor flags. That last one is a CLASS, not a path — no
      grep of the six fixed paths reaches it; find it by asking "what else asserts this claim?".
      (The canonical table lives in `agent-workflow.md § Rule-Mirror Sync`; see also
      `agent-learner.md § Downstream-enforcer sync`.) **`.claude/agents/security-auditor.md` is the
      one people forget, and it is the blocking pre-push gate** — a stale checklist there emits
      false CRITICALs. **Grep is a first pass, not the sweep**: a phrase-grep cannot find a
      paraphrase, so when a change retires a *claim*, read the affected section and its mirrors
      end-to-end once.
      **This file is itself a `.claude/commands/*.md` mirror** — its own list omitted
      `.claude/commands/`, then `.claude/skills/*.md`, then `docs/database.md` across PR #1174's
      rounds 3, 4 and 5, which is exactly the drift the rule exists to catch. Each round fixed the
      instance and left the count; assume the list is still incomplete.
    - Repeated numeric literals (red-team spec count in `tech.md` ×3 + `decisions.md`; integration
      test count in `plan.md`).

    Why here and not in wrap-up: docs pushed after the fact are a second PR, a second review cycle,
    and a window where the repo documents behaviour it no longer has. The reviewers also read these
    files — on PR #1174 the two most valuable findings of the run were a self-contradicting
    security-auditor checklist and a false `WITH CHECK` claim in `docs/security.md`. Landing docs
    late means paying for those findings twice.

### Cross-file consistency (for 2+ commit branches)
8. Run `git fetch origin` (ABORT if it fails — a stale `origin/master` distorts PR scope, see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`"), then `git diff origin/master...HEAD` and review the full PR diff — not just the latest commit.
9. Check: do test assertions match production code changed in different commits?
10. Check: do doc matrices/tables match schema changes from earlier commits?
11. Check: are fallback values and error handling consistent across all commits?

## Actions

After answering the checklist:

1. **If any answer is "no"** — fix it before proceeding. Do not rationalize.
2. **Lint the whole repo (read-only)**: `pnpm lint` (this is `biome check .`). Report errors. ⚠️ Do NOT use `pnpm check` here — that is `biome check --write .`, a fixer that rewrites files repo-wide. The gate must be read-only.
3. **Run type check**: `pnpm check-types`
4. **Run the full test suite**: `pnpm --filter @repo/web test -- --run` — report pass/fail count. (Vitest runs unit AND integration locally — they mock the DB, so no Supabase instance is needed.)
5. **Build the app**: `pnpm build` (`turbo run build`). Always run it — catches RSC / Server-vs-Client boundary / static-generation errors that `tsc` misses. Turbo caches unchanged packages, so incremental builds are fast. A build failure blocks the push.
5b. **Fetch and capture the changed-path list ONCE, fail-closed.** Before the conditionals below, run:

    ```bash
    git fetch origin || { echo 'fetch failed — ABORT'; exit 1; }
    git rev-parse --verify origin/master^{commit} >/dev/null || { echo 'origin/master unresolvable — ABORT'; exit 1; }
    # FAIL CLOSED on an unclean worktree FIRST: $CHANGED is a committed-only diff, so a staged,
    # unstaged or untracked mirror edit is invisible to it and silently bypasses the 7b docs gate.
    # Capture separately: a command substitution that FAILS yields an empty string, and `set -e`
    # does not fire inside `[[ ... ]]` — so an errored `git status` would read as "clean" and pass.
    STATUS=$(git status --porcelain) || { echo 'git status failed — ABORT'; exit 1; }
    if [[ -n "$STATUS" ]]; then
      echo 'Uncommitted changes — commit docs, rules and mirrors before pushing. ABORT'; exit 1
    fi
    CHANGED=$(git diff --name-only origin/master...HEAD) || { echo 'diff failed — ABORT'; exit 1; }
    ```
    Steps 6, 7 and 7b then match against `$CHANGED` — do NOT re-run the diff per step. A guarded diff that EXITS non-zero aborts (above); a diff that succeeds with zero paths is a legitimate no-op that PROCEEDS and matches no conditional — branch on the exit code, never on emptiness (see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`"). 7b (Red Team) is MANDATORY: on a stale, unresolvable, or errored base an unguarded conditional silently evaluates false and the required gate is skipped (see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`").

6. **Migration validation (conditional)**: if `$CHANGED` (from 5b) includes `supabase/migrations/`, validate the migrations on a clean local DB before push. If a local Supabase instance is running, run `supabase db reset --no-seed` — the exact command CI's "Migration Test (clean reset)" job uses (`e2e.yml`), so local matches CI — and confirm every migration applies cleanly. If step 7/7b will run locally after this reset, re-seed first (`tsx scripts/seed-e2e.ts`, after the local grant-fix if needed) — the reset leaves the DB empty and an E2E run against it fails spuriously. If no local instance is up, do NOT silently skip — print a loud `⚠️ MIGRATIONS CHANGED — VALIDATE ON A CLEAN DB BEFORE MERGE` and tell the user (CI's migration test is otherwise the first place a bad migration surfaces).
7. **E2E (conditional)**: if `$CHANGED` (from 5b) includes `apps/web/e2e/` (excluding `redteam/`), run the web Playwright suite (`pnpm --filter @repo/web e2e`). Skip when no e2e specs changed — the full suite is slow and CI runs it on push anyway.
7b. **Red Team (MANDATORY when touched — do NOT skip)**: if `$CHANGED` (from 5b) includes `apps/web/e2e/redteam/**` (red-team spec changes) OR any security path (the canonical set from `agent-workflow.md § Red-Team Agent Trigger`: `supabase/migrations/**`, `packages/db/src/**`, `apps/web/app/app/quiz/actions/**`, `apps/web/app/auth/**`, `apps/web/proxy.ts`, `docs/security.md`), run `pnpm --filter @repo/web e2e:redteam` locally and confirm **all specs pass** before pushing. `Red Team Specs` is a **required** status check — a local failure means a blocked PR. The `e2e` script in step 7 does NOT include the `redteam` project, so this is a separate run. If the local Supabase stack is down, bring it up (`supabase start` / `npx supabase start`, re-seed via `scripts/seed-e2e.ts`, production build for the webServer) — do NOT skip with a warning and rely on review+lint+type. PR #769 shipped 2 runtime-failing red-team specs precisely because this step was skipped on the assumption that review caught runtime behavior. It does not.
8. **Show the agent findings summary table** for this session:

```
| Agent             | Severity | Count | Status   |
|-------------------|----------|-------|----------|
| code-reviewer     | ...      | ...   | fixed/clean |
| semantic-reviewer | ...      | ...   | fixed/clean |
| doc-updater       | ...      | ...   | clean    |
| test-writer       | ...      | ...   | added N  |
| learner           | ...      | ...   | done     |
```

9. **If an active spec exists**, confirm all completed tasks are checked off in `tasks.md` (`[ ]` → `[x]`). If any are missing, update before proceeding.
10. **Run CodeRabbit local pre-push review** via the `/crlocal` command. Loop and apply findings per its triage protocol until a stop condition trips. Do not skip — CR local catches things our internal agents miss (observability gaps, runtime guard omissions, cleanup ordering). Skip only if `which coderabbit` returns nothing AND tell the user to install it.
11. **Ask for explicit push approval.** Never push without it.

## What this gate does NOT cover (left to CI on purpose)

These run in CI and are intentionally not replicated locally — they are slow/infra-heavy quality gates, not "broken code" checks:
- Lighthouse performance audit (`lighthouse.yml`)
- SonarCloud + CodeQL deep static/security analysis (`sonarcloud.yml`, `codeql.yml`)
- Bundle-size regression (`bundle-size.yml`)
- Codecov patch-coverage threshold (`ci.yml`, `coverage-trend.yml`)
- Dead-code / unused-export scan (`dead-code.yml`)

The local gate ensures the code compiles, lints, type-checks, passes unit + integration tests, builds, and (when relevant) passes migrations + E2E — i.e. that it is not *broken*. The CI-only checks above track quality/perf trends and are fine to surface post-push.

## Why this exists

This command was created because Claude drifts toward lazy triage — relying on severity labels instead of reading source code, inventing justifications for SKIP/DEFER, and missing spec/test/code conflicts. This checklist forces verification before the push, not after.
