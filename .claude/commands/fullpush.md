Pre-push quality gate. Run this BEFORE pushing to catch drift, lazy triage, and missed issues.

## Self-Audit Checklist

Before doing anything else, answer these questions honestly. Do NOT skip any. Print each answer.

### Verification quality
1. **For every reviewer/agent finding this session:** Did you READ the actual source file and cross-reference tests, specs, and related files — or did you rely on labels/summaries?
2. **For every SKIP or DEFER verdict:** Can you cite the specific line numbers that support your verdict? If not, go back and verify now.
3. **Did you apply the "< 10 lines = fix now" rule** before marking anything SKIP or DEFER?

### Completeness
4. **Are there any unresolved CRITICAL, BLOCKING, or ISSUE findings** from any agent or reviewer?
5. **Did all post-commit agents run on EVERY commit in the push range** — not just on HEAD? Enumerate with `git fetch origin` (ABORT if it fails) then `git rev-list origin/master..HEAD`, and account for each one. The fetch is not optional: `origin/master` is itself a local ref that only advances on fetch, so a stale one sits further back and admits commits this branch never authored — see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`". Checking only the latest commit lets an earlier unreviewed commit through whenever HEAD happens to be clean, which is precisely how this branch reached 24 commits with post-commit agents on 2 of them. For each commit: the full four, or a named exemption. The four are code-reviewer, semantic-reviewer, doc-updater and test-writer, in parallel. The **learner** is not one of them — it runs after all four report, takes their findings as its input, and is skipped entirely on a reduced cycle; check it separately rather than as a fifth member of the set. When applicable also: red-team if the diff touches security files, coderabbit-sync if rules changed. A commit covered by a NAMED exemption in `CLAUDE.md § Post-commit review` (docs-only → doc-updater; review-follow-up → semantic-reviewer) satisfies this — **name the exemption and the condition that qualified it**, rather than answering a bare "yes". A commit that merely felt small does not qualify.
6. **If production code changed after initial review**, did the fix commit get its own review — the FULL four, or `semantic-reviewer` alone only when it qualifies as a review-follow-up under `CLAUDE.md § Post-commit review` (its parent ran the full cycle and claimed no exemption, every hunk traces to that cycle's findings, same files, no new file, within the line bounds, no security path / rules file / migration / CI / hook / config)? Name the path taken. Re-run the conditionals too when their trigger paths are in the fix: red-team, coderabbit-sync.
7. **For every DEFER verdict this session:** Did you create a GitHub Issue to track it? List the issue numbers. No silent deferrals — every deferred item gets a ticket or it's not really deferred, it's forgotten.
7a. **Defer budgets — TWO checks, and step 7 is neither of them.** Step 7 is the per-item test;
    these are the two once-before-push budgets from `agent-workflow.md § Apply-vs-Defer Discipline`,
    and a PR must clear both.
    - **Volume:** 0-2 deferrals is the budget. 3+ does not fail automatically, but every survivor
      must be re-triaged and named here.
    - **Ratio:** count the issues this PR CLOSES (its `Closes #N` / `Fixes #N` keywords) and the
      issues it FILED — every issue the branch author created after the merge-base (that scope is
      what the `author:@me` below encodes), whatever its origin, listed in the PR body's
      `## Deferred` section, which must name every one. On a FIRST push there is no PR yet, so the
      list is the `## Deferred` section of the body you are about to open the PR with. Enumerate with the merge-base TIMESTAMP, never its date:
      `gh issue list --state open --limit 200 --search "author:@me created:>=$(git log -1 --format=%cI $(git merge-base origin/master HEAD))"` — `--limit 200` because `gh` defaults to 30 and truncates at exit 0, which under-counts `filed` and PASSES a check that should fail (step 5 already fetched). If the
      result is exactly 200 rows, treat that as truncated rather than as the answer — raise the
      bound and re-run; a cap only closes the hole while the result stays under it. If
      **filed > 0 AND filed ≥ closed**, the PR did not reduce the backlog: either claim the
      first-illumination exemption on its test (see the rule — naming the area is not enough on its
      own) or re-triage and APPLY two or three of the deferrals. A PR that files nothing clears this
      check whatever it closes.

    Per-item justifications do not answer either check — PR #1225 passed every per-item test and
    still filed **9** against 7 closed, sailing past the volume budget too. Nine as of ITS push, not
    the eight its own artifacts add up to: `#1232` counts, created after its merge-base and still
    open. Run the same command against #1225 later and the answer only climbs — it has no
    upper time bound, so it sweeps in what every later branch filed. That is the point of comparing
    once, before push; do not record a "today" figure here, because it is wrong by the next issue. Its
    `## Deferred` section named 2 of the 9, which is why that section is mandatory AND must be
    complete — read literally against an incomplete section, #1225 computes filed=2 and passes.

