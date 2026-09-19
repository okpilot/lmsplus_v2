# Agent Rules — code-review (skill)
> Built-in `/code-review` skill, dispatched forked | Trigger: ROUND 1 of the pre-push review gate, once per branch | Blocking: on CRITICAL/ISSUE

## Purpose
A reviewer over the branch diff running a prompt we do not own. Reports correctness defects — inverted conditions, off-by-one, null dereference, missing `await`, dropped error handling, removed guards, broken callers of changed functions, races — each with a concrete scenario in which the code misbehaves.

Write it as `code-review (skill)` in every roster. `code-reviewer` is a DIFFERENT member: an agent, in every round, checking `code-style.md`.

## Trigger Conditions
- **ROUND 1 ONLY**, in the same parallel batch as the other five, on the same range: `git diff origin/master...HEAD -- . ':(exclude).claude/agent-memory'`. Rounds 2+ are code-reviewer + semantic-reviewer.
- **Round-1 scoping is a conservative default, not a measured result.** Decision 74's yield decay was measured on a different reviewer. Widening this one to later rounds needs its own measurement.
- No loop of its own: its findings enter the round's ONE pooled triage table and the round's ONE pooled fixup commit.

## Dispatch
It runs FORKED — its own worktree, its own context.
- **`ReportFindings` may be unavailable in a forked worktree.** Where it is, the findings arrive as PROSE in the agent's terminal message. That is a normal result, not a failed round; a round is incomplete only when no completion notification arrives.
- A forked run has no PR and no `gh` access, so a finding resting on issue/PR state was unverifiable at its source. Resolve it here (`gh issue view <N>`, `gh pr view <N>`).

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
- Write it as bare `code-review` in a roster — `code-reviewer` is a different member and the two read alike.
- Run it in any round but round 1.
- Read a prose report as a failed dispatch.
- Trust its severity label as a triage shortcut — read the code.
- Quote the skill's built-in prompt as binding text. We do not own it and it can change under us.
