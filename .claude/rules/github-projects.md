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

## Labels

| Group | Labels |
|-------|--------|
| Phase / sprint | `phase-1`…`phase-5`, `sprint-1`+ |
| Work type | `tech-debt`, `testing`, `bug`, `enhancement`, `feature`, `documentation`, `security` |
| Not engineering work | `ops`, `product-decision` |
| Priority (stale-exempt) | `P0 - Critical` |
| Applied by automation | `stale` (by `stale-issues.yml`), `coderabbit` |
| GitHub defaults, mostly unused | `duplicate`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix` |

`wontfix` is the one default our rules tell you to reach for — the Apply-vs-Defer **DO** list in
`agent-workflow.md` says to close an aging deferred issue as `wontfix`. Nothing carries it yet
(measured 2026-08-19: 0 issues, 0 PRs), same as the other five. Note the neighbouring
`§ "Won't do" is a valid verdict at file time` is about NOT filing at all — no issue, so no label.
This table is the complete label set as of 2026-08-19; `gh label list` is the source of truth if it
has moved since.

`ops` marks work no PR can close — infra, DNS, vendor tiers, tokens, compliance, production script runs. `product-decision` marks work blocked on scoping rather than on engineering capacity. **Both are excluded when counting the engineering backlog**; an issue carrying either is not a queue item.

### Board fields are NOT labels

The Priority / Size / Sprint values in the table above are **project-board fields**. `actions/stale` matches **repo labels only**, so a board field value cannot appear in `exempt-issue-labels` and do anything.

This bit us: `exempt-issue-labels` carried `P0 - Critical` from the day the workflow was written, while no such *label* existed — so the entry was inert and critical issues had no stale protection at all. Nothing was wrongly closed (no issue ever carried a `P`-prefixed label), but the protection everyone assumed was there wasn't. A `P0 - Critical` **label** now exists to back the entry.

Consequence: `P0 - Critical` exists in two places — as a board field value and as a label — and **nothing keeps them in sync**. Set both when an issue is genuinely a blocker; the board field drives the board, the label drives the stale bot.

### Stale bot

`.github/workflows/stale-issues.yml` marks an issue stale after 30 days of inactivity and closes it 30 days later as `not_planned`. `exempt-issue-labels` is its skip list: `P0 - Critical`, `bug`, `security`, `ops`, `product-decision`. Adding a label to that list is how work gets parked without the bot closing it — and every entry in the list must be a label that actually exists.

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

*Last updated: 2026-08-19 (label table completed with the GitHub defaults, `wontfix` among them — `agent-workflow.md` tells you to use it; board-field-vs-label distinction added after `exempt-issue-labels` was found listing a `P0 - Critical` label that did not exist; stale-bot skip list documented.)*
