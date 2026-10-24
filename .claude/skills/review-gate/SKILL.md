---
name: review-gate
description: Orchestrator-only rules for planning, the pre-push review gate, finding triage and rule edits. Load before planning a multi-file change, dispatching any gate agent (plan-critic, reviewers, red-team, coderabbit-sync, security-auditor), triaging findings, or editing a rule or its mirrors.
---

# Review gate — orchestrator rules

The orchestrator loads this skill; subagent definitions cite individual files in it.

| File | Read when |
|---|---|
| `agent-workflow.md` | planning, plan validation, the gate loop, finding validation, apply-vs-defer, PR/push batching, rule-mirror sync, delegation |
| `agent-critic.md` | dispatching plan-critic; loop round discipline |
| `agent-code-review.md` | dispatching code-review (skill) |
| `agent-semantic-reviewer.md` | handling semantic-reviewer results |
| `agent-doc-updater.md` | applying doc-updater edits |
| `agent-test-writer.md` | handling test-writer output |
| `agent-e2e-writer.md` | handling e2e-writer output |
| `agent-red-team.md` | red-team trigger and results |
| `agent-coderabbit-sync.md` | coderabbit-sync trigger and results |
| `agent-coderabbit.md` | triaging cloud CodeRabbit findings |
| `agent-security-auditor.md` | pre-push auditor results |
