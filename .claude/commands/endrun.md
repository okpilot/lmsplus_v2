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
  exact figure, record the baseline at run START:
  `{ git rev-parse HEAD; date -u +%FT%TZ; } > .claude/.run-start`
  — if that file exists, use its timestamp as the run start instead of the first commit.

## Steps

1. **Gather git activity** (current branch vs `origin/master`):
   ```bash
   git fetch origin || { echo 'fetch failed — ABORT, do not write a run row'; exit 1; }
   git rev-parse --verify origin/master^{commit} >/dev/null || { echo 'origin/master unresolvable — ABORT'; exit 1; }
   BR=$(git branch --show-current)
   git rev-list --count origin/master..HEAD
   git log origin/master..HEAD --format='%at' | sed -n '1p;$p'   # last, first epoch
   git diff origin/master...HEAD --shortstat
   git log origin/master..HEAD --format='%h %ai %s'
   ```
   - Commit span = first → last commit (HH:MM). Prefer `.claude/.run-start` if it exists.
   - Note if the branch predates this run (older commits) so the span isn't over-claimed.
   - **Per-run baseline:** when `.claude/.run-start` exists (written at run START via
     `{ git rev-parse HEAD; date -u +%FT%TZ; } > .claude/.run-start`), compute commits/diff/span
     from its recorded SHA (`<SHA>..HEAD`) instead of `origin/master..HEAD`. (Two-dot is safe for the shortstat here specifically because `.run-start` records `git rev-parse HEAD`, always an ancestor of HEAD, so two-dot and three-dot coincide; do NOT generalise two-dot to other diffs.) If it's absent, fall back to
     `origin/master..HEAD` and add an explicit caveat in the row: "may include earlier work on a
     long-lived branch". After the run row is written, DELETE `.claude/.run-start` so it can't
     leak into the next run.

2. **PRs**: `gh pr list --head "$BR" --repo okpilot/lmsplus_v2 --json number,state,url` — list PRs currently associated with the branch (`gh pr list --head` cannot distinguish which were opened during this run).

3. **Token / cost**: if the user pasted `/usage` or `/cost`, add it to the **cumulative
   snapshot table** (it's a rolling total, not this run's slice). The run row itself has no
   cost column — cost lives ONLY in the cumulative table (see the log header note).

4. **Append the run row** to `.claude/run-log.md` (create the file with the header below if
   absent). One row per run, matching the 7-column header exactly:
   ```
   | <YYYY-MM-DD> | <branch / run name> | <N> | <files> files · +<ins> / −<del> | <PRs or —> | <span> | <one-line summary of what shipped> |
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

## Cumulative cost (`/usage` snapshots)

Rolling total across all recent work (not one run).

| Date | Total | API time | Wall time | Lines | Top model |
|------|-------|----------|-----------|-------|-----------|
```

## Notes

- `.claude/.run-start` is ephemera; don't commit it.
- Do NOT invent token/cost numbers. `not captured` is correct when nothing was pasted, and
  pasted `/usage` totals go in the cumulative table (never attributed to one run).
