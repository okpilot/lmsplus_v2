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

## Phase B Server Actions (commit 0dedd3c4, 2026-06-19)

- **`_error-messages.ts` RPC-raise map is intentionally partial**: only 3 of 5 RAISE tokens are mapped; `user_not_found_or_inactive` and `active_session_exists` fall through to the generic `'Failed to start exam'` fallback. The `active_session_exists` path is effectively unreachable in normal operation (unique-violation concurrent-start race). The `user_not_found_or_inactive` token is reachable (soft-deleted student with live JWT). Both are ISSUE severity per §5 sanitize — the file's own comment says "keep in sync with the RPC body".
- **`submitVfrRtExam` drops the `expired` flag from the RPC response**: the RPC returns `expired: true` on timer-expiry (a non-error success path). The Server Action discards `data` entirely and returns only `{ success: true, session_id, redirect_to }`. Phase C UI cannot distinguish a timed-out submission from a normal one without a separate DB read. Flag ISSUE on this commit; watch for Phase C UI.
- **`normalize-answer.ts` TS/SQL parity confirmed**: character-for-character same 12-char punct set, same operation order. TS regex `/[\][.,;:!?"'()]/g` strips both `[` and `]` — confirmed by Node execution. Do NOT re-flag parity issues on this normalizer.
