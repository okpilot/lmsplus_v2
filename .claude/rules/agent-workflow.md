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
  set, so an inflated set can engage the N=3 floor where a single post-commit pass would
  otherwise stand — costing extra rounds. **Staleness is NOT safe
  in one direction only: it can also HIDE a security path.** A stale base is a superset of the
  COMMIT range, not of the CONTENT change — so if this branch REVERTS a change that landed
  upstream after the stale ref, the file is identical at the stale merge-base and at HEAD and
  drops out of the diff entirely. Verified: with `sec.txt` changed A→B upstream and the branch
  reverting B→A, the true base lists `sec.txt` while the stale base lists nothing. The floor
  then silently reads "no security path" — a single pass, no N=3 — and `/fullpush` 7b skips
  the MANDATORY red-team run — the same
  fail-open this section forbids below, reached by a different route. Never assume staleness is
  safe in EITHER direction. (Under-deriving the floor also has a separate cause — see below.)

Promoted at learner count=2 (issue #1134). Second occurrence, 2026-07-23: local `master` sat 2
commits behind `origin/master`, so `master...HEAD` read 18 files / 1492 lines instead of the
real 8 / 832, inflating both the sweep scope and the derived path set. Caught by plan-critic,
not by any mechanical gate — there is no gate for this.

**Do not confuse this with under-deriving the floor.** In that same plan the floor was also
briefly set to N=2 when it should have been N=3 — those are the 2026-07-23 figures under the
then-current rule, when plan-critic still had a floor; a normal diff now gets a single
post-commit pass — but that was a *separate* mechanism: the
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
N=3 to a single pass. Resolve and validate the base first, capture the changed-file list once with its
exit code checked, and branch on the exit code — never on whether the list is empty.

If a third-party tool genuinely requires a local branch name, run `git fetch origin master`
first and ABORT if it fails; then compare `git rev-parse master origin/master` and **hard-stop
if they differ or either fails to resolve** — do not merely report the mismatch and proceed.
Only invoke the tool once the base is proven current. Never let it run against an unverified base.

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

They measure different things and neither subsumes the other: **volume** catches a PR that defers a
lot, **ratio** catches a PR that hands back as much as it takes. A PR passes only if it clears both.

**Check 1 — volume (per-PR count of deferrals).**

- **0 deferrals** is the goal.
- **1-2 deferrals** is acceptable when each one genuinely meets the three-condition test above.
- **3+ deferrals** is a red flag — recheck triage. The PR scope was probably wrong (either too narrow → expand and apply some, or too broad → split). Re-evaluate every deferral before filing. 3+ does not fail the check automatically, but each survivor must be re-triaged and named in the push summary — the same written justification Check 2 demands.

**Check 2 — ratio (issues filed vs issues closed).** The per-item three-condition test is not a
budget at all: each condition is evaluated per finding, so a PR can pass every individual test and
still file as many issues as it closes. That is not a hypothetical. PR #1225 closed 7 (#1188, #1191,
#1194, #1198, #1200, #1219, #1221) and its merge commit records 7 deferrals (#1224, #1226–#1231) —
net ZERO, with every deferral individually justified. Its PR body's `## Deferred` section names two
(#1223, #1224), one of which the merge commit does not; the union of those two ARTIFACT lists is
**8 filed against 7 closed**. Run the command below **at that PR's push** and the answer is **9** — `#1232`
counts, created after its merge-base and still open — which is the figure the rule now prescribes.
The command has no upper time bound, so it is only meaningful run BEFORE the PR merges: re-run
it against #1225 later and the answer only climbs, sweeping in every issue every later branch
filed, this one included. Do NOT record what it returns "today": the figure this paragraph used to
carry was correct when written and false within the hour, once another issue was filed. That is
why the comparison is made once, before push, and not reconstructed afterwards, and the one
`fullpush.md`'s worked example uses. The artifact figure is not wrong; it
is a different question, and that is the whole point of pinning one source of truth. It also blew straight past Check 1's "3+ is a red flag" — which is what a single
merged budget hid, and why the two checks are stated separately now.

That divergence — 2, 6, 7 or 8 filed across just the artifacts named above (#1232's own title says 6), against 9 by the command run at that PR's push
— is itself the reason this
check needs a single source of truth:

- **"Filed" means every issue the branch author created after the merge-base, whatever its origin** —
  a deferral of this PR's own findings, a split of an older issue, a leftover from a previous PR's
  review. The check measures BACKLOG DELTA, so how an issue came to exist does not matter; if it is
  new and open when this PR merges, it counts. Two scopes, deliberately different, and only one of
  them is filtered: WHO is (the `author:@me` in the command below is not incidental — "on this
  branch" means created by its author, not by anyone who happened to file during the same window),
  WHY is not (deferral, split, leftover all count alike). (Two of this branch's own: #1233, carrying
  PR #1225's leftover critic findings, and #1234, split out of #360 — neither is a deferral of this
  PR, both count anyway. Read those as ILLUSTRATIONS of the origin kinds, never as the branch's
  list: the set is whatever the command returns at push time, and it kept growing while this
  paragraph was being written — #1236 was filed 39 minutes before the commit that moved these very
  lines, which is how the enumeration came to say "both" when three qualified.)
- **The PR body's `## Deferred` section is the authoritative list**, and it is MANDATORY on any PR
  that files an issue: it must name every one, including the non-deferral kinds above. A commit
  message's deferral list is a convenience copy, never the record. On a FIRST push there is no PR
  yet — the authoritative list is then the `## Deferred` section of the body being drafted for that
  push, and the check runs against the draft. On a later push, if body and reality disagree, the
  body is what you fix, before pushing.
- To enumerate rather than recall, pass the merge-base TIMESTAMP, not its date. A bare DATE is
  day-granular, so a branch cut on the same day a sibling PR filed its issues sweeps those in;
  GitHub honours a full ISO timestamp, which is what makes the fix work. Measured on this branch
  2026-08-19: 9 rows by date, 3 by timestamp — and both figures moved during the branch, which is
  why the measurement carries a date rather than standing as a fact.
  `git fetch origin` first (ABORT if it fails — a stale `origin/master` yields an older merge-base and
  over-reports, the very failure this fixes), then:
  `gh issue list --state open --limit 200 --search "author:@me created:>=$(git log -1 --format=%cI $(git merge-base origin/master HEAD))"`
  `--limit 200` is not decoration: `gh issue list` defaults to **30** and exits 0 on a truncated
  list, so a branch past that silently under-counts `filed`, which makes `filed >= closed` false and
  PASSES a check that should fail. Same fail-open shape as the empty-log hazard below, in a command
  that looks like it cannot fail. If it ever returns exactly 200, treat that as truncated, not as
  the answer, and raise the bound — a cap only closes the hole while the result stays under it.
  `author:@me` resolves to the **`gh`-authenticated account**, not to the branch's commit author.
  They are the same here, and the rule assumes it; if you ever run this under a different `gh`
  login than the one that filed the issues, `filed` under-counts and the check passes when it
  should fail — the same fail-open shape as the truncation above. If in doubt compare like with
  like — `gh api user --jq .login` against the login that actually filed them
  (`gh issue list --state open --limit 1 --json author --jq '.[0].author.login'`); a login and a
  git author email are different namespaces and never match textually, so do not "confirm" it
  against `git log --format=%ae`.
  `--state open`, not `--state all`: the definition counts issues still open at merge, and an issue
  filed and closed on the same branch is zero backlog delta. (No figure is quoted here on purpose —
  on this branch both forms return the same count, so the flag makes no observable difference and a
  measurement would be justifying the change with a number that cannot show it.)
  Cross-check the result against the `## Deferred` section. An unenumerable "filed" is what left
  #1225 readable as anywhere from 2 to 8.
- **"Closed" means the issues this PR's `Closes #N` / `Fixes #N` keywords will actually close.**
- Compare once, before push. If **filed > 0 AND filed ≥ closed**, the PR did not reduce the backlog
  and needs a written justification naming what made this batch exceptional — not three separate
  per-item justifications. **First-illumination below is the only accepted basis** — and its first three steps are an evidence test, not a narrative: you paste command output. Step 4 is openly a judgment call, and classifying step 3's output as substantive-or-not takes a sentence too; what is disqualified is a justification made ONLY of argument, with no pasted output behind it; anything
  else means re-triage. This is deliberately narrower than "write something down", so that the
  mirrors, which offer exactly those two paths, are not narrower than the rule they mirror. A PR that files nothing passes this check whatever it closes.
- **First-illumination exemption — evidence required, once per area.** A PR that is the first to
  look hard at a neglected area will legitimately surface more than it closes. Self-assertion is not
  enough: without evidence this exemption swallows the rule, and PR #1225 itself would be the first
  to walk through it — its stated purpose ("a post-merge audit of #1220", one of whose findings is
  that `apps/web/scripts/**` was excluded from both tsconfigs) reads as textbook first-illumination.
  To claim it, name the path set, paste the output of every command below, and answer the last:
  1. `git log --oneline -- <paths>` — must be **NON-empty**. Fail-closed half one: it proves the
     PATHSPEC resolves to something real.
  2. `git log --since=6.months.ago --oneline | head -1` — repo-wide, NO pathspec — must be
     **NON-empty**. Fail-closed half two: it proves the DATE EXPRESSION parsed. Both halves are
     needed and neither covers the other, because step 3's empty result is the PASS condition, so
     anything that makes a log spuriously empty silently GRANTS the exemption. Git will not tell
     you: `git log --since=zzz.months` and `--since=sixmonths` each return 0 lines, exit 0, no
     diagnostic — so the usual "abort on a non-zero exit code" guard cannot catch either. Measured
     on this repo 2026-08-19: `--since=6.months.ago` returns 694 commits repo-wide, both malformed
     spellings return 0. Step 1 alone does not catch a bad date (a valid pathspec still lists its
     history); step 2 alone does not catch a bad pathspec.
  3. `git log --since=6.months.ago --format=%h -- <paths> | xargs -r -n1 git show --stat --format='%h %s'`
     — must list no **substantive** commit, meaning any commit that is not docs-only or
     agent-memory-only. Use the SAME date expression as step 2 and the SAME path set as step 1, or
     you validated inputs this step does not use. Note `--oneline` alone CANNOT answer this: it
     prints only hash and subject, and "docs-only" is a property of the WHOLE commit while every
     command here is pathspec-filtered — so `--name-only` does not fix it either. `git show --stat`
     per commit is what shows the full file set, including paths outside `<paths>`.
  4. No open issue targeted those paths when the branch was cut. Issues carry no path metadata, so
     this one is a judgment call, not a command — state which issues you checked and why none
     qualifies, rather than asserting the conclusion.

  Record the claim in the PR body as a line reading `first-illumination: <path set>`. That line is
  the whole once-per-area mechanism — a later PR into overlapping paths runs
  `gh pr list --state merged --search '"first-illumination" in:body'` and OPENS the hits, looking for
  an actual `first-illumination: <paths>` claim line over overlapping paths. The query alone cannot
  discriminate: GitHub's tokenizer discards a trailing colon inside a quoted phrase, so
  `'"first-illumination:" in:body'` behaves identically (verified — `'"Closes:" in:body'` and
  `'"Closes" in:body'` return the same PRs, none of which contain `Closes:`). It is a coarse filter
  that still needs a human read; any PR merely discussing the exemption will match. There is no registry beyond that query, and
  "overlapping" is deliberately not formalised; treat a shared directory as the same area.
- Otherwise, re-triage: the fix is usually to APPLY two or three of the deferrals, not to argue for
  them. Re-loading that context later costs more than finishing it now.

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

When a commit modifies a rule in `.claude/rules/*.md` or `CLAUDE.md`, update every stale restatement **in the same commit**. Command, agent-definition and skill files routinely paraphrase pipeline rules (review-round discipline, pre-commit gate lists, trigger sets); a rule change that skips them leaves an agent following the superseded text the next time that command, subagent or skill runs.

**The mirror set is the table below — enumerate it from the table, never from memory, and never from a count.** Most rows are fixed paths, including single files (`docs/security.md`, `.coderabbit.yaml`, `package.json`) that are easy to drop if you glob only the directories, and executable ones (`.claude/hooks/*.sh`) that every doc-shaped grep misses. The last row is open-ended and is the one that keeps being missed.

This paragraph deliberately carries NO total. It used to say "these seven" with a "six fixed plus the seventh" decomposition, and the count went stale the moment a row was added — the same failure this whole section exists to prevent. A number here is one more mirror to keep in sync.

| Mirror | Why it holds inline text |
|---|---|
| `docs/security.md` | the binding reference |
| `.claude/rules/*.md` | `security.md` is the auto-injected quick summary |
| `.coderabbit.yaml` | CodeRabbit cannot follow a pointer |
| `.claude/agents/*.md` | `security-auditor.md` is the BLOCKING pre-push gate — a stale checklist there emits false CRITICALs |
| `.claude/commands/*.md` | slash commands restate gate lists |
| `.claude/skills/**/*.md` (recursive — a nested skill is still a mirror, and `.coderabbit.yaml` already globs it recursively) | skills are loaded as write-time guidance. NOTE: this row is often EMPTY — enumerate `.claude/skills/**/*.md` at sweep time rather than assuming, since a future pipeline skill would join it; note `fullpush`/`wrapup` are **command** files, not skills. Do not assume a hit here means you have swept the set |
| `.claude/hooks/*.sh` | **executable mirrors** — inspect every matching hook at sweep time for emitted pipeline guidance; some PRINT the agent list at commit time, so a stale one instructs the orchestrator directly. Not `.md`, so every doc-shaped grep misses them. As of 2026-08-19 that meant `post-commit-reminder.sh` and `cr-local-plan-reminder.sh` |
| `package.json` | the artifact `CLAUDE.md`'s `pnpm.overrides` paragraph asserts about; a rule change there is unverifiable without reading it |
| any OTHER binding doc that re-states the mechanics — notably `docs/database.md` | not a rule file, so no enumeration reaches it; `docs/database.md` §7 *describes what the security-auditor flags*, and `CLAUDE.md § Key docs` makes it binding. This row is a CLASS, not a path — enumerate it by asking "what else asserts this claim?", never by grepping the fixed paths above |

How to apply: **grep is a FIRST PASS, not the sweep.** Grep every fixed path in the table for the rule's distinctive phrases — including `.claude/hooks/*.sh`, whose `echo` lines a doc-shaped glob skips — then find the open-ended row by READING, not grepping, since it has no path to glob — both the OLD wording being replaced and the rule's key terms. But a phrase-grep cannot find a *paraphrase*, so it reports false-clean: when a change retires a **claim** rather than a string, also read the affected section and its mirrors end-to-end once. Precedent (PR #1174): grepping "read AND write policies" found 3 hits and looked clean; four further review rounds surfaced the same claim as `USING + WITH CHECK`, `USING without WITH CHECK`, `UPDATE requires BOTH`, and `policies blocking UPDATE and DELETE`. A restatement that merely *points* to the rule file needs no edit; one that *re-states* the mechanics must be updated or reduced to a pointer.

**Write the mirror from the canonical TEXT, then diff it clause by clause — never from memory of what you just decided.** A mirror written from recollection reliably drops the qualifier that makes the rule fail CLOSED, which is the half nobody misses until it matters. Promoted at learner count=2 — `6d4aa646` (`>` drifted from `≥`, and a guard that never reached its enforcement point) and `387a29ac` (a worked example still computing under the retired definition). Read both texts side by side and check every clause has a counterpart, or has been deliberately dropped for scope.

**The same gap opens from the other end: amending the CANONICAL and leaving the mirror behind — in a commit that edits the mirror anyway.** `79384dce` added "if it ever returns exactly 200, treat that as truncated" to the rule here, and touched `.claude/commands/fullpush.md` in that same commit for an unrelated line, without carrying the clause across; the mirror then accepted a silently truncated list for five commits until cloud CodeRabbit caught it and `c9b4db03` closed it. Writing the mirror from the canonical text cannot prevent this one — only re-reading the mirror when the canonical changes can, which is what the table at the top of this section is for. Two directions, one outcome: the enforcement surface ends up weaker than the rule.

**Sweep completeness — a sweep is done when it passes these checks, not when you have run it.** The
paragraphs above say WHERE to look and to read for paraphrases. They do not say when you are
FINISHED, and that is the gap the record shows: on one branch a mirror sweep came up short
repeatedly, each time by a different mechanism, with this very section open in front of the
orchestrator. Once the missed hit was sitting in the sweep's OWN printed output. Every one was a
good-faith sweep, so the remedy is a terminal check, not more diligence.

1. **Walk every reported hit to a terminal disposition — APPLIED or SKIPPED-with-reason — before
   committing.** A sweep whose OUTPUT is correct is not a sweep that was ACTED ON. Precedent
   `056155ab`: the grep was correctly scoped and printed `agent-coderabbit-local.md:124` alongside
   `:34` in its own output; the fix edited `:34`, left `:124`, and the commit message then asserted
   the sweep had been exhaustive. No better grep prevents this one — the hit was already on screen.
   Only enumerating the hits does.

2. **Checksum the clause across every file that carries it — a verbatim copy in N files is ONE
   artifact.** This is the case a phrase-grep cannot reach: when the mirror is byte-identical rather
   than a paraphrase, grepping the NEW wording matches exactly the file you just edited and reports
   clean. Anchor on a distinctive substring from the clause's OPENING, taken from text your edit does
   NOT change — an anchor containing your new wording is the same fail-open:

   ```bash
   node .claude/hooks/check-mirror-sync.mjs '<distinctive substring from the clause opening>'
   ```

   Identical digests on every line = in sync; it exits non-zero on divergence, on a file it could
   not check, and on an anchor that matches nothing. **It is a script and not a snippet here on
   purpose.** The bash version this replaced shipped FIVE distinct fail-opens, each found by a
   different review round and none by the round before it: it hashed only the anchor LINE (a change
   below it was invisible); `for f in $(git grep -l …)` word-split a path containing a space so the
   file was never read and never flagged; `awk -v` applied C-escape processing so an anchor holding
   a backslash matched nothing; a missing anchor only warned and continued; and a repeated anchor
   silently compared the first block. Every one made it report "in sync" without having checked.
   Prose cannot be tested — `check-mirror-sync.test.mjs` pins all five, and each guard is
   mutation-checked. Do not re-inline it.

   Identical checksums on every line = in sync; any divergent one is an unswept copy. `-F` and the
   explicit `-- :/` are load-bearing and both fail OPEN — `code-style.md` §10 clause 3 measures why.
   Verified 2026-08-25 by replaying the defect: at `bf2b6672` that clause checksums `714eec4f` in
   `.claude/agents/plan-critic.md` against `3e0bfa5f` in both `implementation-critic.md` and
   `semantic-reviewer.md` — it added `DROP POLICY` + `CREATE POLICY` to one of three byte-identical
   copies and no sweep was attempted at all. One command, at commit time, prints the divergence.

**What these two checks do NOT cover — stated so nobody reads the list as complete.** Tracker row 660
records THREE genuine instances after the retraction below — it recorded four, and `4938192b` turned
out not to exhibit this mechanism at all. These checks address two of the three.

- `dccf7d3b` — a phrase-grep missed a PARAPHRASE, and it took three sequential passes and three
  different catchers to converge. Neither check helps: check 1 has nothing to walk when the grep
  matched zero hits, and check 2 only compares copies that are byte-identical. The only guidance for
  this is the "grep is a FIRST PASS" paragraph above — which already existed at the time and did not
  prevent it. **Paraphrase-blindness is an OPEN problem here**, not a solved one; the tracker's own
  candidate remedy (grep the claim's key NOUNS — agent name, rule name, section title — rather than
  its phrasing) is untested and is deliberately not promoted on that basis.
- `4938192b` — re-derived from the commit rather than from the tracker row, which describes it
  wrongly. It edited FOUR files under `.claude/agents/`, and `security-auditor.md:144` and
  `semantic-reviewer.md:78` were fixed BY it, not missed by it. What it actually left behind was
  `security-auditor.md`'s section HEADING, still reading "trace the CREATE OR REPLACE chain" two
  lines above the body it had just widened, plus a 2-of-4 enumeration in `code-style.md` — fixed in
  `2b37bf8e` and flagged by code-reviewer, doc-updater and semantic-reviewer together. Those are
  `code-style.md` §10 clause 3 (a partial comment edit) and clause 2 (enumerating an open set), both
  already promoted. It needs no new check, and the row's claim that a hand-scoped path glob caused it
  does not survive `git show`.

That re-derivation is itself the point: the first draft of this subsection proposed a THIRD check
built on the tracker row's account of `4938192b`, and plan-critic falsified it from the commit. A
tracker row is evidence of what an agent concluded, never of what the code did — `code-style.md` §10
clause 1, and it very nearly shipped inside the rule about sweep discipline.

Promoted at learner count=3 (tracker row 660, reconciled from 4 at promotion — `4938192b` was
retracted, not merely re-explained, so the count field was recomputed and not just the prose, per
`agent-memory.md` § Tracker state machine): `056155ab` (check 1), `bf2b6672` (check 2), `dccf7d3b`
still OPEN. Three clears the 2-occurrence promotion bar in `agent-learner.md` on its own.

**The enumeration itself is the recurring defect.** On PR #1174 this list was wrong three rounds running: it omitted `.claude/commands/` (round 3 — its own directory), then `.claude/skills/*.md` (round 4), then `docs/database.md` (round 5, found by implementation-critic, and the reason the open-ended row exists). Each time the fix corrected the instance and left the count. Treat "the list is complete" as the claim most likely to be false, and when a sweep finds a surface the table does not name, widen the TABLE in the same commit — not just the file.

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

Promoted at learner count=2 (2026-08-09). In one cycle an Explore agent reported a superseded
migration as latest, a subagent flagged a table whose policy had been dropped twice, a spec cited a
constraint re-emitted twice since, and the orchestrator made the same error twice in its own
migration header. Note this is also how the bug that cycle FIXED was introduced: a human added
role-gated policies without accounting for the pre-existing `FOR ALL` policy. The codebase's
append-only, mutation-by-supersession shape produces this error in whoever reads it.

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

*Last updated: 2026-08-25 (§ Rule-Mirror Sync's "Sweep completeness" opener is de-quantified — it said the sweep "came up short four times" three paragraphs above its own reconciliation to THREE, and claimed "each caught by a different reviewer" when tracker row 660's instance-3 text names no catcher at all for `056155ab`: the missed hit was in the sweep's own printed output. Both found by semantic-reviewer on `ee0045b7` — the third partial-edit of this shape in one run, in the commit that reconciled the count. Prior, same day: § Rule-Mirror Sync gained "Sweep completeness", promoted at learner count=3 (tracker row 660, reconciled DOWN from 4 in the same commit — retracting `4938192b` removes an instance, and `agent-memory.md` requires the count field be recomputed rather than the narrative alone; 3 still clears the 2-occurrence bar): walk every reported hit to APPLIED or SKIPPED-with-reason, since a correct sweep OUTPUT is not a sweep that was ACTED ON (`056155ab`, where the missed hit was printed on screen next to the fixed one); and checksum the clause across every file carrying it, because a byte-identical copy in N files is ONE artifact and a phrase-grep for the NEW wording matches only the file already fixed (`bf2b6672`, verified by replay — `714eec4f` in `plan-critic.md` against `3e0bfa5f` in the other two). The subsection states which of the row's instances it does NOT cover, rather than implying it covers them all: paraphrase-blindness (`dccf7d3b`) stays OPEN, and `4938192b` needs no check because its real residue was a stale heading plus an open-set enumeration, already governed by `code-style.md` §10 clauses 3 and 2. A first draft proposed a third check built on the tracker row's account of `4938192b`; plan-critic falsified it from `git show` — the row says the commit missed `security-auditor.md:144` and `semantic-reviewer.md:78`, and the commit in fact FIXED both. §10 clause 1 inside the rule about sweep discipline. `.claude/commands/fullpush.md` carries a POINTER, not a copy — `wrapup.md` already warns that working from a copy of this table is how the `.claude/hooks/*.sh` and `package.json` rows came to be missed. Prior, same day: tracing guidance now names `ALTER FUNCTION <fn>(<arg types>)` — which replaces `SET search_path` / `SECURITY DEFINER` in place without reissuing the body — plus `DROP TRIGGER` + `CREATE TRIGGER`, and `DROP INDEX` / `CREATE [UNIQUE] INDEX` when the invariant lives outside the function. The "BOTH supersession forms" quantifier is retired: the list is now open, so it is de-quantified rather than recounted, per `code-style.md` §10 clause 2. Found by cloud CodeRabbit on PR #1242. Prior: 2026-08-24 (the plan-critic escalation path now covers an unresolved ISSUE as well as an unresolved CRITICAL. § NEVER forbids executing with EITHER open, but both the diagram arm and § "One run, not rounds" named only CRITICAL — so an unresolved ISSUE had no exit at all: not proceedable, and no stated handoff. Found by cloud CodeRabbit on PR #1242, against `4e96c64d`, which had added the CRITICAL arm earlier in the same run — the same half-fix shape twice. Prior, same day: the plan-critic pipeline diagram now shows the unresolved-CRITICAL branch — it read "fix APPLY findings -> proceed" with no escalation, while § "One run, not rounds" requires handing an unresolvable CRITICAL to the user and § NEVER forbids executing with one open. Found by cloud CodeRabbit on PR #1242. Prior, same day: the three live `N=2` references now read "a single post-commit pass" — `agent-critic.md`'s N=2 row was plan-critic's floor and retired with it; the dated-incident mentions at the staleness section and the PR-batching worked example are left untouched as historical records. § Prefer executable verification is bounded by the target agent's own definition, plan-critic being read-only. Found by CR-local round 1 on PR #1242. Prior, same day: plan-critic runs ONCE — the pipeline diagram, the "Review rounds" paragraph and the security-path split trigger all still described a coverage/stability/ceiling loop for it after `agent-critic.md § Model tier` retired that loop in the same PR; the floor now governs the post-commit reviewers only. The migration hard-split trigger says "migration WORK", since its rationale is the per-PR prod-deploy gate and migrations deploying together may share a PR — the worked example's three-way split is what actually happened and was NOT rewritten to invent a fourth piece. `judgement`→`judgment`. Found by cloud CodeRabbit on PR #1242. § PR Batching now defaults to SPLIT by risk surface and merge gate — the prior "combine aggressively" default keyed on ISSUE COUNT, the wrong variable, and produced a diff whose review did not converge; both anti-patterns are now recorded, in opposite directions. § Delegation Protocol gained "prefer executable verification over analysis". Prior: 2026-08-19 (§ Rule-Mirror Sync gained "write the mirror from the canonical TEXT, then diff it clause by clause", learner count=2 — `6d4aa646`, `387a29ac` — with a second paragraph for the opposite direction, the canonical amended while its mirror is left behind (`79384dce`, which edited both files and carried the fail-closed clause to only one); and the defer-budget worked example no longer records what the enumeration command returns "today", since any such figure goes false within the hour. Prior, same day: defer budget is now TWO checks — volume and filed-vs-closed ratio — with "filed" defined once as every issue the branch author created after the merge-base (author-scoped, as the command's `author:@me` already encoded; purpose-agnostic — "whatever its origin") and listed in the PR body's mandatory `## Deferred` section — the draft body on a first push, since the check runs before the PR exists — enumerated by passing the merge-base TIMESTAMP, since a bare date is day-granular and over-reports while GitHub honours a full ISO timestamp, a `filed > 0` guard so 0/0 does not fire, `--limit 200` on the enumeration command because `gh` defaults to 30 and exits 0 truncated (under-counting `filed` PASSES a check that should fail), the first-illumination evidence test scoped so only its first three steps are pasted output while step 4 is openly a judgment call, first-illumination named as the ONLY accepted justification so the mirrors are not narrower than the rule, its step 3 switched from `--oneline` (which prints no file list, and cannot decide a whole-commit property under a pathspec) to a per-commit `git show --stat`, and an evidence test on the first-illumination exemption whose git half fails CLOSED on BOTH counts — an empty `--since` log is the pass condition, so a non-empty unfiltered log proves the pathspec and a non-empty repo-wide `--since` proves the date expression parsed, neither covering the other, #1232; the post-commit DO bullet names the four core agents again (de-counting the EXEMPTIONS had wrongly de-counted the AGENT SET); Finding Validation gained "a critic told me X" as a claim class to verify, #1231; the mirror table gained `.claude/hooks/*.sh` and `package.json` and lost its stale total. Prior: 2026-08-15.)))*
