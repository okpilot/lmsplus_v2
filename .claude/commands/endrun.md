# End of run — log it

Record a persistent entry for the run just completed: what shipped, git activity, and
(when the user provides it) token/API cost. A **run** is a discrete unit of work — a fix, a
feature slice, an `/automerge` batch. Appends one row to `.claude/run-log.md`.

## Important: what can and cannot be measured

- **Measurable programmatically** (via git / gh): commits, files changed, +/- lines,
  branch, PRs, and commit-timestamp span.
- **NOT accessible from a skill**: token counts, API dollar cost, and exact start time —
  those live in the Claude Code harness, not in anything Bash can read. Token/cost is
  captured **only if the user pastes `/usage` (or `/cost`) output**; otherwise the row
  records `not captured`. Note that `/usage` reports a **rolling cumulative total**, not
  a per-run slice — record it under the cumulative-snapshot table, not attributed to one run.
- **Run wall-clock** is approximated from git commit timestamps and labelled as such. For an
  exact figure, drop a marker at the start of the run: `date -u +%FT%TZ > .claude/.run-start`
  — if that file exists, use its timestamp as the run start instead of the first commit.

## Steps

1. **Gather git activity** (current branch vs `master`):
   ```bash
   BR=$(git branch --show-current)
   git rev-list --count master..HEAD
   git log master..HEAD --format='%at' | sed -n '1p;$p'   # last, first epoch
   git diff master...HEAD --shortstat
   git log master..HEAD --format='%h %ai %s'
   ```
   - Commit span = first → last commit (HH:MM). Prefer `.claude/.run-start` if it exists.
   - Note if the branch predates this run (older commits) so the span isn't over-claimed.

2. **PRs**: `gh pr list --head "$BR" --repo okpilot/lmsplus_v2 --json number,state,url` (list any opened this run).

3. **Token / cost**: if the user pasted `/usage` or `/cost`, add it to the **cumulative
   snapshot table** (it's a rolling total, not this run's slice). The run row itself has no
   cost column — cost lives ONLY in the cumulative table (see the log header note).

4. **Append the run row** to `.claude/run-log.md` (create the file with the header below if
   absent). One row per run, matching the 7-column header exactly:
   ```
   | <YYYY-MM-DD> | <branch / run name> | <N> | <files> files, +<ins>/-<del> | <PRs or —> | <span> | <one-line summary of what shipped> |
   ```

5. **Report** the row to the user and confirm it was written. One-line summary only — detail
   lives in commit messages and memory.

## Log file header (create on first run)

```markdown
# Run Log

One row per **run** — a discrete unit of work. Written by `/endrun`. Git figures are exact;
**span** is commit-derived (approximate; an exact figure needs a `.claude/.run-start` marker).
**Cost** is a rolling cumulative total from `/usage`/`/cost` — it can't be sliced per run, so
it lives in its own table, never attributed to a single row.

## Runs

| Date | Run | Commits | Diff | PR | Span | Result |
|------|-----|:-------:|------|----|------|--------|
```

## Notes

- `.claude/.run-start` is ephemera; don't commit it.
- Do NOT invent token/cost numbers. `not captured` is correct when nothing was pasted, and
  pasted `/usage` totals go in the cumulative table (never attributed to one run).
