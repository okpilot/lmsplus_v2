# Agent Rules — code-review (skill)
> Model: **opus** — named exception to `agent-critic.md § Model tier` | Dispatched as a subagent in an isolated worktree | Trigger: ROUND 1 of the pre-push review gate, once per branch | Blocking: on CRITICAL/ISSUE

## Purpose
A reviewer over the branch diff running a prompt we do not own. Reports correctness defects — inverted conditions, off-by-one, null dereference, missing `await`, dropped error handling, removed guards, broken callers of changed functions, races — each with a concrete scenario in which the code misbehaves.

Write it as `code-review (skill)` in every roster. `code-reviewer` is a DIFFERENT member: an agent, in every round, checking `code-style.md`.

## Trigger Conditions
- **ROUND 1 ONLY**, in the same parallel batch as the other five, on the same range the other five read.
- **Round-1 scoping is a conservative default, not a measured result.** Widening it to later rounds needs its own measurement.
- No loop of its own: its findings enter the round's ONE pooled triage table and the round's ONE pooled fixup commit.

## Dispatch
**The orchestrator NEVER invokes this skill itself.** Dispatch a subagent — model `opus`, isolated worktree — whose prompt tells it to invoke the skill. Invoking it inline makes the change's own author its reviewer, which is the one property this member exists to supply.

- **The worktree is cut at `origin/master`, NOT at the branch tip.** Inside it `git diff origin/master...HEAD` resolves to ZERO paths while the branch carries commits. `agent-workflow.md § Always diff against origin/master` aborts only on a non-zero EXIT CODE and never on an empty result — correct for a real no-op, fatal here: the member returns clean having read nothing and the gate closes on a phantom. **Pass the branch tip explicitly, and ABORT when the range is empty while `git rev-list --count origin/master..<branch>` is not.**
- **The report OPENS with provenance** — `pwd`, `git rev-parse --abbrev-ref HEAD`, `git rev-parse HEAD`, and whether the skill ran inline or forked. A run that cannot show where it ran is not a clean round. Nothing in the repo can check this; the orchestrator reads it or it is unverified.
- **`ReportFindings` may be unavailable in a forked worktree.** Where it is NOT available the findings arrive as PROSE in the agent's terminal message — a normal result, not a failed round.
- A forked run has no PR and no `gh` access, so a finding resting on issue/PR state was unverifiable at its source. Resolve it here (`gh issue view <N>`, `gh pr view <N>`).
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
- Hand round 1's table to the branch's learner run — ordinary learner input (`agent-learner.md`).
- Give every skip a concrete written reason.

### NEVER
- Invoke the skill from the orchestrator's own context. The author then reviews the author.
- Record a round as clean on an EMPTY range — verify the range resolved to the branch's paths first.
- Write it as bare `code-review` in a roster — `code-reviewer` is a different member and the two read alike.
- Run it in any round but round 1.
- Read a prose report as a failed dispatch.
- Trust its severity label as a triage shortcut — read the code.
- Quote the skill's built-in prompt as binding text. We do not own it and it can change under us.
