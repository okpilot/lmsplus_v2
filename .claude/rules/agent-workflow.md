# Agent Workflow — Pipeline & Orchestrator Rules
> How the orchestrator (Claude) plans, validates, and coordinates work.
> Per-agent handling rules are in separate `agent-*.md` files in this directory.

---

## Plan Validation Pipeline (runs BEFORE any code is written)
For any multi-file change, the orchestrator must validate the plan before executing it. This is where most defects are cheapest to catch.

```
User request ▼ Explore (subagents map relevant code) ▼ Root cause check (is the described fix the RIGHT fix?)
    ▼
Requirement interview (if multi-file — skip conditions below)
    ▼
Draft plan (files to change, approach, risks)
    ├─► Impact analysis / Contract check / Pattern scan / Doc-schema check / Security surface
    │     (table below — What each validation step does)
    ▼
Validated plan (affected files, test updates, doc updates, risks) ▼ Plan-critic review — ONE run (skip for single-file < 10 lines)
    ├─► fix APPLY findings ─► proceed. No rounds: a plan is prose (agent-critic.md § Model tier)
    └─► unresolvable ISSUE or CRITICAL ─► STOP, hand off to the user (§ NEVER forbids
          executing with either one open — not CRITICAL alone)
    ▼
User approves → Execute
```

