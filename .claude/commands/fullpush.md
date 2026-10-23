Pre-push quality gate. Run this BEFORE pushing to catch drift, lazy triage, and missed issues.

> **RULE 0 — NO PROSE.** State what is true; delete the rest. No justification, no precedent, no archaeology — that is what `git log` is for. Every sentence is a claim that can be false, so fewer sentences means fewer defects. If a fact is derivable, ship the command, not the paragraph. Evidence is not prose: a skip reason, an `EVIDENCE:` line, a finding's stated basis or a required status/summary stays wherever a rule asks for it.

Load the `review-gate` skill first.

## Self-Audit Checklist

Before doing anything else, answer these questions honestly. Do NOT skip any. Print each answer.

### Verification quality
1. **For every reviewer/agent finding on this branch:** Did you READ the actual source file and cross-reference tests, specs, and related files — or did you rely on labels/summaries?
2. **For every SKIP or DEFER verdict:** Can you cite the specific line numbers that support your verdict? If not, go back and verify now.
3. **Did you apply the "< 10 lines = fix now" rule** before marking anything SKIP or DEFER?

### Completeness
4. **Are there any unresolved CRITICAL, BLOCKING, or ISSUE findings** from any agent or reviewer?
5. **Did the pre-push review gate reach a CLEAN round?** (`agent-workflow.md § Pre-Push Review Gate`.) Run `git fetch origin` (ABORT if it fails) — `origin/master` only advances on fetch, and a stale one shifts the review scope, see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`". Then account for the loop, not for commits:
   - **Which rounds ran**, and on what range — every reviewer reads `git diff origin/master...HEAD`.
   - **Every round launched, in ONE parallel batch**: semantic-reviewer, doc-updater, test-writer, code-review (skill) — the built-in `/code-review` skill, dispatched as `subagent_type: code-review-skill` in an isolated worktree on opus — and e2e-writer (sonnet, conditional on the diff touching `apps/web/app/**`, `apps/web/components/**` or `apps/web/proxy.ts`). They are ASYNC, so "ran" means the completion notification arrived and the result was read, not that it was dispatched.
   - **What each round's pooled triage concluded** — one table per round, every finding at a terminal verdict.
   - **The FINAL round carried no APPLY-worthy finding.** A round that still carries one is not a stopping round. There is no round ceiling.
   - The conditionals run ONCE per branch after the loop ends — red-team (opus, the attacker: attacks the local stack and writes+runs a failing spec per proven exploit) if the branch diff touches security paths, coderabbit-sync if rules changed. A proven exploit's prod fix re-enters the round loop; step 7b confirms its spec passes.
   A bare "yes" does not answer this. Name the rounds and paste their verdicts.
6. **Did every round's fixup commit get re-read by the NEXT round, and did the loop end clean?** A fixup commit triggers nothing on its own — the only thing that reads it is the next round, on the re-diffed branch. So: for each round that produced a fixup commit, a further round ran over a diff that included it; and the last round ran on an artifact nobody has changed since. Any edit made after the final round means the loop is not finished — run another round. Re-run the conditionals when their trigger paths entered the diff via a fixup: red-team, coderabbit-sync. Red-team's own specs and rows, and a proven exploit's fix, never re-trigger red-team.
7. **For every DEFER verdict on this branch:** Did you create a GitHub Issue to track it? List the issue numbers. No silent deferrals — every deferred item gets a ticket or it's not really deferred, it's forgotten.
### Docs, rules and mirrors — land them BEFORE the push, not in wrap-up
7b. **Every doc, rule and mirror update this change requires must already be committed on this
    branch.** This is a pre-push gate, not a wrap-up item. If a rule changed, its mirrors changed
    with it; if schema or an RPC changed, the docs that describe it changed too.

    Check, and fix now if any is missing:
    - `docs/` — anything the change makes inaccurate (database.md matrices, security.md rules,
      decisions.md entry for a real decision).
    - `.claude/rules/*.md`, `.claude/skills/review-gate/*.md` — the rule text itself.
    - **The mirror set for that rule — every row of the table in `agent-workflow.md § Rule-Mirror Sync`, including the executable `.claude/hooks/*.sh` mirrors and `package.json`.** A rule lives in more than one place and the copies
      do not auto-track: `docs/security.md`, `.claude/rules/*.md`, `.coderabbit.yaml`,
      `.claude/agents/*.md`, `.claude/commands/*.md`, `.claude/skills/**/*.md` (RECURSIVE — a nested
      skill is still a mirror), `package.json`, AND any other binding
      doc that re-states the mechanics rather than pointing at them — notably `docs/database.md`,
      whose §7 describes what the security-auditor flags. That last one is a CLASS, not a path — no
      doc-shaped grep reaches it; find it by asking "what else asserts this claim?".
      (The canonical table lives in `agent-workflow.md § Rule-Mirror Sync`.) **`.claude/agents/security-auditor.md` is the
      one people forget, and it is the blocking pre-push gate** — a stale checklist there emits
      false CRITICALs. **Grep is a first pass, not the sweep**: a phrase-grep cannot find a
      paraphrase, so when a change retires a *claim*, read the affected section and its mirrors
      end-to-end once. **The file that DEFINES the rule is a mirror of itself** — editing one
      clause of a `.claude/rules/*.md`, `.claude/skills/review-gate/*.md` or `.claude/agents/*.md` file leaves its OTHER clauses
      restating the old claim, and only a full read catches a same-file paraphrase.
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

### Cross-file consistency (every branch, whatever its commit count)
8. Run `git fetch origin` (ABORT if it fails — a stale `origin/master` distorts PR scope, see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`"), then `git diff origin/master...HEAD` and read the full branch diff yourself — the same artifact the gate's reviewers read.
9. Check: do test assertions match production code changed elsewhere in the diff?
10. Check: do doc matrices/tables match the schema changes in the diff?
11. Check: are fallback values and error handling consistent across the whole diff?

## Actions

After answering the checklist:

1. **If any answer is "no"** — fix it before proceeding. Do not rationalize.
2. **Lint (read-only)**: `pnpm lint`. Report errors. It is NOT `biome check .` — read `scripts.lint`
   in `package.json` for what it actually covers, because a turbo-driven lint reaches only paths
   inside a workspace package. ⚠️ Do NOT use `pnpm check` here — that is `biome check --write .`, a fixer that rewrites files repo-wide. The gate must be read-only.
3. **Run type check**: `pnpm check-types`
4. **Run the unit suite**: `pnpm --filter @repo/web test -- --run` — report pass/fail count. UNIT ONLY, despite the script name: `vitest.config.ts` excludes `**/*.integration.test.ts`. The integration tier is a separate config (`test:integration`) that runs real query code against a REAL local Postgres with NO Supabase mocking, and this gate never invokes it — CI's `integration-tests` job is where those first execute.
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
    # --name-status -M, NOT --name-only: the latter prints only a rename's DESTINATION, so moving a
    # file OUT of a security path reads as "no security path" and skips the MANDATORY red-team run
    # at 7b. cut -f2- drops the R<score> column so BOTH sides of a rename reach $CHANGED.
    # Capture FIRST, transform second. A pipeline's exit status is its LAST command's, and neither
    # file sets `pipefail`, so `$(git diff ... | cut | tr) || abort` reads a failed diff as zero
    # paths — the exact emptiness-vs-error conflation the paragraph below forbids.
    RAW=$(git diff --name-status -M origin/master...HEAD) || { echo 'diff failed — ABORT'; exit 1; }
    CHANGED=$(printf '%s\n' "$RAW" | cut -f2- | tr '\t' '\n')
    ```
    Steps 6, 7 and 7b then match against `$CHANGED` — do NOT re-run the diff per step. A guarded diff that EXITS non-zero aborts (above); a diff that succeeds with zero paths is a legitimate no-op that PROCEEDS and matches no conditional — branch on the exit code, never on emptiness (see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`"). 7b (Red Team) is MANDATORY: on a stale, unresolvable, or errored base an unguarded conditional silently evaluates false and the required gate is skipped (see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`").

6. **Migration validation (conditional)**: if `$CHANGED` (from 5b) includes `supabase/migrations/`, validate the migrations on a clean local DB before push. If a local Supabase instance is running, run `supabase db reset --no-seed` / `npx supabase db reset --no-seed` (there may be no global binary on PATH) — the same command CI's "Migration Test (clean reset)" job runs (`e2e.yml`) — and confirm every migration applies cleanly. A clean local reset is a **preflight, not a proof**: CI pins the CLI (the `supabase/setup-cli` `version:` in `e2e.yml` — `2.78.1` as of 2026-09-02) while local runs whatever `npx supabase --version` resolves to (`2.116.0` the same day), so the same command is NOT the same engine and the CI job stays authoritative. A SECOND and unrelated divergence: CI wraps that command in a storage-readiness gate plus one signature-scoped retry and local does not, so a local failure citing `storage/v1/bucket` + `context deadline exceeded` is that known CI flake, not your migration — re-run it (this one is the retry wrapper, NOT the CLI version — pinning your local CLI will not change it). If step 7/7b will run locally after this reset, re-seed first (`tsx scripts/seed-e2e.ts`, after the local grant-fix if needed) — the reset leaves the DB empty and an E2E run against it fails spuriously. If no local instance is up, do NOT silently skip — print a loud `⚠️ MIGRATIONS CHANGED — VALIDATE ON A CLEAN DB BEFORE MERGE` and tell the user (CI's migration test is otherwise the first place a bad migration surfaces).
7. **E2E (conditional)**: if `$CHANGED` (from 5b) includes `apps/web/e2e/` (excluding `redteam/`), run the web Playwright suite (`pnpm --filter @repo/web e2e`) with `:3000` free — Playwright starts its own server and never reuses a running one.
7b. **Red Team (MANDATORY when touched — do NOT skip)**: if `$CHANGED` (from 5b) includes `apps/web/e2e/redteam/**` (red-team spec changes) OR `apps/web/e2e/helpers/**` (red-team specs import them) OR any security path (the canonical set from `agent-workflow.md § Red-Team Agent Trigger`: `supabase/migrations/**`, `packages/db/src/**`, `apps/web/app/app/quiz/actions/**`, `apps/web/app/auth/**`, `apps/web/app/**/route.ts`, `apps/web/proxy.ts`, `docs/security.md`), run `pnpm --filter @repo/web e2e:redteam` locally, with `:3000` free, and confirm **all specs pass** before pushing. `Red Team Specs` is a **required** status check — a local failure means a blocked PR. The `e2e` script in step 7 does NOT include the `redteam` project, so this is a separate run. If the local Supabase stack is down, bring it up (`supabase start` / `npx supabase start`, re-seed via `scripts/seed-e2e.ts`) — do NOT skip with a warning and rely on review+lint+type. PR #769 shipped 2 runtime-failing red-team specs precisely because this step was skipped on the assumption that review caught runtime behavior. It does not.
8. **Show the review-gate findings summary table** for this BRANCH — every reviewer the gate ran, across every round.

