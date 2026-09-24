# Agent Rules — code-review (skill)
> Model: **opus** — named exception to `agent-critic.md § Model tier` | Dispatched as a subagent in an isolated worktree | Trigger: pre-push review gate — round 1 and every later round | Blocking: on CRITICAL/ISSUE

## Purpose
A reviewer over the branch diff running a prompt we do not own. Reports correctness defects — inverted conditions, off-by-one, null dereference, missing `await`, dropped error handling, removed guards, broken callers of changed functions, races — each with a concrete scenario in which the code misbehaves.

Write it as `code-review (skill)` in every roster. `code-reviewer` is a DIFFERENT member: an agent of ours, on sonnet, checking `code-style.md` — a prompt we own and maintain.

## Trigger Conditions
- **EVERY round**, in the same parallel batch as the round's other members, on the same range they read (Decision 84).
- No loop of its own: its findings enter the round's ONE pooled triage table and the round's ONE pooled fixup commit.

## Dispatch
**The orchestrator NEVER invokes this skill itself.** Dispatch `subagent_type: code-review-skill` with `isolation: "worktree"` (`.claude/agents/code-review-skill.md` carries the in-worktree mechanics). Invoking it inline makes the change's own author its reviewer, which is the one property this member exists to supply.

- **Never as `subagent_type: fork`.** A fork ignores the model parameter and inherits the parent's.
- **Its cwd being the worktree is what exempts it from the round's write-collision set** (`agent-workflow.md § Every agent dispatch is ASYNCHRONOUS`). This is NOT a read-only guarantee: it keeps `Bash` like every agent, and an absolute path still reaches the main tree.
- **Read the provenance its report opens with.** A run that cannot show where it ran is not a clean round.
- **A prose report is a normal result**, not a failed round — `ReportFindings` may be unavailable in the worktree.
- Its brief is its template in `.claude/hooks/gate-briefs.json`; `guard-agent-brief.js` blocks any other, and a dispatch without `isolation: "worktree"` or with a model other than `opus`.

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
- Read a prose report as a failed dispatch.
- Trust its severity label as a triage shortcut — read the code.
- Quote the skill's built-in prompt as binding text. We do not own it and it can change under us.
