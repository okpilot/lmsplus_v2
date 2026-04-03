Enter planning mode for the next task.

## What to do
1. **Check the board** — is there a related issue? If yes, move to **In Progress**. If no, create one.
2. **Read context** — `docs/plan.md` + relevant docs (database.md, security.md, decisions.md)
3. **Root cause check** — trace the code, understand *why* the problem exists. Is the described fix the RIGHT fix? (see `agent-workflow.md`)
4. **Requirement interview** — surface ambiguities in 3 categories: scope boundaries, behavioral ambiguities, priority trade-offs. Skip for clear bug fixes.
5. **Create spec** — if 3+ files affected, create a spec via spec-workflow MCP (`spec-workflow-guide`). Skip for small changes.
6. **Break into steps** — ordered by dependency, identify files to create vs modify
7. **Run plan validation** — impact analysis, contract check, pattern scan, doc/schema check, security surface (see `agent-workflow.md § Plan Validation`)
8. **Plan-critic review** — run plan-critic agent to challenge the plan. Skip for single-file changes under 10 lines.
9. **Present to user** — concise plan with files, risks, and validation results. Confirm before executing.
10. **Flag blockers** — dependencies, open questions, or risks that need resolution before work starts.

Always plan before touching code. A 2-minute plan prevents 20 minutes of rework.
