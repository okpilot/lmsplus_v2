Enter planning mode for the next task.

## What to do
1. **Check the board** — is there an issue for this task?
   ```bash
   gh project item-list 2 --owner okpilot --format json
   ```
   If yes, move it to **In Progress**. If no, create one.

2. Read `docs/plan.md` — identify current phase and next task
3. Read any relevant docs (database.md for DB tasks, security.md for auth tasks)
4. Break the task into steps, ordered by dependency
5. Identify files to create vs modify
6. Flag any blockers or open questions before starting
7. Present the plan concisely — confirm with user before executing

Always plan before touching code. A 2-minute plan prevents 20 minutes of rework.
