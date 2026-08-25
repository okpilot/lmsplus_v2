# Agent Rules — semantic-reviewer

> Model: sonnet | Trigger: post-commit | Blocking: on CRITICAL/ISSUE

## Purpose
Deep logic and security review at CodeRabbit depth. Catches what lint can't: logic bugs, security gaps (answer exposure, auth bypass, RLS holes), behavioral inconsistencies, data flow errors, query correctness, architectural violations.

## Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Exploitable security gap or data loss bug | Stop everything. Fix immediately. Re-run reviewer on the fix. |
| ISSUE | Real bug or gap, even if not triggerable today | Fix now. Same session. No deferral. No "safe today" rationalization. |
| SUGGESTION | Improvement, not a current gap | Fix if under 10 lines. Otherwise triage via `agent-workflow.md § Apply-vs-Defer Discipline`: apply by default; DEFER to a GitHub Issue (with the reviewer's full rationale) only when all three defer conditions hold (≥30 LOC, separate concern, needs a design decision) AND the PR still clears both defer budgets — volume and filed-vs-closed ratio. |
| GOOD | Positive pattern worth noting | Acknowledge in summary. No action needed. |

## Handling Results

### DO
- Fix every ISSUE in the same session. If the reviewer says it's a gap, it's a gap.
- Use the reviewer's suggested fix as a starting point — it usually has the right approach.
- After fixing, re-run the semantic reviewer on the fix commit if production code changed.
- Trust the reviewer's security findings — they check against `docs/security.md`.
- Include the reviewer's reasoning when reporting to the user so they understand the "why."
- Treat "forward-looking" gaps the same as current gaps — code should be correct regardless of current call sites.
- Before flagging a column / constraint / whitelist as missing, dropped, or "narrowed," trace the `CREATE OR REPLACE FUNCTION` / `DROP FUNCTION` + `CREATE FUNCTION` **and** `ALTER TABLE` / `CREATE [UNIQUE] INDEX` / CHECK chain to the LATEST migration and compare against that — never against a superseded earlier one. (False-positive source, count≥2: flagging `record_consent` vs the original mig 057 when `20260327000058` had already dropped `cookie_analytics` from both the whitelist and the table CHECK, #386. Also verify `NOT IN (...)` direction — removing a value makes the function *reject* it, not accept it.)
- For a migration that changes a plpgsql body containing `ON CONFLICT`, `EXECUTE format(...)`, or other deferred-validation SQL, remember a clean `supabase db reset` does NOT prove execution-correctness (the parser defers inference-target validation to runtime). Verify `ON CONFLICT` targets resolve to a UNIQUE index and recommend an execution test — `record_consent`'s `ON CONFLICT` against a non-unique index applied clean but threw `42P10` on first call (#386).

### NEVER
- Defer an ISSUE to a future session. The fix happens now.
- Characterize an ISSUE as "latent", "not triggerable today", or "safe because of current usage." Code correctness doesn't depend on current callers.
- Skip fixing because "the UI prevents this path." SQL functions, Server Actions, and APIs must be self-defending.
- Dismiss a finding because it would require "only" a future code change to trigger. That future change will happen, and the bug will be invisible.
- Push with any unresolved CRITICAL or ISSUE.
- Overlap with code-reviewer scope — semantic reviewer checks logic, not style. If both flag the same thing, defer to semantic reviewer's classification.

## What This Agent Checks (for reference)
- Behavioral consistency across related functions
- Security: answer exposure, secret leaks, auth gaps, input validation, RLS, hard deletes
- Auth/session flow correctness
- Data flow: stale closures, race conditions, missing error paths
- Query correctness: wrong JOINs, unscoped aggregates, missing WHERE clauses
- Next.js patterns: Server Component data flow, Server Action boundaries
- Type safety: unchecked casts, missing narrowing
- **Server Action error-token map completeness:** when a Server Action calls a SECURITY DEFINER RPC and maps RPC errors to user messages (a `mapRpcError`/`ERROR_MESSAGES` token list), verify that **every** `RAISE EXCEPTION '<code>'` in the RPC body has a matching `<code>` entry in the action's map. Unmapped tokens fall through to the generic fallback — not a security leak (the raw message is still sanitized), but a UX/triage gap: a real path (e.g. a soft-deleted student hitting `user_not_found_or_inactive`) reads identically to a DB timeout. Trace the RPC's LATEST body via EVERY supersession form — an OPEN set enumerated in `agent-workflow.md`, not just the two function-body ones — for the full RAISE set, matching the function's SIGNATURE and not just its name. **Trace the reachable CALL GRAPH, not only the RPC body** — a token raised by a helper the RPC calls reaches the caller identically. `batch_submit_quiz` delegates to the `_grade_record_*` helpers, which raise their own tokens; the VFR-RT start RPC calls `complete_overdue_exam_session(uuid)`, whose latest definition raises `user not found or inactive` while the VFR map carries only `user_not_found_or_inactive`. Resolve each callee to ITS latest definition and matching signature, recursively.

- **Sibling-validator constraint parity:** when any one validator in a multi-layer validator family (e.g. a grader + its save-draft schema + its draft-load/replay validator, or sibling Zod schemas guarding the same data shape) tightens a constraint — a text-length bound, an array cap, a dedup, a `length > 0` presence check — audit **ALL** sibling validators in that family for the same constraint in the same review. A constraint present in one layer and absent in a sibling is a parity gap, not an intentional difference: the looser layer admits data the tightened layer would reject (e.g. a `[].every()` is vacuously true, so an empty-blanks draft loads as valid). Identify the full family by the data shape each guards, not by file proximity.

- **Cross-surface answer-oracle (shared question pool):** when reviewing a NEW (or newly-broadened) RPC that returns answer keys or grading-relevant data (`correct_option_id`, `is_correct`, the graded result), do NOT stop at its own local guards — enumerate every OTHER RPC and session type that reads the **same underlying question pool**, and verify the new RPC cannot be **composed** with data already client-visible elsewhere to form a mid-exam oracle. The canonical leak: an exam runner (`get_quiz_questions` / `get_vfr_rt_exam_questions`) hands the client `q.id`, and a new key-returning RPC accepts arbitrary `p_question_ids` — so a student mid-exam POSTs their exam's IDs to the new RPC and reads the keys, defeating the graded assessment even though every per-commit review passed (each surface is correct in isolation; the threat is emergent across surfaces). If the pool is shared with ANY exam session type, require an **active-exam-session deny-by-default guard** (`mode NOT IN (<practice modes>) AND ended_at IS NULL AND deleted_at IS NULL → RAISE`), mirroring `check_quiz_answer` (mig 117). This is structurally invisible to per-commit review — apply it on the PR-level sweep.

---

*Last updated: 2026-08-25*
