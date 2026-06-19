---
name: pr-697-phase-a
description: Cross-commit doc drift found in PR-level sweep for #697 Phase A (feat/697-vfr-rt-phase-a)
metadata:
  type: project
---

## PR #697 Phase A — Pre-Push PR Sweep Findings (2026-06-10)

**Branch:** feat/697-vfr-rt-phase-a (8 commits, migs 094–103)

### ISSUE found: database.md complete_overdue detail section not updated for vfr_rt_exam

**What changed:** Mig 102 extends `complete_overdue_exam_session` to accept `mode = 'vfr_rt_exam'` and adds per-part grading logic (mig 100 formulas) for that mode.

**What was updated:** The RPC summary row in `docs/database.md` (line ~700) was updated to include `vfr_rt_exam`.

**What was NOT updated (drift):**
- Line 1384: Opening sentence still says "Completes a `mock_exam` or `internal_exam` session" — missing `vfr_rt_exam`.
- Lines 1394–1396: **Score computation** block still describes only the old `correct_count/total_questions * 100` formula and mode-specific incompleteness rule — does not mention the per-part vfr_rt_exam grading branch.
- Line 1404: **Mode guard** bullet still says "RAISE if mode is not `mock_exam` or `internal_exam`" — should say "not in (`mock_exam`, `internal_exam`, `vfr_rt_exam`)".

**Severity:** ISSUE (doc drift; downstream Phases C/D engineers reading this section will see incorrect behavior descriptions for vfr_rt_exam mode).

**Fix:** Add a "**VFR RT extension (mig 102):**" paragraph to the detailed section (matching the "Internal-exam extension" paragraph at line 1413) and update the Mode guard bullet.

### GOOD patterns observed

- RPC summary table updated alongside code changes (per doc-updater cross-reference audit rule).
- security.md §15 immutable write-once exception properly extended to list all 4 new RPCs.
- decisions.md 41–43 text accurately describes implemented behavior.
- Integration tests follow the non-vacuous isolation pattern (code-style.md §7 red-team rules): cross-org admin test seeds the question in org1 and asserts 0 rows for org2 admin — not vacuous.
- Two distinct fixture outcomes in submit test (passing 100/100/100 + failing Part 2) satisfy code-style.md §7 idempotency RPC spec rule.
- `complete_overdue_exam_session` test does NOT assert `score_percentage` value (which would be the per-part mean, not the old formula) — test type includes `score_percentage` in the cast but doesn't assert it, avoiding a false pass/fail.
- `ON CONFLICT DO NOTHING` (no column list) on `student_responses` in 095c is intentional by design and documented in mig 095 header.
