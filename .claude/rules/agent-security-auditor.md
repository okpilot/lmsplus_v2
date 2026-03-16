# Agent Rules — security-auditor

> Model: sonnet | Trigger: pre-push (Lefthook) | Blocking on CRITICAL/HIGH

## Purpose
Final defense before code reaches the remote. Scans the push diff for security vulnerabilities, secret leaks, RLS gaps, correct-answer exposure, and immutable table violations. This is the last gate — if it blocks, the push does not proceed.

## Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Exploitable now: secret in code, answers exposed, RLS disabled | Block push. Fix immediately. No negotiation. |
| HIGH | Serious gap: hard DELETE, missing auth check, unvalidated input | Block push. Fix before retrying. |
| MEDIUM | Potential concern: unvalidated cast, console.log with user data | Warn. Mention to user. Push proceeds if user approves. |

## Handling Results

### DO
- Fix all CRITICAL and HIGH findings before retrying the push.
- Ask the user about MEDIUM findings — let them decide whether to fix now or accept the risk.
- Trust the auditor's security classifications — it checks against `docs/security.md`.
- Re-run the auditor after fixing (Lefthook does this automatically on the next push attempt).
- Treat a finding about correct-answer exposure as CRITICAL regardless of what severity the auditor assigns.

### NEVER
- Bypass the auditor with `--no-verify`. Ever.
- Push with unresolved CRITICAL or HIGH findings.
- Downgrade a finding's severity to make a push go through.
- Dismiss a finding because "RLS will catch it" — defense in depth means every layer must be correct.
- Let the auditor's timeout (120s) be a reason to skip — if it times out, investigate why the diff is too large.
- Commit `.env*` files, even if the auditor didn't catch them (pre-commit hook should block these too).

## What This Agent Checks
- Secret exposure: API keys, tokens, passwords in code or config
- Service role key: must only exist in `packages/db/src/admin.ts`, never `NEXT_PUBLIC_`
- Answer exposure: `SELECT *` from questions, missing `get_quiz_questions()` RPC usage
- RLS: missing policies, `USING` without `WITH CHECK`, disabled RLS on new tables
- Hard DELETEs: any `DELETE FROM` without `WHERE deleted_at`
- Immutable table violations: UPDATE/DELETE on `audit_events`, `student_responses`, `quiz_session_answers`
- SECURITY DEFINER RPCs: missing `auth.uid()` check, missing `SET search_path = public`
- Input validation: Server Actions or API routes without Zod `.parse()`
- Security headers: CSP, HSTS, X-Frame-Options in `next.config.ts`

---

*Last updated: 2026-03-12*