### Requirement Interview (runs AFTER root cause check, BEFORE drafting the plan)
Surface requirement ambiguities as explicit questions before drafting the plan.
**Template** (3-5 questions): scope boundaries; behavioral ambiguities; priority trade-offs.
**Auto-skip when ANY apply:** single-file bug fix with clear repro and single root cause; user says "skip interview"; zero ambiguities found (state which of the three categories were checked and found unambiguous).
Answers feed the plan draft (and the spec's requirements section, if one exists). On by default for multi-file changes — never skipped silently: state "No ambiguities identified" or ask.
### What each validation step does:

| Step | What to check | How | Blocker if... |
|------|--------------|-----|---------------|
| **Impact analysis** | Callers, importers, dependents of every file being changed | Explore agents: grep for imports/function usage | A caller relies on behavior you're about to change |
| **Contract check** | Test assertions, exported type contracts (types/interfaces callers depend on), Zod schema contracts (validators referencing changed types), and doc-asserted behaviors (docs/database.md) | Read `.test.ts` files, trace exported types/interfaces, check Zod schemas referencing changed types, read relevant doc sections | A test asserts a value you're changing, a TypeScript caller depends on a type you're restructuring, or a schema validator references a changed type |
| **Pattern scan** | How similar code is written elsewhere in the repo; for every new helper, query or external-API call, the existing implementation of the same operation (`git grep` the SDK method, table or RPC) | Explore agents: find 2-3 similar files | Your approach diverges from established patterns |
| **Sibling file audit** | When updating a function that provisions users, seeds fixtures, or manages test records, find ALL functions with the same semantic purpose (e.g., all `ensure*User` helpers, all seed functions) and update them together | Grep for function name patterns, check all helper files | A sibling function is missed and breaks at runtime |
| **Gitignore placement** | Every NEW file under a root-level dir — confirm it is not silently ignored before choosing its path | Run `git check-ignore <path>` on each new file path | The path is ignored (exit 0). Root `/scripts/` is gitignored — put CI workflow helper scripts in `.github/scripts/`, dev hooks in `.claude/hooks/`, app/eval/seed scripts in `apps/web/scripts/` (note `apps/web/scripts/probe-*.py` is also ignored) |
| **Doc/schema check** | docs/database.md, docs/decisions.md | Read relevant doc sections | A doc table/matrix will become inaccurate |
| **Security surface** | Auth checks, RLS policies, answer exposure, input validation | Read docs/security.md + check against plan | Change touches security boundary without matching rules |
### Plan output format:
```
PLAN — [task description]
Files to change: path/to/file.ts (lines ~X-Y) — what and why
Files affected: path/to/file.test.ts — update assertion from X to Y; docs/database.md — update soft-delete matrix row for table Z
Risks: [specific edge case or known concern]
Validation: ✓ Impact [N callers, conflicts] ✓ Contracts [N test files, M need updates] ✓ Patterns [matches/diverges + why] ✓ Docs [drift/update] ✓ Security [n/a or rule N]
```

### Plan-Critic Review (runs AFTER plan validation, BEFORE user approval)
Run plan-critic (sonnet) via the Agent tool after validation, before presenting the plan to the user.
**Inputs:** the validated plan text, plus the source files in "Files to change" / "Files affected".
**One run, not rounds.** plan-critic runs **ONCE**. Fix APPLY-worthy findings and proceed; an unresolvable ISSUE or CRITICAL escalates to the user instead of another round. A heavy redraft is a new plan with its own single run. `agent-critic.md § Loop Round Discipline` governs the pre-push gate's reviewers, not plan-critic.
**Skip condition:** single-file changes under 10 lines.
**Timeout:** warn past 60s for plans up to 10 files, 120s beyond.
### DO
- Run validation for EVERY multi-file change. No shortcuts.
- Run the interview for every multi-file change unless auto-skip conditions apply.
- Run plan-critic on every multi-file plan before user approval.
- Include test updates in the plan, not as an afterthought.
- Use Explore agents for impact analysis — don't guess who calls a function.
- Block execution if a validation step reveals a conflict. Revise the plan first.
### NEVER
- Skip validation because the change "seems simple."
- Skip the interview silently — state "No ambiguities identified" or present questions.
- Skip plan-critic for multi-file changes.
- Proceed to execution with unresolved plan-critic ISSUE/CRITICAL findings.
- Implement first and fix tests/docs later — plan them together.
- Guess at existing behavior — read the code and tests to verify.
- Proceed to execution with unresolved validation conflicts.

---

## Spec Artifact Rules
Structured specs persist plans beyond chat history and provide session resume context.
### When to create a spec
Features spanning **3+ files** OR introducing a **new architectural pattern**. Create via spec-workflow MCP tools (`mcp__spec-workflow__*`).
### When NOT to create a spec
Bug fixes, single-file refactors, changes touching fewer than 3 files — unless the change introduces a new architectural pattern, which requires a spec at any file count.
### Spec lifecycle
1. **Created** during planning — requirements, approach, file list.
2. **Updated** during implementation — deviations, decisions, task progress.
3. **Untracked** — `.spec-workflow/specs/<name>/` is gitignored. Specs tracked before 2026-09-23 stay tracked (a `!` line each in `.gitignore`) until their work lands, then are deleted with their `!` line.
4. **Session resume context** — the spec is the restart starting point, not chat history.
### Spec-as-context rule
When a spec exists, the orchestrator references it — not chat history — as the source of truth.
### Deviation rule
After a spec reaches "approved", material changes to the approach require updating the spec first.
### MCP fallback
If the spec-workflow MCP is unavailable, write spec files manually to `.spec-workflow/specs/<name>/`, copying an existing spec's structure.
### Working notes
Plans, task lists, handovers, triage and eval notes go in `.work/` (gitignored). Untracked files exist only in the main checkout: pass their content inline to an isolated-worktree agent, and never cite their path from a tracked file. `check-md-allowlist.mjs` blocks a new tracked markdown file outside `.claude/md-allowlist.json` (pre-commit and CI).
### DO
- Create a spec for any feature spanning 3+ files or introducing a new pattern.
### NEVER
- Make material changes to an approved spec's approach without updating the spec.

---

## Pre-Push Review Gate
### Every agent dispatch is ASYNCHRONOUS — the diagram is a data dependency, not a clock
`Agent` returns an id immediately; the agent runs in the BACKGROUND and notifies you when done. Nothing makes the diagram below happen in the order it is drawn.
- **"Complete" means every completion notification from the agents LAUNCHED is RECEIVED, never merely dispatched.** Read every result before triaging — a partial pool biases the triage.
- **Never edit a file while an agent that can write it is in flight.** The loser's change vanishes with no error, no conflict, no failing gate. Only **test-writer** holds Write/Edit (scoped to test files); every agent still keeps `Bash`, which can write. Round 1 runs seven concurrently — this is the gate's sharpest edge. The collision set is SIX: `code-review (skill)` runs with its cwd in an isolated worktree, so its writes land there and not in the main tree. That is NOT a read-only guarantee — it keeps `Bash` like every agent — and the exemption holds only while it is dispatched the way `agent-code-review.md § Dispatch` mandates.

### The gate — ONE loop over the branch diff, not a cycle per commit
Commits inside a branch are scratch history; squash-merge discards them. Review the artifact that lands.
**Scope** — every reviewer in the loop reads the same range:
```bash
git fetch origin || abort
git diff origin/master...HEAD
```
Three-dot (merge-base). ABORT on a non-zero EXIT CODE from fetch, base resolution, or the diff — never on an empty result.

```
Execute ▼ commit freely — a commit triggers NOTHING
    ▼  (pre-push, per BRANCH)
ROUND 1  implementation-critic + code-reviewer + semantic-reviewer + doc-updater
         + test-writer + deletion-reviewer + code-review (skill) — ONE parallel batch, all on the
         branch diff.  code-review (skill) is the built-in /code-review skill,
         dispatched as a subagent in an isolated worktree on opus.
ROUND 2+ code-reviewer + semantic-reviewer + code-review (skill)
         (doc-updater and test-writer PRODUCE, they do not gate — re-run one, or deletion-reviewer, only
          when the fixup added surface it has not seen)
    ▼
each round: WAIT for every agent LAUNCHED ─► validate every finding
            (§ Finding Validation) ─► ONE pooled triage table ─► ONE fixup commit
            ─► re-run.  The fixup commit triggers NOTHING on its own.
    ▼
STOP on the FIRST round carrying no APPLY-worthy finding. No minimum, no floor.
    ├─► an APPLY finding EXTENDS the loop by one round; a skip-with-reason does not
    └─► CEILING 3 rounds. At the ceiling STOP and escalate. A NEW critical in a
          section an earlier round passed means the diff is too large: SPLIT it,
          never run another round.
    ▼
then ONCE per branch, in this order:
    red-team (if the branch diff matches § Red-Team Agent Trigger)
            ─► coderabbit-sync (if it matches `agent-coderabbit-sync.md`)
    ▼
update spec tasks.md ([ ] → [x]) ▼ /fullpush ▼ push (security-auditor, fail-closed)
```
**Never re-run to chase a clean round; always re-run after a fix.** A round reads a CHANGED artifact or it buys nothing.
**The gate owns `.claude/review-gate.json`** (`.claude/hooks/review-gate.js`): write it when validated ISSUE/CRITICAL findings are open, delete it when the round ENDS — the fixup commit landing is the usual trigger, but a round whose findings are ALL skipped-with-reason produces no commit and still has to clear it. A stale gate file blocks production edits made through Edit or Write, and nothing else clears it: the hook only READS the file. `.claude/settings.json` routes `Bash` to `guard-bash.js`, which does not read the gate file — so a Bash redirect writes production files straight past a live gate.

### Implementation-Critic (a member of round 1)
Runs on the branch diff against the validated plan and requirements (spec or plan output). No staged-diff scope, no exemption, and no revision sub-loop — its findings enter the same pooled triage as every other reviewer's, and the loop ceiling is the only round limit that applies to it.
**Timeout:** proceed with a warning past 90 seconds for diffs under 500 lines.
### Red-Team Agent Trigger (conditional)
After the review loop ends, check whether the BRANCH DIFF includes any of these paths: `supabase/migrations/**`, `packages/db/src/**`, `apps/web/app/app/quiz/actions/**`, `apps/web/app/auth/**`, `apps/web/proxy.ts`, `docs/security.md`.
`agent-red-team.md` adds ONE path for its own trigger — `apps/web/e2e/redteam/` — and `/fullpush` step 7b honours it too; a spec-only change runs the agent while matching nothing above.
If yes, run red-team (sonnet) — maps changes to specs, flags coverage gaps. If it flags affected specs, run `pnpm --filter @repo/web e2e:redteam`.

## The branch diff is the review artifact
§ Pre-Push Review Gate is the one review pass, on every branch whatever its commit count. Cross-commit defects are only visible here: a test assertion against prod code from another commit, a doc matrix against an earlier schema change, an error-handling pattern split across commits.

## Always diff against `origin/master`, never the bare local `master`
**Staleness is not safe in one direction.** Usually over-reports, but can also HIDE a security path: if this branch REVERTS a change that landed upstream after the stale ref, the file is identical at both ends and drops out of the diff — the floor reads "no security path" and `/fullpush` 7b skips the MANDATORY red-team run.
**Pick the right range form — NOT interchangeable.** Three-dot `origin/master...HEAD` for any DIFF (merge-base compare). Two-dot `origin/master..HEAD` only for COMMIT ENUMERATION (`git log`, `git rev-list --count`). Both need a freshly fetched base — `git fetch origin` first, every time.
**Fail closed on an unresolvable base or a failed fetch** — a failed fetch usually leaves `origin/master` RESOLVABLE at its old value, so a resolvable-ref check alone does not catch it. Abort on a non-zero EXIT CODE from fetch, base resolution, or the diff — NOT on an empty result (a diff returning zero paths is a legitimate no-op; only an errored command means the scope is unknown).
**Do NOT "solve" this by fast-forwarding local `master`** — `git fetch origin master:master` is refused whenever `master` is checked out in ANY worktree and on a non-fast-forward. Use `origin/master` in the revision expression instead. If a tool genuinely requires a local branch name: `git fetch origin master`, ABORT if it fails, compare `git rev-parse master origin/master`, **hard-stop if they differ or either fails to resolve**.
**Do not confuse this with under-deriving the floor** — staleness inflates; deriving the floor from
semantic intent instead of mechanically globbing the changed-path list under-reports.

## Finding Validation (MANDATORY before fixing)
A reviewer's ISSUE/CRITICAL is a hypothesis. Validate before editing:
1. **Verify the factual premise with a COMMAND, not by reasoning.** Pick the command for the
   STATE the claim is about — committed, staged, tracked-uncommitted, or untracked. The wrong
   state returns a clean result that reads as a refutation.

   | Claim shape | Command | Trap it avoids |
   |---|---|---|
   | "production is in state X" | read-only probe per `reference-prod-readonly-db-access`; SELECT only, narrowed to the disputed rows, never `SELECT *` over answers or personal data. If answering needs a WRITE, a schema change, or a wide personal-data read — STOP and ask the user | designing a new prod-WRITE path around a premise nobody checked |
   | "phrase X was never here" | `git log -S '<phrase>' --all --diff-merges=first-parent --no-patch` FIRST, then `git show <sha>^:<path>` | a phrase retracted while AUTHORING is in NO tree; `git show <sha>:<path>` and `git show <sha>^:<path>` both return 0 and that 0 is expected, not a refutation. Bare `git log` walks HEAD's ancestry only |
   | "this file is new" | committed: `git show --diff-filter=A --format=%H <sha> -- <path>`. Uncommitted: `git status --porcelain --untracked-files=all` FIRST, then `git diff HEAD --stat -- <path>` | `git log --diff-filter=A --format=%H -- <path>` finds the addition ANYWHERE in history; a path deleted and re-added returns several. Take `--format=%H`: the bare form prints a whole commit block, and `%h` under `log.abbrevCommit=true` does not pin the full hash. A file created but never `git add`-ed is in neither HEAD nor the index, so no `git diff` form sees it |
   | "+N tests" | read the PATCH — committed `git show <sha> -- <path>`, tracked-uncommitted `git diff HEAD -- <path>`, untracked read the file; count added `it(`/`test(` plus `it.each(`/`test.each(` rows | `--stat` counts LINES. `it.each` contributes one test per data row and does not match a grep for `it(` |
   | "function A calls B" / "the siblings all do X" | grep the call sites, or read `pg_proc.prosrc` | a doc claiming a call that never existed |
   | "a critic told me X" | verify X yourself before repeating it in a commit message, plan, or rule | a critic's claim is evidence it BELIEVED something, never that the code does it |
   | "this path is covered by Y" | open Y and confirm it covers the path CLAIMED | a right verdict resting on invented evidence; the verdict is what makes the evidence read as checked |
   | "this changed the failure mode" | read the OLD body | acting on a stated mechanism that is wrong produces the wrong fix even when the conclusion is right |
   | "I ran / verified / updated / wrote X" | inspect the ARTIFACT — `git status --porcelain --untracked-files=all`, `git diff HEAD -- <path>`, and for a committed write `git show --stat <sha> -- <path>` | bare `git status` honours `status.showUntrackedFiles=no`; bare `git diff` shows only UNSTAGED, so an agent that staged its write reads as having written nothing. NOT bare `git diff --stat`, which compares worktree against index and reports nothing for anything staged or committed; `git log -1 -- <path>` returns the NEWEST commit, so any later touch makes a TRUE claim compare unequal |
   On a MERGE commit add `--diff-merges=first-parent` to any `show`: the default combined diff
   omits a path matching a parent, so a merge that DID bring the file in stats EMPTY.
   Scope: claims you are about to ACT ON or RELAY. Naming a prior failure in the dispatch prompt
   does NOT prevent recurrence — only the artifact check does.
2. **Check implications** — what callers/tests/docs break if the fix is applied? Read them.
3. **Decide** — real issue, false positive, or valid concern needing a different fix.
4. **If the fix changes the plan** — re-validate the changed parts first.

## Apply-vs-Defer Discipline (MANDATORY before push)
> **Default: apply. Defer is the exception.** Sort everything on the local machine before pushing. Don't push with a queue of unfinished business.
### When to APPLY (default — most cases)
Apply inline when ANY hold:
- < 30 LOC, same-pattern-as-existing-code.
- Context is already loaded — re-loading later costs more than the fix.
- The finding is from any reviewer in the pre-push gate, or from plan-critic (pre-push triage is cheaper than post-push).
- The finding addresses a project-rule violation (`code-style.md`, `security.md`, `agent-*.md`) — not deferrable.
### When to DEFER (exception — requires all three)
File a GitHub Issue and defer only when ALL hold:
1. ≥ 30 LOC estimated total (code + tests + docs).
2. Genuinely separate concern — different feature area/threat model/RPC family; could stand alone as a PR.
3. Requires a design decision the PR doesn't establish, or a system the orchestrator hasn't loaded context for.
Any false → apply.
### Defer-budget per PR — TWO checks, both binding
Volume and ratio are independent — a PR passes only if it clears both.
**Check 1 — volume.** 0 deferrals is the goal; 1-2 acceptable when each meets the three-condition test; 3+ — re-triage every survivor and name them in the push summary.
**Check 2 — ratio.** Compare once, before push. If **filed > 0 AND filed >= closed**, needs a written justification.
- **"Filed"** = every issue the branch author created after the merge-base, whatever its origin (BACKLOG DELTA). PR body's `## Deferred` section is authoritative and MANDATORY on any PR filing an issue; on a first push, check the draft body.
- **"Closed"** = the issues this PR's `Closes #N` / `Fixes #N` will actually close.
- Enumerate with the merge-base TIMESTAMP, not its date (day-granular, over-reports). `git fetch origin` first, ABORT if it fails, then `gh issue list --state open --limit 200 --search "author:@me created:>=$SINCE"`, with `$SINCE` captured and guarded FIRST: `MB=$(git merge-base origin/master HEAD) || abort`, then `SINCE=$(git log -1 --format=%cI "$MB") || abort`. Do NOT inline — a failed `git merge-base` leaves an empty substitution, and `git log -1 --format=%cI` then defaults to HEAD, under-counting `filed` with no diagnostic. `--limit 200` is load-bearing: `gh` defaults to 30 and exits 0 on a truncated list; exactly 200 means treat it as truncated and raise the bound. `author:@me` is the `gh`-authenticated account, not the commit author. `--state open`, not `--state all`: one filed and closed on the same branch is zero backlog delta.
Accepted justifications: first-illumination, red-team coverage gaps — both need evidence in the PR body; nothing else passes.
**First-illumination exemption — evidence required, once per area.** Name the path set and paste the output of:
1. `git log --oneline -- <paths>` — must be NON-empty (pathspec resolves).
2. `git log --since=6.months.ago --oneline | head -1` — repo-wide, no pathspec — must be NON-empty (date expression parsed; step 3's EMPTY result is the pass condition, so a spuriously empty log silently GRANTS the exemption).
3. `git log --since=6.months.ago --format=%h -- <paths> | xargs -r -n1 git show --stat --format='%h %s'` — must list no substantive commit (not docs-only). Same date + paths as above.
4. No open issue targeted those paths at branch cut — judgment call; state which you checked.
Check the exit code of every command above before reading its output — step 3 pipes into `xargs`, which exits 0 on empty input, so a FAILED `git log` is indistinguishable from the granting result.
Record as `first-illumination: <path set>` in the PR body. Find prior grants via `gh pr list --state merged --search '"first-illumination" in:body'`. Treat a shared directory as the same area.
**Red-team coverage-gap justification — evidence required, no area limit.** `agent-red-team.md` mandates filing an issue for every coverage gap it identifies; these filings still COUNT toward `filed`. List each in `## Deferred` marked `red-team-gap`, naming the vector ID from `apps/web/e2e/redteam/attack-surface.md` or the spec path it covers. A gap you cannot name is not a red-team gap. A PR whose filings are ALL red-team gaps passes; mixed with ordinary deferrals, judged on the ordinary ones alone against `closed`.
Otherwise re-triage: usually APPLY two or three deferrals rather than argue for them.
### What every deferred issue must include (no silent backlog growth)
If you file a deferral, the issue body must contain:
- **Effort estimate** — S (< 30 LOC) / M (30-150 LOC) / L (150+ LOC).
- **Priority** — P0 (security/correctness blocker) / P1 (important) / P2 (nice-to-have).
- **Acceptance criteria** — a developer should be able to start the work without re-reading the original CR comment or chat history.
- **Source link** — the originating finding (CR comment URL, semantic-reviewer report, etc.) so the rationale is recoverable.
If you can't articulate effort + priority + acceptance now, apply the fix instead.
### "Won't do" is a valid verdict at file time
If, while writing the deferral, you realize you wouldn't pick this up in the next 2 sprints, **don't file** — close the finding as "won't do" with a one-line reason. Better than letting an issue age forever.
### Pre-push gate
Before push, every reviewer/CR finding must be in one of these terminal states:
- **APPLIED** in a commit on this branch.
- **DEFERRED** with a filed GitHub issue carrying effort + priority + acceptance.
- **SKIPPED** with a written reason that establishes the finding is wrong on the merits (false positive, contradicts codebase pattern, etc.). "I don't want to do this" is not a skip reason.
No in-flight findings at push time.
### DO
- Lean APPLY by default. Treat DEFER as the suspicious choice that needs justification.
- When in doubt between APPLY and DEFER, apply. Re-loading context is expensive.
- Periodically (weekly via `/insights`) review open deferred issues — re-prioritize, action, or close as wontfix.
### NEVER
- Defer because "the PR is almost done." That's the failure mode this rule exists to prevent.
- File a deferral without effort + priority + acceptance criteria. Bare titles rot.
- Skip a finding to avoid the work. Skip is reserved for "wrong on the merits."
- Push with in-flight findings (no terminal state assigned).

## PR Batching — Split by Risk Surface; Combine Only Like-for-Like (MANDATORY)
> Pipeline cost is per-PR; review cost is per risk surface and non-linear — past a certain diff, rounds stop converging. An extra PR costs a bounded ~30 min of CI; a non-convergent review loop costs unbounded time. Optimise against the unbounded one.
**Default: SPLIT.** Group work into the fewest PRs that each carry **one merge gate and one risk surface** — not the fewest PRs overall.
### Hard split triggers — each forces its own PR
- **Migration work** — auto-deploys on merge, user-gated. Migrations deploying together may share one PR; NON-migration work must not ride along behind that prod-deploy approval.
- **A security path** (`§ Red-Team Agent Trigger` set) — makes red-team mandatory and pulls the whole branch under the security-auditor's closest scrutiny; unrelated work should not ride behind that.
- **A change superseding an issue's stated acceptance criteria** — needs its own argument in its own PR body.
- **A shared component whose change fans out to several surfaces** — blast radius, not diff size, is what reviewers must hold in mind.
### Still COMBINE when all of these hold
Mechanical or test-only work, over disjoint files, sharing no migration, no member on a security path: edit first (parallel subagents on non-overlapping file sets), run the pipeline ONCE.
### The non-convergence signal
A review round surfacing a NEW critical in a section an earlier round already reviewed means the diff is too large. Split — do not run another round.
### Splitting is SEQUENCING, not deferring
Pieces are built in order, in the same run. Only a deferral if a piece is left unbuilt — say so in the PR body.
### Batch the fixups too (UNCHANGED by the split default)
Collect ALL findings from ALL of a round's reviewers into **ONE fixup commit**, not one per finding. test-writer's tests ride the same commit (`agent-test-writer.md`). The fixup commit triggers nothing by itself — the next ROUND is what re-reads it.
### Anti-patterns — there are TWO, in opposite directions
1. One issue → one branch → full pipeline → merge → repeat — crawls on a multi-issue mechanical run.
2. Everything the work touches → one branch — review does not converge, and a migration drags unrelated code through a prod-deploy gate.

## Push Batching — a push is NOT free (MANDATORY)
> Every push costs a full CI run (~30 min: E2E, Red Team, Integration, Migration Test, Lighthouse, CodeQL, SonarCloud) plus one cloud CodeRabbit review. Cost is in the PIPELINE, not the diff.
`PR Batching` above governs how many ISSUES go in a PR. This governs how many times you PUSH it.
### The rule
- **Batch every pending change into ONE push.** Before pushing: is anything else nearly ready? A second push minutes later doubles the CI bill and burns a second cloud review on a diff the first had already mostly seen.
- **After pushing a fix for cloud-CR findings, STOP committing to that branch** until the new review returns.
- **Never push a docs-only, config-only or process-only follow-up onto an open PR** unless required for THAT PR to become mergeable. Park it on a separate branch until something else needs CI.
- Diff size is not the cost — if a change does not move the PR toward merge, it does not justify a pipeline run.
### Anti-pattern (what this rule exists to stop)
Push the CR fix → notice a doc nit → commit it → push again → full CI + a second cloud review for a change that could not have affected mergeability. Hold the process commit on its own branch instead.
### Interaction with the docs-before-push rule
`/fullpush` step 7b requires docs, rules and mirrors committed BEFORE the push — same reason: land them in the FIRST push so there is no second one.

---

## Call-Site Sweep — a new rule covers existing code (MANDATORY on rule promotion)
A commit adding a hard rule to `docs/security.md`, `.claude/rules/security.md`, `code-style.md` or `biome.json` schedules a one-time repo sweep for EVERY existing instance the rule forbids — not only the call sites in the diff. Each site is fixed in the same session (≤10 lines) or gets a GitHub issue. A scope clause in the rule itself (e.g. "never in a sweep") overrides this.
**A sweep declared complete states the command and pastes its output.** Where the rule has a mechanical enforcer — a hook, a test harness, a CI script — run THAT as the sweep and paste its summary; where the enforcer grades, paste both `node .claude/hooks/run-mutations.mjs` and `--coverage`.

## Rule-Mirror Sync — restatements across the mirror set (MANDATORY on rule edits)
A commit modifying a rule in `.claude/rules/*.md` or `CLAUDE.md` must update every stale restatement **in the same commit**. Enumerate the mirror set from this table, never from memory or a count.

| Mirror | Why it holds inline text |
|---|---|
| `docs/security.md` | the binding reference |
| `.claude/rules/*.md` | `security.md` is the auto-injected quick summary |
| `.coderabbit.yaml` | CodeRabbit cannot follow a pointer |
| `.claude/agents/*.md` | `security-auditor.md` is the BLOCKING pre-push gate |
| `.claude/commands/*.md` | slash commands restate gate lists |
| `.claude/skills/**/*.md` (recursive) | loaded as write-time guidance; enumerate at sweep time with `find .claude/skills -name '*.md'` |
| `.spec-workflow/specs/**` — TRACKED specs with open tasks only (`git ls-files .spec-workflow/specs`) | `§ Spec-as-context rule` makes an approved spec the source of truth over chat history, so a cap restated in one that still has open tasks is a live mirror. A spec whose tasks are all `[x]` is a historical record — leave it |
| `.spec-workflow/steering/**` | ALWAYS live — steering docs are re-read at planning time and are never superseded the way a completed spec is. `structure.md` and `tech.md` restate layout and stack mechanics, and both went stale in this very slice |
| `.claude/hooks/*.sh` | **executable mirrors** — `run-security-auditor.sh` pins the auditor's `--model` sonnet literal, a restatement of the `agent-critic.md` model-tier rule that `.claude/pipeline.json` `modelLiteralSites` asserts. Not `.md`, so doc-shaped greps miss them |
| `package.json` | the artifact `CLAUDE.md`'s `pnpm.overrides` paragraph asserts about |
| any OTHER binding doc that re-states the mechanics — notably `docs/database.md` | a CLASS, not a path. Enumerate by asking "what else asserts this claim?" |

**Grep is a FIRST PASS, not the sweep.** Grep every fixed path for old and new wording — a phrase-grep cannot find a PARAPHRASE, so read the affected section and its mirrors end-to-end when a change retires a CLAIM rather than a string. A restatement that merely POINTS at the rule needs no edit; one that RE-STATES the mechanics does.
**The file that DEFINES the rule is a mirror of itself.** Editing one clause of a `.claude/rules/*.md` or `.claude/agents/*.md` file leaves its OTHER clauses restating the old claim — read that file end-to-end before committing. A phrase-grep finds the canonical string; only the full read catches a same-file paraphrase.
**Write the mirror from the canonical TEXT, then diff it clause by clause** — never from memory. Re-read every mirror when the canonical changes.
**Sweep completeness — done when it passes these checks, not when run:**
1. Walk every reported hit to a terminal disposition — APPLIED or SKIPPED-with-reason — before committing.
2. **Checksum the clause across every file that carries it** — a phrase-grep for NEW wording matches only the file just edited. Anchor on a distinctive substring from the clause's OPENING that the edit does NOT change:
   ```bash
   node .claude/hooks/check-mirror-sync.mjs '<distinctive substring from the clause opening>'
   ```
   Identical digests on every line = in sync; exits non-zero on divergence, an unchecked file, or an anchor matching nothing. A tested script — do not re-inline it.
**Not covered: paraphrase-blindness** — zero grep hits plus non-byte-identical copies. Open problem.
**The enumeration itself is the recurring defect.** Treat "the list is complete" as the likeliest false claim. A sweep finding a surface the table does not name widens the TABLE in the same commit.

## Orchestrator Role
### DO
- Run the pre-push gate once per branch (§ Pre-Push Review Gate) — round 1 dispatches all seven reviewers in ONE parallel batch; WAIT for a completion notification from every agent LAUNCHED before acting.
- Read all results before starting any fixes.
- Validate every ISSUE/CRITICAL finding before fixing.
- Report findings to the user in a summary table: agent / severity / count / status.
- Report ALL severity levels, not just criticals.
- Re-run the gate's reviewers after a round's fixup commit lands — that is the next ROUND, not a commit-triggered re-run.
- After all agents report clean, update `tasks.md` in the active spec (`[ ]` → `[x]`) for every completed task.
### NEVER
- Skip the gate, or drop a reviewer from round 1. Branch size is never the criterion; there is no exemption.
- Run a round on an UNCHANGED artifact to chase a clean result — a round follows a FIX, never a wish.
- Exceed the 3-round ceiling. At it, STOP and escalate; a new critical in an already-reviewed section means SPLIT.
- Treat a commit as a review trigger. Commits are free; only a round reads them.
- Start fixing before every LAUNCHED agent has reported — async, dispatching is not reporting.
- Fire-and-forget agents without reading results.
- Edit a file while an agent that can write it is in flight — only test-writer holds Write/Edit (scoped to test files); Bash still writes, so this is one collision, silent and gateless.
- Jump to fix a reviewer finding without validating the claim first.
- Present "0 critical" as if that means clean — report every severity.
- Push with any unresolved CRITICAL, BLOCKING, or ISSUE finding.
- Push with failing tests.
- Characterize findings as "latent", "safe today", or "forward-looking" to justify skipping them.
- Finish a task without updating `tasks.md` in the spec.

---

## Task Persistence
Track multi-step work across session restarts using persistent tasks.
### When to create tasks
Features with **5+ discrete implementation steps**. Use `TaskCreate` for each step.
### Task lifecycle
1. **`pending`** — created during planning, before execution.
2. **`in_progress`** — set via `TaskUpdate` when work begins.
3. **`completed`** — set via `TaskUpdate` when the step passes review.
### Session resume protocol
On resume, run `TaskList` before exploring the codebase — outstanding tasks are the starting context.
### Completion reporting
When all tasks for a feature are `completed`, report what was done, deferred, and any outstanding concerns.
### Threshold
Below 5 steps, task creation is optional. Simple changes tracked via the plan are sufficient.
### Fallback
If `TaskCreate`/`TaskUpdate`/`TaskList` are unavailable, track in session summary text and use `.spec-workflow/specs/<name>/tasks.md` as the resume starting point.
### DO
- Create tasks via TaskCreate for features with 5+ steps.
### NEVER
- Start a new session on in-progress work without checking TaskList first.

---

## Proactive Engineering Guidance (MANDATORY)
Flag non-obvious consequences before they become tech debt — never execute silently when a step is missing.
### When to speak up:

| Situation | What to say |
|-----------|-------------|
| Major dependency bump | "This needs a migration pass for deprecated APIs — let's do it in the same PR" |
| Adding a new quality tool | "Let's configure exclusions for generated code first, then run a local baseline before enabling in CI" |
| Adding a new CI check | "Let me run this locally first to triage the baseline — we don't want surprise failures blocking PRs" |
| Architectural shortcut | "This works now but will cause [specific problem] when [specific trigger] — here's the alternative" |
| Process gap | "We don't have a rule for X yet — here's what can go wrong and the rule I'd suggest" |
### DO
- Explain the *why* briefly — one sentence, not a lecture.
- Flag before executing, not after the mess.
- Suggest the fix alongside the warning.
- If the user decides to proceed anyway, respect that — but log it.
### NEVER
- Execute silently when you know a step is missing.
- Assume the user knows industry conventions — explain them.
- Wait for tech debt to accumulate before mentioning it.
- Over-explain or block progress — keep it brief and actionable.

---

## Delegation Protocol
Every subagent prompt must be self-contained and unambiguous. Use this template for all subagent dispatches.
### Template

```
TASK: [action verb + scope]
OBJECTIVE: [why it matters, connects to user's goal]
DONE WHEN: [measurable exit criteria]
CONSTRAINTS: [what NOT to do, file boundaries, limits, security rules]
CONTEXT: [file paths, type signatures, patterns to follow, related tests]
```

### The TERMINAL MESSAGE is the whole report — nothing else reaches the orchestrator
An agent's final message is the ONLY channel back — the orchestrator cannot read a subagent transcript. "The review stands as reported above" and any reference to an earlier turn are forbidden AS THE SOLE CONTENT: there is no above.
### State the MECHANISM behind a constraint, not just the prohibition
A bare prohibition invites the agent to reason around it.
> ❌ "Do not use the local DB to check grants." ✅ "Do not use the local DB to check grants — local grants drift **ADDITIVELY** (a `fix-local-grants` workaround re-grants blanket DML at every reset), so a grant appearing locally is NOT evidence it exists in production."
### For any task that locates a DB object's current definition, name EVERY supersession form
> "Trace EVERY form, not just the two function ones — `CREATE OR REPLACE FUNCTION <fn>(<arg types>)` AND `DROP FUNCTION … CREATE FUNCTION <fn>(<arg types>)`, sorted by migration timestamp prefix — a later migration may redefine via DROP+CREATE, which a `CREATE OR REPLACE`-only grep silently misses. Match the SIGNATURE and not just the name: an overloaded function has a different body per argument list, so a name-only search can land on an overload that is not the one under review, or on one that no longer exists. Same for `ALTER TABLE … DROP CONSTRAINT` + `ADD CONSTRAINT`, for `DROP INDEX` + `CREATE [UNIQUE] INDEX` (an `ON CONFLICT` arbiter or a replay branch is only reachable while its backing index exists), for `DROP TRIGGER <name> ON <table>` + `CREATE TRIGGER <name> … ON <table>` when the guard lives in a trigger rather than the body, for `ALTER FUNCTION <fn>(<arg types>)`, which changes `SET search_path` / `SECURITY DEFINER` in place while leaving the body untouched, and for `DROP POLICY` + `CREATE POLICY` — plus `ALTER POLICY <name> ON <table>`, which replaces `TO` / `USING` / `WITH CHECK` in place without recreating the policy, so a DROP/CREATE-only grep reports a stale predicate as current."
### Prefer executable verification over analysis
Write prompts that say **"execute / grep / diff and report the output"**, not "analyse and assess" — within what the target agent's own definition permits. plan-critic is read-only (`.claude/agents/plan-critic.md` § DO NOT), so its asks stay at grep / `git show` / `git diff`; only an agent allowed to run code gets asked to run it.
### A dispatch prompt states no derived number — it ships the derivation
A WORLD-STATE count, total or extent computed while writing the prompt is stale by the time the agent reads it, and the agent then reasons from your figure instead of from the tree. Same defect as `code-style.md` §10 cl.7, one artifact further out. Navigation aids are not claims — a path or a `lines ~X-Y` range tells the agent where to look, and is what the template's `CONTEXT:` section is for.
> ❌ "the corpus has 302 `expectRed` arrays — confirm each still renders"
> ✅ "run `node .claude/hooks/run-mutations.mjs --coverage` and report the count it prints"
### Litmus test
Before dispatching any subagent, ask: **"Could this agent execute end-to-end without a follow-up question?"** If no, add the missing context to the prompt.
### Parallel dispatch rule
When multiple subagents launch in parallel, each prompt must be self-contained. No prompt may depend on a sibling agent's output from the same batch.
### Failure logging
If a subagent returns a result indicating it lacked context (e.g., "file not found", "unclear which pattern"), log it as a delegation failure and improve future prompts:

```
DELEGATION FAILURE — [agent type] — [timestamp]
Missing: [what the agent needed but didn't have]
Fix: [what to include next time]
```

### Gate reviewer agent integration
For the gate's reviewer AGENTS, `.claude/agents/*.md` serve as the CONSTRAINTS and CONTEXT sections. The delegation template supplements with TASK, OBJECTIVE, and DONE WHEN — never duplicate the definitions.
### DO
- Use the 5-section delegation template for every subagent prompt.
- Log delegation failures and improve future prompts.
### NEVER
- Dispatch a subagent without all 5 template sections.
- Duplicate agent definition content in delegation prompts.
