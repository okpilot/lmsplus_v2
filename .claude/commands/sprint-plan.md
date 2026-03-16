Plan a new sprint with the user.

## What to do

1. **Review last sprint** — pull completed items from the board:
   ```bash
   gh project item-list 2 --owner okpilot --format json
   ```
   Summarize: how many items completed, any carried over, velocity trend.

2. **Show open backlog** — list all Todo items with Priority and Size:
   - Open issues on the board
   - Known issues from `docs/plan.md`
   - Any new ideas the user wants to discuss

3. **Discuss with user** — present backlog items grouped by theme. Ask:
   - What's most important this week?
   - Any new features to add?
   - Any items to deprioritize or remove?
   - **Do NOT auto-decide priorities. The user picks.**

4. **Create issues** for any new items agreed on:
   ```bash
   gh issue create --repo okpilot/lmsplus_v2 --title "..." --body "..." --label "..."
   ```

5. **Assign sprint** — for each agreed item, set:
   - Priority (P0/P1/P2)
   - Size (S/M/L/XL)
   - Sprint iteration (current)

6. **Show the sprint summary** — table of items with priority, size, and total scope.

## Rules
- Never assign items to a sprint without user agreement.
- Keep sprints realistic — don't overload. 1 XL or 2-3 L items per week max.
- P0 items always go into the current sprint.
- Leave buffer for unexpected bugs and tech debt.
- After sprint planning, update `docs/plan.md` with the new sprint section.
