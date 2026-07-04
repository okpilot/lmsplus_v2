---
name: multi-round-critic-protocol-draft
description: Plan-review notes on the multi-round-critic-protocol draft (agent-critic.md / agent-workflow.md): numeric-cap drift and learner double-counting risk.
metadata:
  type: project
---

## Multi-round critic protocol DRAFT review notes

Relocated verbatim from plan-critic MEMORY.md (curated to stay under the 25 KB native-injection cap). Plan-review notes on the multi-round-critic-protocol draft (agent-critic.md / agent-workflow.md): numeric-cap drift and learner double-counting risk.

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Rules-change proposals that claim to "keep existing caps" while actually replacing the numeric values (e.g. plan-critic 1-round cap → 4-round ceiling, impl-critic 2-round cap → 4). The proposal text says "KEEPS that ceiling" but changes the numbers. Plan-critic must diff proposed numeric values against the binding text in agent-critic.md and agent-workflow.md. Deeper issue: for impl-critic the artifact mutates every fix round — "consecutive clean" on a moving target is incoherent; floor logic only works on stable artifacts (plan-critic). Protocol proposals that apply the same floor to both gates conflate two different situations. First seen: multi-round-critic-protocol DRAFT (agent-critic.md:17,18,28; agent-workflow.md:105,221). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Process-change proposals that introduce multi-round review loops risk learner double-counting: within-gate re-finding of the same issue across rounds of the same gate on the same plan/diff should count as ONE learner occurrence, not N. The count≥2 promotion threshold (agent-learner.md line 13) requires 2 different commits/sessions; repeated round findings on the same plan inflate counts artificially. Any protocol adding review rounds must explicitly restrict learner Count increments to cross-session, cross-diff occurrences. First seen: multi-round-critic-protocol DRAFT open question #5. | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
