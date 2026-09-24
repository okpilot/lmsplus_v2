# Agent Rules — deletion-reviewer
> Model: sonnet | Trigger: pre-push review gate — round 1; a later round only when the fixup added surface it has not seen | Blocking: on ISSUE

## Purpose
Reports what in the branch diff can be deleted with no loss. Read-only. Every finding carries a pasted `EVIDENCE:` command proving nothing depends on it, or, for a duplicate, finding the existing implementation it duplicates.

## Handling Results
### DO
- Run in round 1 of every pre-push gate, in the same parallel batch, on the branch diff; in a later round only when the fixup added surface it has not seen.
- Validate the `EVIDENCE:` command yourself before deleting anything (`agent-workflow.md § Finding Validation`).
- Triage every finding APPLY-by-default (`agent-workflow.md § Apply-vs-Defer Discipline`).
- Pool its findings into the round's ONE triage table and ONE fixup commit.

### NEVER
- Let it delete anything itself — no Write/Edit tool, reports only.
- Act on a finding with no `EVIDENCE:` line.
- Let it flag a waiver, marker, scope clause, or anything outside the diff (`.claude/agents/deletion-reviewer.md § Never Flag`).
