# Agent Workflow — Pipeline & Orchestrator Rules

> How the orchestrator (Claude) plans, validates, and coordinates work.
> Per-agent handling rules are in separate `agent-*.md` files in this directory.

---

## Plan Validation Pipeline (runs BEFORE any code is written)

For any multi-file change, the orchestrator must validate the plan before executing it. This is where most defects are cheapest to catch.

```
User request
    │
    ▼
Explore (subagents map relevant code)
    │
    ▼
Root cause check (is the described fix the RIGHT fix?)
    │
    ▼
Requirement interview (if multi-file — skip conditions below)
    │
    ▼
Draft plan (files to change, approach, risks)
    │
    ├─► Impact analysis    ─ who calls/imports each file being changed?
    ├─► Contract check     ─ do existing tests assert behavior we're changing?
    ├─► Pattern scan       ─ does our approach match existing codebase patterns?
    ├─► Doc/schema check   ─ will docs become inaccurate after this change?
    └─► Security surface   ─ does this touch auth, RLS, answers, or input validation?
    │
    ▼
Validated plan (includes: affected files, test updates, doc updates, risks)
    │
    ▼
Plan-critic review — Multi-Round Discipline (skip for single-file < 10 lines)
    │
    ├─► coverage rounds (diverse lenses) ─► fix APPLY findings ─► reset clean counter
    ├─► stability rounds (same config, unchanged plan) ─► need N clean (2 / 3 security-path)
    └─► ceiling 4 total ─► if floor unmet ─► escalate to user (no further loop)
    │
    ▼
User approves → Execute
```

### Requirement Interview (runs AFTER root cause check, BEFORE drafting the plan)

After the orchestrator has explored the code and checked root cause, but before drafting the plan, surface any requirement ambiguities as explicit questions.

**Interview template** (3-5 questions covering):

1. **Scope boundaries** — "Is X in scope or out of scope for this change?"
2. **Behavioral ambiguities** — "When Y happens, should the system do A or B?"
3. **Priority trade-offs** — "The full solution involves X, Y, Z. Are all must-have, or can Z be deferred?"

**Auto-skip conditions** (interview is skipped when ANY of these apply):
- Single-file bug fix with clear reproduction path and single root cause
- User explicitly says "skip interview" or "no questions needed"
- Orchestrator identifies zero ambiguities after root cause analysis (must state which of the three interview categories — scope boundaries, behavioral ambiguities, priority trade-offs — were checked and found unambiguous)

**Answer incorporation:** Answers feed into the plan draft. If a spec exists (see Spec Artifact Rules), answers are recorded in the spec's requirements section.

**Default behavior:** The interview is on by default for multi-file changes. Skippable but never skipped silently — the orchestrator either asks questions or explicitly states no ambiguities.

### What each validation step does:

| Step | What to check | How | Blocker if... |
|------|--------------|-----|---------------|
| **Impact analysis** | Callers, importers, dependents of every file being changed | Explore agents: grep for imports/function usage | A caller relies on behavior you're about to change |
| **Contract check** | Test assertions, exported type contracts (types/interfaces callers depend on), Zod schema contracts (validators referencing changed types), and doc-asserted behaviors (docs/database.md) | Read `.test.ts` files, trace exported types/interfaces, check Zod schemas referencing changed types, read relevant doc sections | A test asserts a value you're changing, a TypeScript caller depends on a type you're restructuring, or a schema validator references a changed type |
| **Pattern scan** | How similar code is written elsewhere in the repo | Explore agents: find 2-3 similar files | Your approach diverges from established patterns |
| **Sibling file audit** | When updating a function that provisions users, seeds fixtures, or manages test records, find ALL functions with the same semantic purpose (e.g., all `ensure*User` helpers, all seed functions) and update them together | Grep for function name patterns, check all helper files | A sibling function is missed and breaks at runtime |
| **Gitignore placement** | Every NEW file under a root-level dir — confirm it is not silently ignored before choosing its path | Run `git check-ignore <path>` on each new file path | The path is ignored (exit 0). Root `/scripts/` is gitignored — put CI workflow helper scripts in `.github/scripts/`, dev hooks in `.claude/hooks/`, app/eval/seed scripts in `apps/web/scripts/` (note `apps/web/scripts/probe-*.py` is also ignored) |
| **Doc/schema check** | docs/database.md, docs/decisions.md, docs/plan.md | Read relevant doc sections | A doc table/matrix will become inaccurate |
| **Security surface** | Auth checks, RLS policies, answer exposure, input validation | Read docs/security.md + check against plan | Change touches security boundary without matching rules |