### Docs, rules and mirrors — land them BEFORE the push, not in wrap-up
7b. **Every doc, rule and mirror update this change requires must already be committed on this
    branch.** This is a pre-push gate, not a wrap-up item. If a rule changed, its mirrors changed
    with it; if schema or an RPC changed, the docs that describe it changed too.

    Check, and fix now if any is missing:
    - `docs/` — anything the change makes inaccurate (database.md matrices, security.md rules,
      decisions.md entry for a real decision).
    - `.claude/rules/*.md` — the rule text itself.
    - **The mirror set for that rule — every row of the table in `agent-workflow.md § Rule-Mirror Sync`, including the executable `.claude/hooks/*.sh` mirrors and `package.json`.** A rule lives in more than one place and the copies
      do not auto-track: `docs/security.md`, `.claude/rules/*.md`, `.coderabbit.yaml`,
      `.claude/agents/*.md`, `.claude/commands/*.md`, `.claude/skills/**/*.md` (RECURSIVE — a nested
      skill is still a mirror), `package.json`, AND any other binding
      doc that re-states the mechanics rather than pointing at them — notably `docs/database.md`,
      whose §7 describes what the security-auditor flags. That last one is a CLASS, not a path — no
      doc-shaped grep reaches it; find it by asking "what else asserts this claim?".
      (The canonical table lives in `agent-workflow.md § Rule-Mirror Sync`; see also
      `agent-learner.md § Downstream-enforcer sync`.) **`.claude/agents/security-auditor.md` is the
      one people forget, and it is the blocking pre-push gate** — a stale checklist there emits
      false CRITICALs. **Grep is a first pass, not the sweep**: a phrase-grep cannot find a
      paraphrase, so when a change retires a *claim*, read the affected section and its mirrors
      end-to-end once.
      **A sweep is done when it passes the completeness checks in `agent-workflow.md § Rule-Mirror
      Sync` ("Sweep completeness"), not when you have run it:** walk every reported hit to APPLIED or
      SKIPPED-with-reason, and checksum the clause across every file carrying it, since a
      byte-identical copy in N files is one artifact and a phrase-grep for your NEW wording matches
      only the file you already fixed. Read them there, with the two instance classes they do NOT
      cover — do not work from a paraphrase here.
      **This file is itself a `.claude/commands/*.md` mirror** — its own list omitted
      `.claude/commands/`, then `.claude/skills/*.md`, then `docs/database.md` across PR #1174's
      rounds 3, 4 and 5, which is exactly the drift the rule exists to catch. Each round fixed the
      instance and left the count; assume the list is still incomplete.

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
    # `--untracked-files=all` is load-bearing, not decoration: `--porcelain` honours
    # `status.showUntrackedFiles`, so a repo or user setting it to `no` drops every `??` line and an
    # untracked mirror edit leaves $STATUS empty — the gate then PASSES on exactly the case this
    # comment says it fails closed on (code-style.md §10 clause 4, same mechanism).
    STATUS=$(git status --porcelain --untracked-files=all) || { echo 'git status failed — ABORT'; exit 1; }
    if [[ -n "$STATUS" ]]; then
      echo 'Uncommitted changes — commit docs, rules and mirrors before pushing. ABORT'; exit 1
    fi
    CHANGED=$(git diff --name-only origin/master...HEAD) || { echo 'diff failed — ABORT'; exit 1; }
    ```
    Steps 6, 7 and 7b then match against `$CHANGED` — do NOT re-run the diff per step. A guarded diff that EXITS non-zero aborts (above); a diff that succeeds with zero paths is a legitimate no-op that PROCEEDS and matches no conditional — branch on the exit code, never on emptiness (see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`"). 7b (Red Team) is MANDATORY: on a stale, unresolvable, or errored base an unguarded conditional silently evaluates false and the required gate is skipped (see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`").

6. **Migration validation (conditional)**: if `$CHANGED` (from 5b) includes `supabase/migrations/`, validate the migrations on a clean local DB before push. If a local Supabase instance is running, run `supabase db reset --no-seed` / `npx supabase db reset --no-seed` (there may be no global binary on PATH) — the same command CI's "Migration Test (clean reset)" job runs (`e2e.yml`) — and confirm every migration applies cleanly. A clean local reset is a **preflight, not a proof**: CI pins the CLI (the `supabase/setup-cli` `version:` in `e2e.yml` — `2.78.1` as of 2026-09-02) while local runs whatever `npx supabase --version` resolves to (`2.116.0` the same day), so the same command is NOT the same engine and the CI job stays authoritative. A SECOND and unrelated divergence: CI wraps that command in a storage-readiness gate plus one signature-scoped retry and local does not, so a local failure citing `storage/v1/bucket` + `context deadline exceeded` is that known CI flake, not your migration — re-run it (this one is the retry wrapper, NOT the CLI version — pinning your local CLI will not change it). If step 7/7b will run locally after this reset, re-seed first (`tsx scripts/seed-e2e.ts`, after the local grant-fix if needed) — the reset leaves the DB empty and an E2E run against it fails spuriously. If no local instance is up, do NOT silently skip — print a loud `⚠️ MIGRATIONS CHANGED — VALIDATE ON A CLEAN DB BEFORE MERGE` and tell the user (CI's migration test is otherwise the first place a bad migration surfaces).
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

The local gate ensures the code compiles, lints, type-checks, passes unit + integration tests, builds, and (when relevant) passes E2E — i.e. that it is not *broken*. Migrations are the ONE exception: step 6 validates them locally as a preflight only, and CI's clean-reset job stays authoritative — do not read a green local reset as "migrations pass". The CI-only checks above track quality/perf trends and are fine to surface post-push.

## Why this exists

This command was created because Claude drifts toward lazy triage — relying on severity labels instead of reading source code, inventing justifications for SKIP/DEFER, and missing spec/test/code conflicts. This checklist forces verification before the push, not after.
