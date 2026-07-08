# Agent Rules — learner

> Model: sonnet | Trigger: after all 4 post-commit agents report | Non-blocking

## Purpose
Identifies recurring patterns across agent findings. Proposes rule changes, Biome config updates, or memory updates only when a pattern repeats (2+ occurrences across different commits). Prevents the same mistakes from happening repeatedly.

## Handling Results

### DO
- Run the learner after every full post-commit cycle (all 4 agents reported, fixes committed).
- Trust its pattern detection — it tracks frequencies across commits in `.claude/agent-memory/learner/MEMORY.md`.
- Apply rule changes the learner proposes if the pattern has 2+ occurrences AND the change is specific and actionable.
- Note when the learner reports a pattern did NOT recur — that's a positive signal the fix worked.
- Let the learner update its own memory file with new patterns and lessons.

### NEVER
- Change rules based on a single occurrence. Log it, watch it, change on 2+ repeats.
- Let the learner remove rules because they cause friction — rules exist for reasons.
- Let the learner contradict documented exceptions (e.g., removing the hydration guard useEffect suppression).
- Let the learner duplicate Biome enforcement — if Biome catches it, no need for an agent rule.
- Let the learner edit agent definition files (`.claude/agents/*.md`) directly — propose changes and let the orchestrator review.
- Skip the learner because "nothing interesting happened." Run it every cycle. Absence of findings is itself data.

## What The Learner Tracks
- Issue frequency table: pattern name, first seen, count, last seen, status (watching/rule-proposed/rule-added)
- Lessons per session: what went wrong, what got fixed, what changed
- Positive signals: patterns that stopped recurring after a fix
- False positive tracking: findings that turned out to be wrong

## When To Apply Rule Changes
The learner proposes, the orchestrator decides. Apply a change when:
1. The pattern has 2+ occurrences across different commits (not just different files in the same commit).
2. The proposed rule is specific enough to be mechanically checked.
3. The rule doesn't conflict with existing documented exceptions.
4. The change is in the right place (Biome for formatting, code-style.md for structure, security.md for security).

## Sweep On Rule Promotion
When a pattern is promoted to a hard rule (the count≥2 threshold above triggers a write to `security.md`, `code-style.md`, or `biome.json`), the orchestrator must schedule a one-time repo sweep for all existing instances of the pattern — not only the call sites that triggered the promotion. The sweep produces either same-session fixes (≤10 lines per site) or GitHub Issues for each remaining offender. Without this step, the rule is enforced on new code while pre-existing offenders silently linger (e.g., issue #573 — `start_quiz_session` audit subquery missed when security.md §10 was promoted via #550 at count=3).

### Downstream-enforcer sync (in addition to the code sweep)
The code sweep above fixes existing *call sites*. It does NOT keep the **static rule mirrors** current. When a promotion writes to `docs/security.md` or `.claude/rules/security.md`, the orchestrator must also audit the enforcers that carry a hand-maintained mirror of those rules and add a matching entry **in the same session**:
- **`.claude/agents/security-auditor.md`** — the pre-push gate's enumerated checklist. It does not auto-track `docs/security.md`; a promoted rule with no matching check is enforced everywhere *except* the final pre-push defense. (Observed drift: `docs/security.md` soft-delete-in-RPC / audit-subquery / multiple-permissive / sibling-guard-parity / single-active rules had no auditor checks until they were back-filled.)
- **`.coderabbit.yaml`** — already owned by coderabbit-sync (triggers on `security.md`/`code-style.md` changes); named here only so the full mirror set is visible in one place.

This is the enforcer analogue of the call-site sweep: both close the "rule promoted, downstream lagging" gap. A promotion is not complete until every static mirror carries the rule.

---

*Last updated: 2026-04-28*
