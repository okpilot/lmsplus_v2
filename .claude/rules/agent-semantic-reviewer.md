# Agent Rules — semantic-reviewer
> Model: sonnet | Trigger: pre-push review gate — round 1 and every later round | Blocking: on CRITICAL/ISSUE

## Purpose
Deep logic and security review at CodeRabbit depth: logic bugs, security gaps (answer exposure, auth bypass, RLS holes), behavioral inconsistencies, data flow errors, query correctness, architectural violations.

## Severity Levels
| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Exploitable security gap or data loss bug | Stop everything. Fix immediately. Re-run reviewer on the fix. |
| ISSUE | Real bug or gap, even if not triggerable today | Fix now. Same session. No deferral. |
| SUGGESTION | Improvement, not a current gap | Fix if under 10 lines. Otherwise triage via `agent-workflow.md § Apply-vs-Defer Discipline`: apply by default; DEFER to a GitHub Issue only when all three defer conditions hold (≥30 LOC, separate concern, design decision) AND the PR clears both defer budgets. |
| GOOD | Positive pattern worth noting | Acknowledge in summary. No action needed. |

## Handling Results
### DO
- Fix every ISSUE in the same session.
- Use the reviewer's suggested fix as a starting point.
- After fixing, re-run the semantic reviewer on the next round's branch diff — an APPLY finding extends the loop by one round.
- Trust the reviewer's security findings — checked against `docs/security.md`.
- Include the reviewer's reasoning when reporting to the user.
- Treat "forward-looking" gaps the same as current gaps.
- Before flagging a column / constraint / whitelist as missing, dropped, or "narrowed," trace the `CREATE OR REPLACE FUNCTION` / `DROP FUNCTION` + `CREATE FUNCTION` **and** `ALTER TABLE` / `CREATE [UNIQUE] INDEX` / CHECK chain to the LATEST migration, never a superseded earlier one. Verify `NOT IN (...)` direction — removing a value makes the function *reject* it, not accept it.
- For a migration that changes a plpgsql body containing `ON CONFLICT`, `EXECUTE format(...)`, or other deferred-validation SQL, a clean `supabase db reset` does NOT prove execution-correctness. Verify `ON CONFLICT` targets resolve to a UNIQUE index and recommend an execution test.

### NEVER
- Defer an ISSUE to a future session.
- Characterize an ISSUE as "latent", "not triggerable today", or "safe because of current usage."
- Skip fixing because "the UI prevents this path." SQL functions, Server Actions, and APIs must be self-defending.
- Dismiss a finding because it needs "only" a future code change to trigger.
- Push with any unresolved CRITICAL or ISSUE.
- Overlap with code-reviewer scope — semantic reviewer checks logic, not style; on overlap, defer to semantic reviewer's classification.

## What This Agent Checks (for reference)
- Behavioral consistency across related functions
- Security: answer exposure, secret leaks, auth gaps, input validation, RLS, hard deletes
- Auth/session flow correctness
- Data flow: stale closures, race conditions, missing error paths
- Query correctness: wrong JOINs, unscoped aggregates, missing WHERE clauses
- Next.js patterns: Server Component data flow, Server Action boundaries
- Type safety: unchecked casts, missing narrowing
- **Server Action error-token map completeness:** when a Server Action maps SECURITY DEFINER RPC errors to user messages, verify every `RAISE EXCEPTION '<code>'` in the RPC body has a matching entry. Trace the RPC's LATEST body via EVERY supersession form (`agent-workflow.md`), matching SIGNATURE not just name. **Trace the reachable CALL GRAPH** — a token raised by a helper the RPC calls reaches the caller identically; resolve each callee to its latest definition and matching signature, recursively.
- **Sibling-validator constraint parity:** when one validator in a multi-layer family (a grader + its save-draft schema + its draft-load/replay validator, or sibling Zod schemas) tightens a constraint, audit ALL sibling validators in that family for the same constraint. A constraint present in one layer and absent in a sibling is a parity gap, not an intentional difference.
- **Cross-surface answer-oracle (shared question pool):** for a NEW or newly-broadened RPC returning answer keys or grading data, enumerate every OTHER RPC/session type reading the SAME question pool and verify the new RPC cannot be COMPOSED with data already client-visible elsewhere into a mid-exam oracle. If the pool is shared with ANY exam session type, require an active-exam-session deny-by-default guard (`mode NOT IN (<practice modes>) AND ended_at IS NULL AND deleted_at IS NULL → RAISE`), mirroring `check_quiz_answer`.
- **Existing-implementation parity and callers:** new code whose paging, caps, error handling, fallback, retry or filters differ, without justification in the diff, from the repo's existing code for the same operation, and callers of changed exported code, are ISSUEs.
