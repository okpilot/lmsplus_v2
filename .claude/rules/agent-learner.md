# Agent Rules — learner
> Model: sonnet | Trigger: ONCE per branch — after the pre-push gate ends, clean or at the ceiling, before red-team and coderabbit-sync | Non-blocking
## Purpose
Identifies recurring patterns across agent findings. Proposes rule changes, Biome config updates, or memory updates only when a pattern repeats (2+ occurrences across different rounds or branches).
## Handling Results
### DO
- Run the learner once per branch, after the gate's last round (`agent-workflow.md § Pre-Push Review Gate`) and after its fixes are committed — including when the loop stopped at the ceiling with residual findings. Its input is EVERY round's findings from EVERY reviewer, not just the last round's.
- **`code-review (skill)` findings — the built-in `/code-review` skill, dispatched as a subagent in an isolated worktree on opus, every round — are ORDINARY learner input**, pooled with the other reviewers' of the same round and counted toward rule promotion on the same terms. This is NOT the cloud-CodeRabbit case in the next bullet: that reviewer runs after the gate ends; this one runs inside every round.
- Red-team and coderabbit-sync findings are NOT learner input — they run AFTER the learner, so they reach the learner run of a LATER branch. Cloud CodeRabbit's findings land after the gate ends too, so they reach a LATER branch's learner run on the same terms. A branch whose rounds were all clean still gets its learner run ("absence of findings is itself data").
- Trust its pattern detection — frequencies live in `.claude/agent-memory/learner/MEMORY.md`. That trust covers JUDGMENT, not a report that it WROTE something — verify a claimed memory or archive edit against the artifact per `agent-workflow.md § Finding Validation`.
- Apply rule changes the learner proposes if the pattern has 2+ occurrences AND the change is specific and actionable.
- Note when the learner reports a pattern did NOT recur — a positive signal the fix worked.
- Let the learner update its own memory file with new patterns and lessons.
### NEVER
- Change rules based on a single occurrence. Log it, watch it, change on 2+ repeats.
- Let the learner remove rules because they cause friction — rules exist for reasons.
- Let the learner contradict documented exceptions (e.g., removing the hydration guard useEffect suppression).
- Let the learner duplicate Biome enforcement — if Biome catches it, no need for an agent rule.
- Let the learner edit agent definition files (`.claude/agents/*.md`) directly — propose changes and let the orchestrator review.
- Skip the learner because "nothing interesting happened." Run it on every branch. Absence of findings is itself data.
## What The Learner Tracks
- Issue frequency table: pattern name, first seen, count, last seen, status (watching/rule-proposed/rule-added)
- Lessons per session: what went wrong, what got fixed, what changed
- Positive signals: patterns that stopped recurring after a fix
- False positive tracking: findings that turned out to be wrong
## When To Apply Rule Changes
The learner proposes, the orchestrator decides. Apply a change when:
1. The pattern has 2+ occurrences across different ROUNDS or different BRANCHES (not just different files in one round). A branch produces at most three pooled fixup commits, so a commit-keyed threshold would throttle promotion.
2. The proposed rule is specific enough to be mechanically checked.
3. The rule doesn't conflict with existing documented exceptions.
4. The change is in the right place (Biome for formatting, code-style.md for structure, security.md for security).
## Sweep On Rule Promotion
When a pattern is promoted to a hard rule (count≥2 triggers a write to `security.md`, `code-style.md`, or `biome.json`), the orchestrator schedules a one-time repo sweep for all existing instances — not only the call sites that triggered the promotion. The sweep produces either same-session fixes (≤10 lines per site) or GitHub Issues for each remaining offender.
**A sweep declared complete must STATE THE COMMAND and PASTE ITS OUTPUT.** "Audited every instance and found them all accurate" is unfalsifiable prose and carries no evidentiary weight — §10 cl.5 governs it exactly as it governs any other claim. **Where the promoted rule has a MECHANICAL ENFORCER — a hook, a test harness, a CI script — run THAT as the sweep and paste its summary.** Where the enforcer distinguishes GRADED from UNGRADED work, paste both: a green `run-mutations.mjs` says every ENCODED mutation was caught; `--coverage` says which claim sites a `// GROUP:` marker links to one, and which none does. A completeness claim needs the completeness command.
### Downstream-enforcer sync (in addition to the code sweep)
The code sweep above fixes existing *call sites*. It does NOT keep the **static rule mirrors** current. When a promotion writes to `docs/security.md` or `.claude/rules/security.md`, the orchestrator must also audit the enforcers that carry a hand-maintained mirror of those rules and add a matching entry **in the same session**:
- **`.claude/agents/security-auditor.md`** — the pre-push gate's enumerated checklist. It does not auto-track `docs/security.md`; a promoted rule with no matching check is enforced everywhere *except* the final pre-push defense.
- **`.coderabbit.yaml`** — owned by coderabbit-sync, whose full trigger set is `code-style.md`, `.claude/rules/security.md`, `docs/security.md`, `biome.json`, `CLAUDE.md`, and any new or changed `.claude/hooks/*.mjs` mechanical guard (see `agent-coderabbit-sync.md § Trigger Conditions` — the canonical list). Named here because it cannot follow a pointer and so must carry inline text.
- **The rest of the mirror set** — do not work from a list here: `agent-workflow.md § Rule-Mirror Sync` owns the canonical mirror table and is the enumeration to read, including the rows a doc-shaped glob misses (`.claude/hooks/*.sh`, `package.json`) and the recursive `.claude/skills/**/*.md` — its open-ended row being any other binding doc that re-states the mechanics, notably `docs/database.md`, whose §7 describes what the security-auditor flags.
This is the enforcer analogue of the call-site sweep. A promotion is not complete until every static mirror carries the rule.
