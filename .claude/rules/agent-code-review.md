# Agent Rules — code-review (skill)
> Model: **opus** — named exception to `agent-critic.md § Model tier` | Dispatched as a subagent in an isolated worktree | Trigger: ROUND 1 of the pre-push review gate, once per branch | Blocking: on CRITICAL/ISSUE

## Purpose
A reviewer over the branch diff running a prompt we do not own. Reports correctness defects — inverted conditions, off-by-one, null dereference, missing `await`, dropped error handling, removed guards, broken callers of changed functions, races — each with a concrete scenario in which the code misbehaves.

Write it as `code-review (skill)` in every roster. `code-reviewer` is a DIFFERENT member: an agent of ours, on sonnet, checking `code-style.md` — a prompt we own and maintain.

## Trigger Conditions
- **ROUND 1 ONLY**, in the same parallel batch as the other six, on the same range they read.
- **Round-1 scoping is a default whose widening is measured and deliberately held** (Decision 77). Take the widening once the roster is single-sourced: while round scope is restated across the roster's mirrors, changing it costs a hand-sync of every one.
- No loop of its own: its findings enter the round's ONE pooled triage table and the round's ONE pooled fixup commit.

## Dispatch
**The orchestrator NEVER invokes this skill itself.** Dispatch a subagent — model `opus`, isolated worktree — whose prompt tells it to invoke the skill. Invoking it inline makes the change's own author its reviewer, which is the one property this member exists to supply.

- **The worktree is cut at `origin/master`, NOT at the branch tip.** Inside it `git diff origin/master...HEAD` resolves to ZERO paths while the branch carries commits. `agent-workflow.md § Always diff against origin/master` aborts only on a non-zero EXIT CODE and never on an empty result — correct for a real no-op, fatal here: the member returns clean having read nothing and the gate closes on a phantom. **Pass the branch tip explicitly — `git diff origin/master...<branch>`.** When that range is empty, never review and never record a clean round — diagnose instead: `git rev-list --count origin/master..<branch>` non-zero with an empty diff is a genuine no-op branch — a commit and its revert. Report which one it is.
- **The FILES ON DISK are at `origin/master` too — not just the diff range.** `Read`, `Grep` and a bare `git grep` inside the worktree return the PRE-change tree, silently: a guard the branch ADDS reads as absent, and a changed hunk reads with its old body. Read file bodies with `git show <branch>:<path>` and scope greps with `git grep <pattern> <branch> -- <pathspec>` — the tree-ish goes AFTER the pattern; `git grep <branch> -- <pathspec>` searches the working tree for the branch NAME and returns nothing.
- **Dispatch it as an isolated worktree, never as `subagent_type: fork`.** A fork ignores the model parameter and inherits the parent's, so the `opus` mandate holds there only by coincidence of the orchestrator being Opus — not because the dispatch asked for it.
- **Its cwd being the worktree is what exempts it from the round's write-collision set** (`agent-workflow.md § Every agent dispatch is ASYNCHRONOUS`). This is NOT a read-only guarantee: it keeps `Bash` like every agent, and an absolute path still reaches the main tree.
- **The report OPENS with provenance** — `pwd`, `git rev-parse --abbrev-ref HEAD`, `git rev-parse HEAD`, and whether the skill ran inline or in an isolated worktree. A run that cannot show where it ran is not a clean round. Nothing in the repo can check this; the orchestrator reads it or it is unverified.
- **`ReportFindings` may be unavailable in the worktree.** Where it is NOT available the findings arrive as PROSE in the agent's terminal message — a normal result, not a failed round.
- **`gh` IS available to the run** (`command -v gh`, `gh auth status`). Require it to resolve any finding resting on issue/PR state at its source — `gh issue view <N>`, `gh pr view <N>` — rather than reporting it unverified.
- State no derived count in the dispatch prompt — ship the command (`agent-workflow.md § A dispatch prompt states no derived number`).

## Severity Mapping
Its own labels are ADVISORY. Map to the gate's vocabulary before triaging:

| What the finding carries | Gate severity |
|---|---|
| Security gap or data-loss path | CRITICAL |
| A concrete scenario in which the code misbehaves | ISSUE |
| No scenario named, or a style preference | SUGGESTION |

## Handling Results
### DO
- Verify the factual premise of every finding against source before triaging (`agent-workflow.md § Finding Validation`) — it reads a diff and reasons about the rest.
- Pool its APPLY-verdict findings with every other reviewer's into the round's ONE fixup commit.
- Report its triage table (file:line / severity / verdict / why) into the round's pooled triage.
- Give every skip a concrete written reason.

### NEVER
- Invoke the skill from the orchestrator's own context. The author then reviews the author.
- Record a round as clean on an EMPTY range — verify the range resolved to the branch's paths first.
- Write it as bare `code-review` in a roster — `code-reviewer` is a different member and the two read alike.
- Run it in any round but round 1.
- Read a prose report as a failed dispatch.
- Trust its severity label as a triage shortcut — read the code.
- Quote the skill's built-in prompt as binding text. We do not own it and it can change under us.
