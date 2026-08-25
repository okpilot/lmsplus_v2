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
Plan-critic review — ONE run (skip for single-file < 10 lines)
    │
    ├─► fix APPLY findings ─► proceed. No rounds: a plan is prose, and rounds on
    │   prose do not converge (agent-critic.md § Model tier, 2026-08-24)
    └─► an ISSUE or CRITICAL the orchestrator cannot resolve ─► STOP, hand off
        to the user (§ "One run, not rounds" below; § NEVER forbids executing
        with either one open — not CRITICAL alone)
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

**One run, not rounds (2026-08-24).** plan-critic runs **ONCE**. Fix its APPLY-worthy findings (CRITICAL/ISSUE, or a SUGGESTION you choose to apply) and proceed; an ISSUE or CRITICAL the orchestrator cannot resolve escalates to the user rather than triggering another round — both, because § NEVER forbids executing with either still open. If the plan is redrafted so heavily that it is a different plan, that redraft gets its own single run. The **Multi-Round Review Discipline** (`agent-critic.md`) — coverage rounds, the consecutive-clean floor, the 4-round ceiling — governs the post-commit **semantic-reviewer** / **code-reviewer** only, and no longer plan-critic: a plan is prose, an LLM returns non-empty on almost any prose, and the findings that mattered came from critics reading CODE. See `agent-critic.md § Model tier`.

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
    ├─► docs-only commit? ────────────► doc-updater ONLY ──────────┐  (no learner pass)
    │     (docs/**/*.md EXCEPT docs/security.md, root *.md         │
    │      except CLAUDE.md,                                       │
    │      .claude/agent-memory/**, .claude/run-log.md)            │
    │                                                             │
    ├─► review-follow-up commit? ─────► semantic-reviewer ONLY ────┤  (no learner pass)
    │     (ALL must hold: the PARENT ran the FULL cycle and        │
    │      claimed NO exemption — so a reduced path cannot         │
    │      chain off another; every hunk traces to a finding from  │
    │      its own parent's cycle; same files as the parent;       │
    │      adds no new file; <= 20 changed lines outside tests     │
    │      AND <= 60 inside them;                                  │
    │      no security path, rules file, migration, CI/hook/config)│
    │                                                             │
    └─► otherwise — the FULL cycle:                                │
        ├─► code-reviewer   (sonnet)  ─┐                           │
        ├─► semantic-reviewer (sonnet) ─┤  parallel, wait for all 4│
        ├─► doc-updater      (haiku)   ─┤                          │
        └─► test-writer      (sonnet)  ─┘                          │
                                     │                             │
                              read ALL results                     │
                                     │                             │
                              validate findings (see below)        │
                                     │                             │
                              fix validated issues (commit)        │
                                     │                             │
                    ┌────────────────┴────────────────┐            │
                    │ that fix commit RE-ENTERS at    │            │
                    │ `git commit` above — on the     │            │
                    │ review-follow-up path when it   │            │
                    │ qualifies, else the FULL cycle. │            │
                    │ Loop (bounded by the stop rule) │            │
                    │ until no agent has an open      │            │
                    │ finding; only THEN the learner. │            │
                    └────────────────┬────────────────┘            │
                                     │                             │
                              ┌──────┴──────┐                      │
                              │   learner   │  (sonnet) — pattern  │
                              └──────┬──────┘   detection. FULL    │
                                     │          cycle only — the   │
                                     │          reduced paths skip │
                                     │          it entirely.       │
                                     │          (if it promotes a  │
                                     │          rule, schedule the │
                                     │          sweep per          │
                                     │          agent-learner.md)  │
                                     │◄────────────────────────────┘
                                     │  (reduced paths rejoin HERE — after the
                                     │   learner, not before it)
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

Local `master` only moves when something fast-forwards it, so it is routinely stale — and a stale
base does not error, it silently DISTORTS the diff. Everything derived from it inherits the
distortion: the PR-level sweep reviews already-merged code, CR-local spends rounds on out-of-scope
files, `/endrun` writes an inflated commit count, and the security-path floor is misderived.

**Staleness is not safe in one direction.** It usually over-reports (older merge-base ⇒ a superset
of the change), but it can also HIDE a security path: if this branch REVERTS a change that landed
upstream after the stale ref, the file is identical at both ends and drops out of the diff entirely.
The floor then reads "no security path" and `/fullpush` 7b skips the MANDATORY red-team run.

**Pick the right range form — they are NOT interchangeable.** Three-dot `origin/master...HEAD` for
any DIFF (compares against the merge-base = the PR's own scope). Two-dot `origin/master..HEAD` only
for COMMIT ENUMERATION (`git log`, `git rev-list --count`). Both still need a freshly fetched base.

**`git fetch origin` first, every time.** `origin/master` is itself a local ref that only advances
on fetch.

**Fail closed on an unresolvable base — or a failed fetch.** A failed fetch usually leaves
`origin/master` RESOLVABLE at its old value, so a resolvable-ref check alone does not catch it.
**Abort on a non-zero EXIT CODE from fetch, base resolution, or the diff — NOT on an empty result.**
A successful diff returning zero paths is a legitimate no-op and must proceed; only an errored
command means the scope is unknown. Conflating the two fails in both directions, and the
proceed-on-error half fails OPEN.

**Do NOT "solve" this by fast-forwarding local `master`.** `git fetch origin master:master` is
refused whenever `master` is checked out in ANY worktree (this repo runs several) and on a
non-fast-forward. Use `origin/master` in the revision expression instead.

If a third-party tool genuinely requires a local branch name, run `git fetch origin master`, ABORT
if it fails, compare `git rev-parse master origin/master`, and **hard-stop if they differ or either
fails to resolve** — do not merely report the mismatch and proceed.

**Do not confuse this with under-deriving the floor.** Staleness inflates; deriving the floor from
semantic intent ("these are only dependency bumps") instead of mechanically globbing the changed-path
list under-reports. Fixing one does not fix the other.

## Finding Validation (MANDATORY before fixing)

When a reviewer flags an ISSUE or CRITICAL, do NOT immediately edit code. Validate first:

1. **Analyze the claim** — Is the reviewer correct? Think about domain logic, not just code patterns. Reviewers can produce false positives.
   - **Verify the FACTUAL premise directly before scoping any work around it — especially a new code path.** Some claims are cheap to check and expensive to assume; check them rather than reasoning about them (learner count=3, 2026-08-15):
     - *"production is in state X"* → probe production read-only. A reviewer asserted prod still served a stale answer key; a new production-WRITE code path was designed around it; a read-only probe then showed prod already matched the file. The whole justification was fiction, and nobody had looked. **Bounded, and read-only in fact and not merely in intent:** use the approved procedure (a probe script reading the token and POSTing to the Management API — see the `reference-prod-readonly-db-access` note), SELECT only, narrowed to the specific rows the claim is about, and never `SELECT *` on a table holding student answers or personal data. Report aggregates or the single disputed field — do not paste student rows into the transcript. If answering the claim would need a WRITE, a schema change, or a wide read over personal data, STOP and ask the user instead: the point of this step is to cheaply falsify a premise, and a probe that itself needs justifying is no longer cheap.
     - *"this file is new"* / *"+N tests"* → `git diff --stat` and `git log --diff-filter=A`. A claimed-new file with "+18 tests" was a MODIFIED file whose real delta was 8.
     - *"function A calls B"* / *"the siblings all do X"* → grep the call sites or read `pg_proc.prosrc`. A doc claimed a function called `normalize_answer`; it never has.
     - *"a critic/reviewer told me X"* → verify X yourself before repeating it in a commit message,
       a plan, or a rule. A critic's claim is evidence that it believed something, never that the
       code does it. Precedent: `3a50780a`'s commit message states "impl-critic confirmed that pair
       is exhaustive: `createClient<` matches exactly those two call sites" — `packages/db/src/admin.ts:13`
       is a third. The enumeration was scoped to *scripts* and correct there; the unqualified
       repo-wide restatement was not, and it is now permanent in the history.
     - *"this changed the failure mode"* → read the OLD body. A CR finding said a helper turned an abort into a silent wrong answer; the old code coalesced identically and never aborted. (The conclusion — a parity gap — was still right, but for an entirely different reason, and acting on the stated mechanism would have produced the wrong fix.)
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

### Defer-budget per PR — TWO checks, both binding

Volume catches a PR that defers a lot; ratio catches one that hands back as much as it takes.
Neither subsumes the other — a PR passes only if it clears both.

**Check 1 — volume.** 0 deferrals is the goal; 1-2 is acceptable when each meets the three-condition
test; 3+ is a red flag — re-triage every survivor and name them in the push summary.

**Check 2 — ratio.** Compare once, before push. If **filed > 0 AND filed >= closed**, the PR did not
reduce the backlog and needs a written justification.

- **"Filed"** = every issue the branch author created after the merge-base, whatever its origin
  (deferral, split, leftover — all count; the check measures BACKLOG DELTA). The PR body's
  `## Deferred` section is the authoritative list and is MANDATORY on any PR that files an issue.
  On a first push, run the check against the draft body.
- **"Closed"** = the issues this PR's `Closes #N` / `Fixes #N` will actually close.
- Enumerate with the merge-base TIMESTAMP, not its date (a bare date is day-granular and over-reports).
  `git fetch origin` first, ABORT if it fails, then:
  `gh issue list --state open --limit 200 --search "author:@me created:>=$(git log -1 --format=%cI $(git merge-base origin/master HEAD))"`
  `--limit 200` is load-bearing: `gh` defaults to 30 and exits 0 on a truncated list, so a silent
  under-count PASSES a check that should fail. If it returns exactly 200, treat it as truncated and
  raise the bound. `author:@me` is the `gh`-authenticated account, not the commit author — under a
  different login `filed` under-counts, same fail-open. `--state open`, not `--state all`.

**First-illumination exemption — the only accepted justification, evidence required, once per area.**
A PR first to look hard at a neglected area will surface more than it closes. Name the path set and
paste the output of steps 1-3:
1. `git log --oneline -- <paths>` — must be NON-empty (proves the pathspec resolves).
2. `git log --since=6.months.ago --oneline | head -1` — repo-wide, no pathspec — must be NON-empty
   (proves the date expression parsed). Both halves are needed: step 3's EMPTY result is the pass
   condition, so anything that makes a log spuriously empty silently GRANTS the exemption, and git
   exits 0 with no diagnostic on a malformed `--since`.
3. `git log --since=6.months.ago --format=%h -- <paths> | xargs -r -n1 git show --stat --format='%h %s'`
   — must list no substantive commit (not docs-only or agent-memory-only). Same date expression as
   step 2, same paths as step 1. `--oneline`/`--name-only` cannot answer this: docs-only is a
   property of the WHOLE commit while every command here is pathspec-filtered.
4. No open issue targeted those paths at branch cut — a judgment call; state which you checked.

Record it in the PR body as `first-illumination: <path set>`. A later PR into overlapping paths finds
it via `gh pr list --state merged --search '"first-illumination" in:body'` — a coarse filter that
still needs a human read. Treat a shared directory as the same area.

Otherwise re-triage: the fix is usually to APPLY two or three deferrals, not to argue for them.

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

## PR Batching — Split by Risk Surface; Combine Only Like-for-Like (MANDATORY)

> **Two costs pull in opposite directions, and the old rule only counted one of them.**
> The pipeline cost is PER-PR: impl-critic, the post-commit agents, the PR-level sweep and the
> CR-local rounds each run once per PR, so ten one-issue PRs pay that fixed cost ten times. But the
> REVIEW cost is per RISK SURFACE, and it is not linear — past a certain diff, rounds stop
> converging and each one surfaces new criticals in sections an earlier round already passed.
> An extra PR costs a BOUNDED, predictable ~30 min of CI plus one cloud review. A non-convergent
> review loop costs an UNBOUNDED amount. Optimise against the unbounded one.

**Default: SPLIT.** Group work into the fewest PRs that each carry **one merge gate and one risk
surface** — not the fewest PRs overall. Superseded 2026-08-24 (user directive): the prior default,
"combine aggressively / fewest coherent PRs", keyed on ISSUE COUNT, which is the wrong variable.

### Hard split triggers — each forces its own PR
- **Migration work.** It auto-deploys to the production database on merge, so it is user-gated anyway.
  The gate is per-PR, not per-file: migrations that deploy together may share one PR — what must not
  ride along is the NON-migration work, which would otherwise be held behind a prod-deploy approval.
- **A security path** (the `§ Red-Team Agent Trigger` set). It raises the post-commit reviewer floor
  to N=3 and the CR-local floor to M=3, and it makes the red-team run mandatory; do not make
  unrelated work pay those rounds.
- **A change that supersedes an issue's stated acceptance criteria.** That needs its own argument in
  its own PR body, where a reviewer can find it.
- **A shared component whose change fans out to several surfaces.** The blast radius, not the diff
  size, is what reviewers must hold in their heads at once.

### Still COMBINE when all of these hold
Mechanical or test-only work, over **disjoint** files, sharing **no** migration, with **no** member
on a security path. This is the case the original rule was written for and it remains correct:
do all edits first (parallel subagents on non-overlapping file sets), then run the pipeline ONCE.

### The non-convergence signal
If a review round surfaces a NEW critical in a section an earlier round already reviewed, the diff
is too large. **Split — do not run another round.** Worked example, 2026-08-24 (W1 PR 3): a PR
scoped to two issues also pulled in a discovered production defect, a second RPC redefinition and a
sibling sweep, reaching ~20 production files and two migrations. Three plan-critic rounds each
returned fresh CRITICALs; under the then-current rule plan-critic still had an N=3 security-path
floor, and it became unreachable inside the 4-round ceiling. (That floor is exactly what the
2026-08-24 single-run change removed for plan-critic — this example is the evidence behind it.)
Splitting it three ways — the live defect (no migration, N=2), the admin-report query + both
migrations, and the list-surface sweep — gave each piece a reviewable surface.

### Splitting is SEQUENCING, not deferring
This is what keeps the rule compatible with a NO-DEFERRALS directive
(`.spec-workflow/specs/backlog-burndown/tasks.md`, and § Apply-vs-Defer Discipline above). Nothing
is handed to an issue; the pieces are built in order, in the same run. A split is only a deferral if
a piece is left unbuilt — say so explicitly in the PR body when that happens.

### Batch the fixups too (UNCHANGED by the split default)
Collect ALL findings from ALL post-commit agents/reviewers, then make **ONE fixup commit** — not one
commit per finding. Each fixup commit re-triggers the review cycle. This governs commits WITHIN a
PR and is unaffected by how work is divided ACROSS PRs; `agent-coderabbit-local.md` and
`.claude/commands/crlocal.md` both cite this section for exactly this rule.

### Anti-patterns — there are TWO, in opposite directions
1. **One issue → one branch → full pipeline → merge → repeat.** Makes a multi-issue mechanical run
   crawl. (User directive 2026-07-02, mid-`/automerge`: "why the fuck one test in the whole PR?
   combine combine combine.")
2. **Everything the work touches → one branch.** Produces a diff whose review does not converge, and
   whose migration drags unrelated code through a prod-deploy gate. (User directive 2026-08-24,
   after the W1 PR 3 split: "maybe this shall be our standing practice? we had a rule to combine a
   lot of issues. but it is okay not to do this anymore.")

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

When a commit modifies a rule in `.claude/rules/*.md` or `CLAUDE.md`, update every stale restatement
**in the same commit**. Command, agent-definition and skill files routinely paraphrase pipeline
rules; a rule change that skips them leaves an agent following superseded text.

**Enumerate the mirror set from this table, never from memory or a count.**

| Mirror | Why it holds inline text |
|---|---|
| `docs/security.md` | the binding reference |
| `.claude/rules/*.md` | `security.md` is the auto-injected quick summary |
| `.coderabbit.yaml` | CodeRabbit cannot follow a pointer |
| `.claude/agents/*.md` | `security-auditor.md` is the BLOCKING pre-push gate |
| `.claude/commands/*.md` | slash commands restate gate lists |
| `.claude/skills/**/*.md` (recursive) | loaded as write-time guidance; often EMPTY — enumerate at sweep time |
| `.claude/hooks/*.sh` | **executable mirrors** — some PRINT the agent list at commit time. Not `.md`, so doc-shaped greps miss them |
| `package.json` | the artifact `CLAUDE.md`'s `pnpm.overrides` paragraph asserts about |
| any OTHER binding doc that re-states the mechanics — notably `docs/database.md` | a CLASS, not a path. Enumerate by asking "what else asserts this claim?" |

**Grep is a FIRST PASS, not the sweep.** Grep every fixed path for the rule's distinctive phrases —
old wording and new. But a phrase-grep cannot find a PARAPHRASE, so it reports false-clean: when a
change retires a CLAIM rather than a string, read the affected section and its mirrors end-to-end.
A restatement that merely POINTS at the rule needs no edit; one that RE-STATES the mechanics does.

**Write the mirror from the canonical TEXT, then diff it clause by clause** — never from memory of
what you just decided. A mirror written from recollection reliably drops the qualifier that makes
the rule fail CLOSED. The same gap opens from the other end: amending the canonical and leaving the
mirror behind, even in a commit that edits the mirror anyway. Re-read every mirror when the
canonical changes.

**Sweep completeness — a sweep is done when it passes these checks, not when you have run it.**

1. **Walk every reported hit to a terminal disposition — APPLIED or SKIPPED-with-reason — before
   committing.** A correct sweep OUTPUT is not a sweep that was ACTED ON; the missed hit has been
   printed on screen next to the fixed one. No better grep prevents this — only enumerating hits.

2. **Checksum the clause across every file that carries it — a verbatim copy in N files is ONE
   artifact.** A phrase-grep for the NEW wording matches only the file you just edited and reports
   clean. Anchor on a distinctive substring from the clause's OPENING, taken from text your edit
   does NOT change:

   ```bash
   node .claude/hooks/check-mirror-sync.mjs '<distinctive substring from the clause opening>'
   ```

   Identical digests on every line = in sync. It exits non-zero on divergence, on a file it could
   not check, and on an anchor matching nothing. It is a tested script and not an inlined snippet on
   purpose — the bash version it replaced shipped five distinct fail-opens, each pinned by
   `check-mirror-sync.test.mjs`. Do not re-inline it.

**Not covered: paraphrase-blindness.** Neither check helps when the grep matched zero hits and the
copies are not byte-identical. That is an OPEN problem; the "grep is a FIRST PASS" paragraph is all
there is.

**The enumeration itself is the recurring defect.** Treat "the list is complete" as the claim most
likely to be false. When a sweep finds a surface the table does not name, widen the TABLE in the
same commit — not just the file.

## Orchestrator Role

- **You plan and review. Agents execute.**
- Read every agent result before proceeding. No fire-and-forget.
- If an agent found an issue, validate it first, then address it before moving on.
- Group related fixes into a single commit when possible.
- After fix commits that change production code, re-run semantic-reviewer on the new diff.
- Repeat until all agents report clean.

### DO
- Run implementation-critic on staged changes before every commit.
- Launch the four core post-commit agents (code-reviewer, semantic-reviewer, doc-updater, test-writer) in parallel immediately after each commit — the learner, red-team and coderabbit-sync run AFTER them, not alongside — except under a NAMED exemption from `CLAUDE.md § Post-commit review` (docs-only → doc-updater; review-follow-up → semantic-reviewer). A review-follow-up commit, which applies only findings from its own parent's cycle and introduces no new scope, runs semantic-reviewer alone — **and only if its PARENT ran the FULL cycle and claimed NO exemption**, so the reduced path cannot chain off another reduced path.
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
- Skip post-commit agents. Ever. Not even for "trivial" commits. Commit size is NOT a criterion — the only reductions are the NAMED exemptions in `CLAUDE.md § Post-commit review`, and each has its OWN defining condition — docs-only by the PATHS the commit touches, review-follow-up by its parent having run a full cycle plus every hunk tracing to that cycle's findings. Neither is defined by how small the diff is.
- Chase a reviewer to convergence on a review-follow-up commit. Act on CRITICAL/ISSUE findings that name a runtime defect **or a false claim in the prose** — a false claim is never bounded out, whatever round it lands on, though the CHAIN is capped at 3 consecutive commits whose only content is applying the previous commit's findings — the ACT, not this exemption label, which cannot chain — before escalating (see `CLAUDE.md § Post-commit review`); log the rest and stop. An LLM reviewer returns non-empty on almost any prose, so the loop ends by rule, not by agreement (see the stop rule and its PR #1185 precedent in `CLAUDE.md § Post-commit review`).
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

### For any task that locates a DB object's current definition, name EVERY supersession form

> "Trace EVERY form, not just the two function ones — `CREATE OR REPLACE FUNCTION <fn>(<arg types>)` AND `DROP FUNCTION … CREATE
> FUNCTION <fn>(<arg types>)`, sorted by migration timestamp prefix — a later migration may
> redefine via DROP+CREATE, which a `CREATE OR REPLACE`-only grep silently misses. Match the
> SIGNATURE and not just the name: an overloaded function has a different body per argument
> list, so a name-only search can land on an overload that is not the one under review, or on
> one that no longer exists. Same for `ALTER TABLE … DROP CONSTRAINT` +
> `ADD CONSTRAINT`, for `DROP INDEX` + `CREATE [UNIQUE] INDEX` (an `ON CONFLICT` arbiter or a
> replay branch is only reachable while its backing index exists), for `DROP TRIGGER <name> ON
> <table>` + `CREATE TRIGGER <name> … ON <table>` when the guard lives in a trigger rather than
> the body, for `ALTER FUNCTION <fn>(<arg types>)`, which changes `SET search_path` /
> `SECURITY DEFINER` in place while leaving the body untouched, and for `DROP POLICY` +
> `CREATE POLICY` — plus `ALTER POLICY <name> ON
> <table>`, which replaces `TO` / `USING` / `WITH CHECK` in place without recreating the policy,
> so a DROP/CREATE-only grep reports a stale predicate as current."

### Prefer executable verification over analysis

Write prompts that say **"execute / grep / diff and report the output"**, not "analyse and assess"
— within what the target agent's own definition permits. plan-critic is read-only
(`.claude/agents/plan-critic.md` § DO NOT: "Do NOT execute code or make file changes"), so its
verification asks stay at grep / `git show` / `git diff`; only an agent allowed to run code gets
asked to run it. This is the single biggest quality-per-token lever, and it is what makes Sonnet subagents safe
(`agent-critic.md § Model tier`). Measured on `fix/report-item-scale` and its sibling migration
work, 2026-08-24: the highest-value findings of the whole run — a `42804` cast error and a `42702`
column ambiguity, BOTH invisible to a clean `supabase db reset` — came from EXECUTING the function.
A mock-shape break, a `deleted_at` subset argument, and a false causation claim all came from
READING a specific file or `git show`. Only a minority needed a model to notice that a claim
overreached. Executable verification is cheaper AND more reliable than inference; reserve
inference-shaped asks for the cases that genuinely need judgment.

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

*Last updated: 2026-08-25*
