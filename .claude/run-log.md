# Run Log

One row per **run** — a discrete unit of work (a fix, a feature slice, an `/automerge`
batch). Written by `/endrun`. Git figures are exact for rows written by `/endrun` at run end;
rows tagged `[backfilled ...]` are approximate reconstructions from memory records.
**Span** is commit-derived (approximate).
**Cost** is a rolling cumulative total from `/usage` — it can't be sliced per run, so it lives
in its own table below, never attributed to a single row.

## Runs

| Date | Run | Commits | Diff | PR | Span | Result |
|------|-----|:-------:|------|----|------|--------|
| 2026-07-04 | #1085 Save-for-later fix | ~4 | 23 files · +1674 / −320 | #1086 · open | ~2h41m | ✅ 17/17 CI green · CR approved · manual Chrome eval passed |
| 2026-07-07 | Night /automerge batch (Jul 6–7) | ~21 | 30 files · +890 / −124 | #1090 #1091 #1092 #1093 · all merged | overnight (merges 16:33–17:28 UTC) | ✅ 4 PRs merged to master · #1065 closed · CI green [backfilled 2026-07-11] |
| 2026-07-08 | /autonomerge VFR-RT redesign (report wording + Practice setup + RT type filter) | ~26 | ~96 files · +3864 / −1807 (final PR totals incl. later CR fixes) | #1097 #1098 #1099 · pushed, left open | ~17h (commit-derived, 01:34–19:17) | ✅ built + pushed, no merges per /autonomerge · #1100 filed [backfilled 2026-07-11] |
| 2026-07-10 | #1097 CR-fix round (pageParam escape, quick_quiz restriction, page-overflow extraction) | 6 | 9 files · +126 / −29 | #1097 · merged 2026-07-10 | ~2h32m (16:46–19:18) | ✅ CR findings applied · all 4 post-commit agents clean · PR #1097 merged (6th commit = the merge) [backfilled 2026-07-11] |

## Cumulative cost (`/usage` snapshots)

Rolling total across all recent work (not one run).

| Date | Total | API time | Wall time | Lines | Top model |
|------|-------|----------|-----------|-------|-----------|
| 2026-07-04 | $890.67 | 1d 0h 26m | 1d 18h 51m | +18,014 / −2,878 | opus-4-8 $668.51 · sonnet-5 $111 · sonnet-4-6 $99 · haiku $12 |