```
| Reviewer               | Rounds | Severity | Count | Status      |
|------------------------|--------|----------|-------|-------------|
| semantic-reviewer      | 1-N    | ...      | ...   | fixed/clean |
| doc-updater            | 1(+N)  | ...      | ...   | clean       |
| test-writer            | 1(+N)  | ...      | ...   | added N     |
| code-review (skill)    | 1-N    | ...      | ...   | fixed/clean |
| e2e-writer             | 1(+N)  | ...      | ...   | added N/n-a |
```

9. **If an active spec exists**, confirm all completed tasks are checked off in `tasks.md` (`[ ]` → `[x]`). If any are missing, update before proceeding.
10. **Ask for explicit push approval.** Never push without it.
11. **After the approved push has succeeded** (pre-push hook passed), with no further round pending, clear the review-gate lock: `rm -f "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.claude/review-gate.lock"`. A blocked or failed push leaves it set.

## What this gate does NOT cover (left to CI on purpose)

These run in CI and are intentionally not replicated locally — they are slow/infra-heavy quality gates, not "broken code" checks:
- Lighthouse performance audit (`lighthouse.yml`)
- SonarCloud + CodeQL deep static/security analysis (`sonarcloud.yml`, `codeql.yml`)
- Bundle-size regression (`bundle-size.yml`)
- Codecov patch-coverage threshold (`ci.yml`, `coverage-trend.yml`)
- Dead-code / unused-export scan (`dead-code.yml`)

The local gate ensures the code compiles, lints, type-checks, passes unit tests, and builds — i.e. that it is not *broken*. What it does NOT establish, in three distinct senses: **integration tests** never run here at all (step 4 is unit-only — `vitest.config.ts` excludes `**/*.integration.test.ts`; CI's `integration-tests` job runs them first); **migrations** are only a preflight even when step 6 does fire — CI's clean-reset job is authoritative, so never read a green local reset as "migrations pass"; and **E2E and red-team** are full checks but run only when their own trigger paths change (steps 7 and 7b — 7b's trigger set is the broader one, and it is not labelled `(conditional)` though it is). The CI-only checks above track quality/perf trends and are fine to surface post-push.

## Why this exists

This command was created because Claude drifts toward lazy triage — relying on severity labels instead of reading source code, inventing justifications for SKIP/DEFER, and missing spec/test/code conflicts. This checklist forces verification before the push, not after.
