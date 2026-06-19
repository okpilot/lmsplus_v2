---
name: vfr-rt-review-notes
description: VFR-RT (#697) false-positive suppressors — do-not-flag facts for the VFR RT exam migrations/RPCs
metadata:
  type: project
---

## VFR RT (#697) — do-not-flag facts

Relocated from a misplaced `apps/web/.claude/agent-memory/` snapshot (subagent ran with cwd=apps/web during Phase A). These are confirmed-correct patterns in the VFR-RT migration family — do NOT raise as ISSUE/CRITICAL.

- **`complete_overdue_exam_session` and `complete_empty_exam_session` mode guards must include `'vfr_rt_exam'`** from mig 102 onward. A guard listing only `mock_exam`/`internal_exam` is the *pre-mig-102* shape — trace to the latest definition before flagging.
- **`normalize_answer` (mig 101) is defined AFTER `submit_vfr_rt_exam_answers` (mig 100)** in apply order. Safe — plpgsql resolves function references at execution time, not CREATE time. Both ship in the same release. Do not flag as "missing function".
- **`UNIQUE NULLS NOT DISTINCT` is Postgres 17 syntax**; the project runs PG17 (`supabase/config.toml`). Valid — do not flag as unsupported.
- **`ON CONFLICT DO NOTHING` (no column list) on `student_responses`** is intentional by design — the mig 095 header comment explains it matches any constraint; 095c intentionally does not update this. Do not flag.
- **`docs/database.md` detail RPC sections drift from the summary table** when only the summary row is updated — always check BOTH the summary row AND the full detail section when a function's behavior changes (see [pr-697-phase-a](pr-697-phase-a.md) for the `complete_overdue` instance).
