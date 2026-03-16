# GitHub Projects — Board Sync Rules

> Project: "LMS Plus v2 — Build Plan" (#2)
> URL: https://github.com/users/okpilot/projects/2
> Repo: okpilot/lmsplus_v2

---

## Board Structure

| Field | Type | Values |
|-------|------|--------|
| Status | Single select | Todo, In Progress, Done |
| Priority | Single select | P0 - Critical, P1 - Important, P2 - Nice to have |
| Size | Single select | S, M, L, XL |
| Sprint | Iteration | 1-week cycles |

Labels: `phase-1` through `phase-5`, `sprint-1`+, `tech-debt`, `testing`, `bug`

## During Work

### When starting a task linked to an issue

1. Move the issue to **In Progress** on the board:

   ```bash
   # Get item ID, then update status
   gh project item-list 2 --owner okpilot --format json | python3 -c "..."
   gh project item-edit --project-id PVT_kwHOB7qFm84BRy8i --id <ITEM_ID> --field-id PVTSSF_lAHOB7qFm84BRy8izg_hJ0E --single-select-option-id 47fc9ee4
   ```

### When committing a fix for an issue


- Use `Closes #N` or `Fixes #N` in the commit message — GitHub auto-closes the issue and the board automation moves it to Done.
- If the commit doesn't fully resolve the issue, don't use closing keywords.

### When discovering new work mid-session

- Create a GitHub issue with appropriate labels.
- Add to project board with Priority + Size.
- Assign to current Sprint if it's urgent, or leave in backlog (no Sprint) if it can wait.

## Issue Creation Convention

```bash
gh issue create --repo okpilot/lmsplus_v2 \
  --title "Short descriptive title" \
  --body "Description of what and why" \
  --label "label-name"
```

Then add to project:

```bash
gh project item-add 2 --owner okpilot --url <issue-url>
```

## Field IDs (for CLI operations)

```text
Project ID:     PVT_kwHOB7qFm84BRy8i
Status field:   PVTSSF_lAHOB7qFm84BRy8izg_hJ0E
  Todo:         f75ad846
  In Progress:  47fc9ee4
  Done:         98236657
Priority field: PVTSSF_lAHOB7qFm84BRy8izg_hNXQ
  P0:           0e3f4a96
  P1:           6cbe573d
  P2:           83cbed3a
Size field:     PVTSSF_lAHOB7qFm84BRy8izg_hNXU
  S:            3f463daa
  M:            3edf753f
  L:            6c73e86d
  XL:           447b5de7
```

## DO

- Keep the board in sync with reality — no stale "In Progress" items.
- Use `Closes #N` in commits when the work resolves an issue.
- Create issues for any non-trivial work discovered mid-session.
- Set Priority + Size on every new issue.

## NEVER

- Create issues for work that's already done (unless backfilling the board).
- Leave items in "In Progress" at end of session without explanation.
- Change Sprint assignments without discussing with the user.
- Skip board updates because "it's a small fix" — all tracked work goes through the board.

---

*Last updated: 2026-03-15*
