# End-of-session wrap-up

Sync the project board, docs, and leave things clean for next session.

## Checklist

### 1. Board sync

- List all items currently "In Progress" on the board:

  ```bash
  gh project item-list 2 --owner okpilot --format json
  ```

- For each: is it actually done? → close the issue. Still in progress? → leave it, add a comment with current state.
- Any work done this session that has no issue? → create one and close it.

### 2. New issues discovered

- Any bugs found during this session? → create issues, add to board with Priority + Size.
- Any tech debt noted? → create issues with `tech-debt` label.
- Any feature ideas discussed? → create draft issues or full issues as appropriate.

### 3. Docs sync

- Is `docs/plan.md` status section current? Update if needed.
- Any decisions made this session? → check `docs/decisions.md`.

### 4. Session summary

Present to user:
- **Done this session:** list of closed issues
- **Still in progress:** list of items left open (with context)
- **New issues created:** list with priority
- **Board state:** X todo / Y in progress / Z done (current sprint)

### 5. Next session hint

- What should the next session start with?
- Any blockers or dependencies to resolve before then?