### Plan output format:
```
PLAN — [task description]

Files to change:
  - path/to/file.ts (lines ~X-Y) — what and why

Files affected (callers/tests/docs that need updates):
  - path/to/file.test.ts — update assertion from X to Y
  - docs/database.md — update soft-delete matrix row for table Z

Risks:
  - [specific edge case or known concern]

Validation:
  ✓ Impact: [N callers checked, no breaking changes / list conflicts]
  ✓ Contracts: [N test files checked, M need updates]
  ✓ Patterns: [matches existing pattern in file X / diverges because Y]
  ✓ Docs: [no drift / update needed in Z]
  ✓ Security: [not applicable / checked against rule N]
```

### Plan-Critic Review (runs AFTER plan validation, BEFORE user approval)

After the plan is validated but before presenting it to the user, run the plan-critic agent (sonnet) via the Agent tool.

**Inputs:** The validated plan text, plus the source files listed in the plan's "Files to change" and "Files affected" sections.

**Review rounds (Multi-Round Review Discipline — see `agent-critic.md`):** plan-critic is non-deterministic, so a single clean pass is not proof. Run *coverage rounds* (critics with distinct lenses, in parallel) to surface findings; fix APPLY-worthy findings (CRITICAL/ISSUE, or a SUGGESTION you choose to apply); then run *stability rounds* (same critic configuration, unchanged plan) until **N consecutive clean** rounds — **N=2** normally, **N=3** when the diff touches the Red-Team trigger path set (the plan's file list, or `git diff origin/master...HEAD --name-only` for diffs). Fetch and verify the base first (see § "Always diff against `origin/master`, never the bare local `master`" below) — an unresolvable base must ABORT, never be read as "no paths matched". Any APPLY finding resets the clean counter to 0; a validated skip-with-reason does not. **Ceiling: 4 total rounds** — if the floor is unmet at the ceiling, **escalate to the user** with the residual findings rather than loop (replaces unilateral orchestrator resolution for the ceiling case). Coverage rounds add breadth but do NOT count toward the consecutive-clean floor.

**Skip condition:** Single-file changes under 10 lines skip the plan-critic. The plan validation pipeline is sufficient for these.

**Timeout:** Proceed with a warning if the plan-critic takes over 60 seconds for plans covering up to 10 files, or over 120 seconds for plans covering more than 10 files. Post-commit agents remain as the safety net.

### DO
- Run validation for EVERY multi-file change. No shortcuts.
- Run the interview for every multi-file change unless auto-skip conditions apply.
- Run plan-critic on every multi-file plan before user approval.
- Include test updates in the plan, not as an afterthought.
- Use Explore agents for impact analysis — don't guess who calls a function.
- Block execution if a validation step reveals a conflict. Revise the plan first.

### NEVER
- Skip validation because the change "seems simple." Simple changes with wrong assumptions cause the biggest review cycles.
- Skip the interview silently — always state "No ambiguities identified" or present questions.
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
Bug fixes, single-file refactors, and changes touching fewer than 3 files. The plan validation pipeline above is sufficient for these.

### Spec lifecycle
1. **Created** during planning — captures requirements, approach, and file list.
2. **Updated** during implementation — deviations, decisions, and task progress recorded.
3. **Committed** with the feature branch — lives in `.spec-workflow/specs/<name>/`.
4. **Session resume context** — on session restart, the spec is the starting point, not chat history.

### Spec-as-context rule
When a spec exists for the current work, the orchestrator references it (not chat history) as the source of truth for requirements and plan.

### Deviation rule
After a spec reaches "approved" status, material changes to the approach require updating the spec and noting the deviation before implementing.

### MCP fallback
If the spec-workflow MCP is unavailable, write spec files manually to `.spec-workflow/specs/<name>/`, copying the structure of an existing spec under `.spec-workflow/specs/`.

### DO
- Create a spec for any feature spanning 3+ files or introducing a new pattern.

### NEVER
- Make material changes to an approved spec's approach without updating the spec.

---

## Post-Implementation Pipeline Order

```
Execute (subagents implement)
    │
    ▼
Implementation-critic review (always runs)
    │
    ├─► ISSUE ─► Implementer revises (max 2 rounds, then orchestrator takes over)
    ├─► CRITICAL ─► Orchestrator intervenes directly
    └─► Clean / SUGGESTION only
    │
    ▼
git commit
    │
    ├─► code-reviewer   (sonnet)  ─┐
    ├─► semantic-reviewer (sonnet) ─┤  parallel, wait for all 4
    ├─► doc-updater      (haiku)   ─┤
    └─► test-writer      (sonnet)  ─┘
                                     │
                              read ALL results
                                     │
                              validate findings (see below)
                                     │
                              fix validated issues (commit)
                                     │
                              ┌──────┴──────┐
                              │   learner   │  (sonnet) — pattern detection
                              └──────┬──────┘   (if learner promotes a rule
                                     │          to hard status, schedule a
                                     │          sweep per agent-learner.md
                                     │          § Sweep On Rule Promotion)
                                     │
                    (if diff touches security files)
                              ┌──────┴──────┐
                              │  red-team   │  (sonnet) — map diff to specs, flag gaps
                              └──────┬──────┘
                                     │
                         (if rules changed)
                              ┌──────┴──────┐
                              │coderabbit-  │  (haiku) — sync .coderabbit.yaml
                              │   sync      │
                              └──────┬──────┘
                                     │
                              ┌──────┴──────┐
                              │ update spec │  tasks.md: [ ] → [x]
                              │  (if spec)  │
                              └─────────────┘
```

### Pre-Commit Implementation Review (runs AFTER execution, BEFORE git commit)

After subagents complete implementation but before committing, run the implementation-critic agent (sonnet) via the Agent tool.

**Inputs:** `git diff --staged`, the validated plan, and the requirements (from the spec if one exists, or from the plan output).

**Revision flow:**
- **ISSUE** — the implementing agent revises. Maximum 2 revision rounds between critic and implementer.
- **CRITICAL** — the orchestrator intervenes directly (no implementer revision).
- After 2 unsuccessful revision rounds, the orchestrator takes over resolution to prevent infinite loops.

**No skip condition.** Even single-file changes get implementation review. The plan-critic is what gets skipped for small changes, not the implementation-critic.

**Timeout:** Proceed with a warning if the implementation-critic takes over 90 seconds for diffs under 500 lines. Post-commit agents remain as the safety net.

### Red-Team Agent Trigger (conditional)

After the learner, check if the commit diff includes any of these paths:
- `supabase/migrations/**`
- `packages/db/src/**`
- `apps/web/app/app/quiz/actions/**`
- `apps/web/app/auth/**`
- `apps/web/proxy.ts`
- `docs/security.md`

If yes, run the red-team agent (sonnet). It maps changes to red-team specs and flags coverage gaps. If it reports affected specs, run `pnpm --filter @repo/web e2e:redteam` to verify defenses still hold.

## Pre-Push PR Sweep (MANDATORY for multi-commit PRs)

Before pushing a branch with 2+ commits, run a **PR-level semantic review** against the full diff:

```bash
git diff origin/master...HEAD
```

This catches cross-file consistency issues that per-commit reviews miss:
- Test assertions not matching production code changed in a different commit
- Doc matrices inconsistent with schema changes from earlier commits
- Fallback values or error handling patterns introduced across separate commits

Run semantic-reviewer (sonnet) with the full PR diff as input, not just `HEAD~1..HEAD`.
This is what CodeRabbit sees — our agents must see it too.

## Always diff against `origin/master`, never the bare local `master`

Every diff base in this repo's tooling is `origin/master`, not `master`. The local `master`
ref only moves when something explicitly fast-forwards it, so it is routinely stale — and a
stale base does not error, it silently **distorts** the diff. A local `master` that lags
`origin/master` yields an older merge-base, so `master...HEAD` usually reports a **superset** of
the real change: already-merged files appear as if this branch wrote them. Everything derived
from that diff inherits the distortion:

- the **PR-level sweep** above reviews already-merged code, wasting a round and producing
  findings on code this PR never wrote;
- **CR-local** (`agent-coderabbit-local.md`) reviews against the wrong base, spending rounds
  on out-of-scope files;
- **`/endrun`** writes an inflated commit count, diff stat, and span permanently into
  `.claude/run-log.md`;
- the **security-path stability floor** (`agent-critic.md`) is derived from the changed-path
  set, so an inflated set can raise N=2 to N=3 — costing an extra round. **Staleness is NOT safe
  in one direction only: it can also HIDE a security path.** A stale base is a superset of the
  COMMIT range, not of the CONTENT change — so if this branch REVERTS a change that landed
  upstream after the stale ref, the file is identical at the stale merge-base and at HEAD and
  drops out of the diff entirely. Verified: with `sec.txt` changed A→B upstream and the branch
  reverting B→A, the true base lists `sec.txt` while the stale base lists nothing. The floor
  then silently reads N=2 and `/fullpush` 7b skips the MANDATORY red-team run — the same
  fail-open this section forbids below, reached by a different route. Never assume staleness is
  safe in EITHER direction. (Under-deriving the floor also has a separate cause — see below.)

Promoted at learner count=2 (issue #1134). Second occurrence, 2026-07-23: local `master` sat 2
commits behind `origin/master`, so `master...HEAD` read 18 files / 1492 lines instead of the
real 8 / 832, inflating both the sweep scope and the derived path set. Caught by plan-critic,
not by any mechanical gate — there is no gate for this.

**Do not confuse this with under-deriving the floor.** In that same plan the floor was also
briefly set to N=2 when it should have been N=3 — but that was a *separate* mechanism: the
floor was read from semantic intent ("these are only dependency bumps") instead of
mechanically globbing the changed-path list, which contained `packages/db/src/schema.test.ts`.
Staleness inflates; semantic derivation under-reports. Fixing one does not fix the other.

**Do NOT "solve" this by fast-forwarding local `master` as a pre-step.** `git fetch origin
master:master` is *refused* whenever `master` is checked out in ANY worktree (this repo runs
several, and `/automerge` leaves the main checkout on `master` after every merge), and it is
also refused on a non-fast-forward when local `master` carries un-merged commits. Use
`origin/master` in the revision expression instead — it carries no worktree hazard and never
requires moving a local branch.

**Pick the right range form; they are NOT interchangeable.** Use **three-dot** `origin/master...HEAD`
for any *diff* — it compares HEAD against the merge-base, which is the PR's own scope. Two-dot
`git diff origin/master..HEAD` compares the two TIPS, so once master advances past the fork point it
also reports upstream changes this branch never made. Use **two-dot** `origin/master..HEAD` only for
*commit enumeration* (`git log`, `git rev-list --count`), where it correctly means "commits reachable
from HEAD but not from the base". `/endrun` relies on exactly this split.

**Both forms still need a freshly fetched, verified base.** A ref that has fallen BEHIND the fork
point inflates both (three-dot moves the merge-base back; two-dot starts admitting commits this
branch never authored). Do not rely on either form being self-protecting — fetch, then verify.

**`git fetch origin` first — every time, not just for third-party tools.** `origin/master` is
itself a local ref that only advances on fetch, so it goes stale exactly like `master` does,
just more slowly. A stale `origin/master` reintroduces the same inflation (older merge-base ⇒
already-merged paths in the diff). Fetch is cheap and has no worktree hazard — unlike moving
local `master`, which is what you must never do.

**Fail closed on an unresolvable base — or a failed fetch.** If `git fetch origin` itself fails,
`origin/master` usually stays RESOLVABLE at its old value, so a resolvable-ref check alone does not
catch it: treat a failed fetch as a hard stop in its own right. **Abort on a non-zero EXIT CODE
from fetch, base resolution, or the diff command — NOT on an empty result.** A successful
`git diff` that returns zero paths is a legitimate no-op (the branch changed nothing matching)
and must proceed, matching no conditional; only a command that *errored* (non-zero exit) means
the scope is unknown. Conflating the two is itself a bug in both directions: aborting on a valid
empty diff blocks legitimate work, and proceeding on an errored diff fails OPEN — the mandatory
red-team run (`/fullpush` step 7b) is skipped and the security-path floor silently drops from
N=3 to N=2. Resolve and validate the base first, capture the changed-file list once with its
exit code checked, and branch on the exit code — never on whether the list is empty.

If a third-party tool genuinely requires a local branch name, run `git fetch origin master`
first and ABORT if it fails; then compare `git rev-parse master origin/master` and **hard-stop
if they differ or either fails to resolve** — do not merely report the mismatch and proceed.
Only invoke the tool once the base is proven current. Never let it run against an unverified base.

## Finding Validation (MANDATORY before fixing)

When a reviewer flags an ISSUE or CRITICAL, do NOT immediately edit code. Validate first:

1. **Analyze the claim** — Is the reviewer correct? Think about domain logic, not just code patterns. Reviewers can produce false positives.
2. **Check implications** — If you apply the suggested fix, what callers/tests/docs break? Read the affected code.
3. **Decide** — Is this a real issue, a false positive, or a valid concern that needs a different fix than suggested?
4. **If the fix changes the plan** — Re-validate the changed parts before implementing.

Only then fix. This is a closed loop: `finding → validate → fix → re-validate if plan changed`.

## Apply-vs-Defer Discipline (MANDATORY before push)

> **Default: apply. Defer is the exception.** Sort everything on the local machine before pushing. Don't push with a queue of unfinished business.

The orchestrator drifts toward deferral when a PR feels "almost done" — every deferral is locally rational ("it's separate scope," "it's just additive coverage") but in aggregate they grow an invisible backlog of TODO-eventually that ages and rots. The rules below close that drift.

### When to APPLY (default — most cases)

Apply the finding inline when ANY of these hold:

- **< 30 LOC and same-pattern-as-existing-code.** Adding entries to a payload table, swapping a config value the codebase already exposes, mirroring a sibling spec's afterEach pattern, etc.
- **You already have the context loaded.** If you're in the file or the surrounding feature, fix it now. Re-loading context later is more expensive than the fix.
- **The finding is from CR local, semantic-reviewer, plan-critic, or impl-critic — and would otherwise be triaged on the PR after CI.** Pre-push triage is always cheaper than post-push triage.
- **The finding addresses a project-rule violation** (`code-style.md`, `security.md`, `agent-*.md` rules). Rule violations are not deferrable — fix or document the exception.

### When to DEFER (exception — requires all three)

Only file a GitHub Issue and defer when **every one** of these is true:

1. **≥ 30 LOC** estimated total (code + tests + docs).
2. **Genuinely separate concern** — different feature area, different threat model, different RPC family. The work could stand on its own as a coherent PR.
3. **Requires a design decision** the current PR doesn't establish, OR involves a system the orchestrator hasn't loaded context for.

If any of those is false, apply.

### Defer-budget per PR

- **0 deferrals** is the goal.
- **1-2 deferrals** is acceptable when each one genuinely meets the three-condition test above.
- **3+ deferrals** is a red flag — recheck triage. The PR scope was probably wrong (either too narrow → expand and apply some, or too broad → split). Re-evaluate every deferral before filing.

### What every deferred issue must include (no silent backlog growth)

If you file a deferral, the issue body must contain:

- **Effort estimate** — S (< 30 LOC) / M (30-150 LOC) / L (150+ LOC).
- **Priority** — P0 (security/correctness blocker) / P1 (important) / P2 (nice-to-have).
- **Acceptance criteria** — a developer should be able to start the work without re-reading the original CR comment or chat history.
- **Source link** — the originating finding (CR comment URL, semantic-reviewer report, etc.) so the rationale is recoverable.

If you can't articulate effort + priority + acceptance now, you can't articulate them later either — the issue will rot. Either pay the small cost to fill them in, or apply the fix.

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

## PR Batching — Combine Issues Aggressively (MANDATORY for multi-issue runs)

> **The full pipeline cost is PER-PR, not per-issue.** impl-critic + the 4–5 post-commit agents + PR-level semantic sweep + multi-round CR-local each run once per PR, at 1–15 min per subagent. A one-issue PR pays that entire fixed cost for a single change. Ten one-issue PRs = 10× the overhead; one PR of ten issues = 1×.

When a run spans multiple issues (`/automerge`, `/autonomerge`, any batch), the orchestrator's FIRST planning act is to group the issue list into the **fewest coherent PRs** — never one-per-issue.

### How to group
- **By nature:** all test-only red-team/integration specs together; all mechanical/rule/config chores together; related production changes together.
- **Target ~3–8 issues per PR** when they are test-only or mechanical. Do all edits across the combined issues FIRST (parallel subagents on non-overlapping file sets), then run the pipeline ONCE on the whole branch.
- **Split only for a real merge-gate reason:** a production change needing manual eval must not ride with auto-mergeable test-only work; a migration PR stays separate (auto-deploys on merge); a change that must land independently for rollback safety.

### Batch the fixups too
Collect ALL findings from ALL post-commit agents/reviewers, then make **ONE fixup commit** — not one commit per finding. Each fixup commit re-triggers the review cycle, so per-finding commits multiply the cost the batching is meant to avoid.


### Anti-pattern (what this rule exists to stop)
One issue → one branch → full pipeline → merge → repeat. It makes a multi-issue run crawl. If you catch yourself opening a PR that closes a single issue during a batch run, stop and ask what else belongs on that branch. (User directive 2026-07-02, mid-`/automerge` batch: "why the fuck one test in the whole PR? combine combine combine.")

---

## Push Batching — a push is NOT free (MANDATORY)

> **Every push costs a full CI run (~30 min wall clock: E2E, Red Team, Integration, Migration Test,
> Lighthouse, CodeQL, SonarCloud) PLUS one cloud CodeRabbit review** against quota and rate limits.
> The cost is in the PIPELINE, not the diff. A one-line doc fix and a 900-line migration cost the
> same to push.

`PR Batching` above governs how many ISSUES go in a PR. This governs how many times you PUSH that
PR. They are different mistakes and this one is easier to make, because each individual push feels
justified.

### The rule

- **Batch every pending change into ONE push.** Before pushing, ask: *is anything else nearly
  ready?* If yes, finish it first. A second push five minutes later doubles the CI bill and burns a
  second cloud review on a diff the first review had already mostly seen.
- **After pushing a fix for cloud-CR findings, STOP committing to that branch** until the new review
  returns. Anything you commit meanwhile either rides an extra cycle or sits unpushed anyway.
- **Never push a docs-only, config-only or process-only follow-up onto an open PR** unless it is
  required for THAT PR to become mergeable. Park it: commit it on a separate branch and push when
  something else needs CI anyway.
- **"It's just a doc fix" is the trap.** Diff size is not the cost. If the change does not move this
  PR toward merge, it does not justify a pipeline run.
### Anti-pattern (what this rule exists to stop)
Push the CR fix → notice a doc nit → commit it → push again → full CI + a second cloud review, for
a change that could not have affected mergeability. Observed 2026-08-09 on PR #1174, one push after
the previous one, user directive: *"we are wasting now 30 minutes of time with the full CI rerun…
this is nonsense."* The correct move was to hold the process commit on its own branch and let the
already-running pipeline finish.

### Interaction with the docs-before-push rule

`/fullpush` step 7b requires docs, rules and mirrors to be committed BEFORE the push. That is the
same coin: get them in the FIRST push so there is no second one. "Docs land pre-push" and "don't
push twice" fail together — a doc update discovered after the push is exactly what tempts the
second pipeline run.



---

## Rule-Mirror Sync — restatements across the mirror set (MANDATORY on rule edits)

When a commit modifies a rule in `.claude/rules/*.md` or `CLAUDE.md`, update every stale restatement **in the same commit**. Command, agent-definition and skill files routinely paraphrase pipeline rules (review-round discipline, pre-commit gate lists, trigger sets); a rule change that skips them leaves an agent following the superseded text the next time that command, subagent or skill runs.

**The mirror set is these seven** — enumerate it, do not recall it from memory. Six are fixed paths (four directory globs plus two single files — `docs/security.md` and `.coderabbit.yaml`, which are easy to drop if you glob only the directories); the seventh is the open-ended one, and it is the one that keeps being missed:

| Mirror | Why it holds inline text |
|---|---|
| `docs/security.md` | the binding reference |
| `.claude/rules/*.md` | `security.md` is the auto-injected quick summary |
| `.coderabbit.yaml` | CodeRabbit cannot follow a pointer |
| `.claude/agents/*.md` | `security-auditor.md` is the BLOCKING pre-push gate — a stale checklist there emits false CRITICALs |
| `.claude/commands/*.md` | slash commands restate gate lists |
| `.claude/skills/*.md` | skills are loaded as write-time guidance |
| any OTHER binding doc that re-states the mechanics — notably `docs/database.md` | not a rule file, so no enumeration reaches it; `docs/database.md` §7 *describes what the security-auditor flags*, and `CLAUDE.md § Key docs` makes it binding. This row is a CLASS, not a path — enumerate it by asking "what else asserts this claim?", never by grepping the six paths above |

How to apply: **grep is a FIRST PASS, not the sweep.** Grep the six fixed paths for the rule's distinctive phrases — then find the seventh by READING, not grepping, since it has no path to glob — both the OLD wording being replaced and the rule's key terms. But a phrase-grep cannot find a *paraphrase*, so it reports false-clean: when a change retires a **claim** rather than a string, also read the affected section and its mirrors end-to-end once. Precedent (PR #1174): grepping "read AND write policies" found 3 hits and looked clean; four further review rounds surfaced the same claim as `USING + WITH CHECK`, `USING without WITH CHECK`, `UPDATE requires BOTH`, and `policies blocking UPDATE and DELETE`. A restatement that merely *points* to the rule file needs no edit; one that *re-states* the mechanics must be updated or reduced to a pointer.

**The enumeration itself is the recurring defect.** On PR #1174 this list was wrong three rounds running: it omitted `.claude/commands/` (round 3 — its own directory), then `.claude/skills/*.md` (round 4), then `docs/database.md` (round 5, found by implementation-critic, and the reason the seventh row exists). Each time the fix corrected the instance and left the count. Treat "the list is complete" as the claim most likely to be false, and when a sweep finds a surface the table does not name, widen the TABLE in the same commit — not just the file.

Promoted at count=2 (2026-07-11 pipeline audit #1110): `plan-critic.md` carried the superseded 1-revision-round discipline (C1), and `automerge.md`/`wrapup.md` carried the same class of stale restatement caught by batch-3 reviewers — two distinct commits' worth of drift, each requiring a fixup cycle that a same-commit grep would have prevented. Scope widened to .claude/agents/ same-day (CR-local): the C1 instance WAS an agent-definition file (plan-critic.md), so agent defs are in the same drift class.

---

## Orchestrator Role

- **You plan and review. Agents execute.**
- Read every agent result before proceeding. No fire-and-forget.
- If an agent found an issue, validate it first, then address it before moving on.
- Group related fixes into a single commit when possible.
- After fix commits that change production code, re-run semantic-reviewer on the new diff.
- Repeat until all agents report clean.

### DO
- Run implementation-critic on staged changes before every commit.
- Launch all 4 post-commit agents in parallel immediately after every commit.
- Read all results before starting any fixes.
- Validate every ISSUE/CRITICAL finding before fixing — analyze the claim, check implications.
- Report findings to the user in a summary table: agent / severity / count / status.
- Report ALL severity levels — not just criticals.
- Re-run agents on fix commits if production code changed.
- Create tasks via TaskCreate for features with 5+ steps.
- After all agents report clean, update `tasks.md` in the active spec (`[ ]` → `[x]`) for every completed task. This is the last step before moving on.

### NEVER
- Skip implementation-critic, even for small changes.
- Allow more than 2 revision rounds between critic and implementer.
- Skip post-commit agents. Ever. Not even for "trivial" commits.
- Start fixing after only one agent reports — wait for all 4.
- Fire-and-forget agents without reading results.
- **Jump to fix a reviewer finding without first validating the claim.** Reviewer says ISSUE ≠ automatically correct.
- Present "0 critical" as if that means clean — report every severity.
- Push with any unresolved CRITICAL, BLOCKING, or ISSUE finding.
- Push with failing tests.
- Characterize findings as "latent", "safe today", or "forward-looking" to justify skipping them.
- Start a new session on in-progress work without checking TaskList first.
- Finish a task without updating `tasks.md` in the spec — the dashboard shows 0% for completed work otherwise.

---

## Task Persistence

Track multi-step work across session restarts using persistent tasks.

### When to create tasks
Features with **5+ discrete implementation steps**. Use `TaskCreate` for each step with a clear title and description.

### Task lifecycle
1. **`pending`** — created during planning, before execution begins.
2. **`in_progress`** — set via `TaskUpdate` when work on that step begins.
3. **`completed`** — set via `TaskUpdate` when the step passes review.

### Session resume protocol
When a new session begins and the developer asks to resume work, run `TaskList` before exploring the codebase. Outstanding tasks provide the starting context — no need to re-read chat history.

### Completion reporting
When all tasks for a feature are `completed`, report a summary to the developer covering what was done, what was deferred, and any outstanding concerns.

### Threshold
Below 5 steps, task creation is optional (orchestrator's discretion). Simple changes tracked via the plan are sufficient.

### Fallback
If `TaskCreate`/`TaskUpdate`/`TaskList` are unavailable, track tasks in session summary text and use the spec's `.spec-workflow/specs/<name>/tasks.md` as the resume starting point instead of `TaskList`.

### DO
- Create tasks via TaskCreate for features with 5+ steps.

### NEVER
- Start a new session on in-progress work without checking TaskList first.

---

## Proactive Engineering Guidance (MANDATORY)

The user is learning software engineering. Claude must proactively flag non-obvious consequences before they become tech debt. This is not optional — silent execution of a bad process is worse than pausing to explain.

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

### State the MECHANISM behind a constraint, not just the prohibition

A bare prohibition invites the agent to reason around it, because it has no way to tell a
load-bearing rule from an arbitrary one. Give the cause.

> ❌ "Do not use the local DB to check grants."
> ✅ "Do not use the local DB to check grants — local grants drift **ADDITIVELY** (a
> `fix-local-grants` workaround re-grants blanket DML at every reset), so a grant appearing
> locally is NOT evidence it exists in production."

Learner-proposed remedy, 2026-08-09 — NOT a count=2 promotion. The tracker records the two
instances behind it (local-grant evidence; a review-only agent writing to memory) as separate
count-1 WATCHING rows, and the learner proposed this wording as the fix for both. Stated here as
guidance rather than a promoted rule; it graduates if either row recurs. The first form was
actually issued, and a critic reasoned past it by inventing a theory that drift is *subtractive* —
therefore local presence must be genuine evidence. Backwards, and it produced a CRITICAL finding argued from the weakest
available source. The same gap explains a review-only agent writing to its memory file: the
CONSTRAINTS said what was forbidden without saying why the habit fires.

### For any task that locates a DB object's current definition, name BOTH supersession forms

> "Trace BOTH `CREATE OR REPLACE FUNCTION <fn>` AND `DROP FUNCTION … CREATE FUNCTION <fn>`,
> sorted by migration timestamp prefix — a later migration may redefine via DROP+CREATE, which a
> `CREATE OR REPLACE`-only grep silently misses. Same for `ALTER TABLE … DROP CONSTRAINT` +
> `ADD CONSTRAINT`, and for `DROP POLICY` + `CREATE POLICY` — plus `ALTER POLICY <name> ON
> <table>`, which replaces `TO` / `USING` / `WITH CHECK` in place without recreating the policy,
> so a DROP/CREATE-only grep reports a stale predicate as current."

Promoted at learner count=2 (2026-08-09). In one cycle an Explore agent reported a superseded
migration as latest, a subagent flagged a table whose policy had been dropped twice, a spec cited a
constraint re-emitted twice since, and the orchestrator made the same error twice in its own
migration header. Note this is also how the bug that cycle FIXED was introduced: a human added
role-gated policies without accounting for the pre-existing `FOR ALL` policy. The codebase's
append-only, mutation-by-supersession shape produces this error in whoever reads it.

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

### Post-commit agent integration
For post-commit agents (code-reviewer, semantic-reviewer, doc-updater, test-writer), the existing agent definition files (`.claude/agents/*.md`) serve as the CONSTRAINTS and CONTEXT sections. The delegation template supplements with TASK, OBJECTIVE, and DONE WHEN — it does not duplicate the definitions.

### DO
- Use the 5-section delegation template for every subagent prompt.
- Log delegation failures and improve future prompts.

### NEVER
- Dispatch a subagent without all 5 template sections.
- Duplicate agent definition content in delegation prompts.

---

*Per-agent rules: `agent-code-reviewer.md`, `agent-semantic-reviewer.md`, `agent-test-writer.md`, `agent-doc-updater.md`, `agent-learner.md`, `agent-security-auditor.md`, `agent-red-team.md`, `agent-coderabbit-sync.md`, `agent-coderabbit-local.md`, `agent-critic.md`, `agent-memory.md`*

*Last updated: 2026-08-09 (added § Delegation Protocol — state the mechanism behind a constraint, and name both supersession forms. Prior: 2026-07-23 (added § Always diff against `origin/master`, never the bare local `master` — learner count=2, #1134; converted every bare-`master` diff base in this file)*
