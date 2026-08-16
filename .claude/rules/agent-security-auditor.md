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
- Let the auditor's timeout (`AUDIT_TIMEOUT_SECS`, 300s since 2026-08-16) be a reason to skip. A timeout FAILS CLOSED — it blocks the push, and there is no fallback approval — so the only way past it is to make the audit finish, never to bypass it. **Diagnose before assuming diff size:** the 120s cap was hit twice on a 1012-line filtered diff, far under `MAX_DIFF_LINES`, so truncation was never involved — 981 added lines of grader SQL across five functions (four of them SECURITY DEFINER) simply needs ~197s to audit on the merits. Reach for splitting the push only once you have confirmed the diff is genuinely oversized; otherwise the budget is the thing that is wrong.
- Commit `.env*` files, even if the auditor didn't catch them (pre-commit hook should block these too).

## What This Agent Checks
- Secret exposure: API keys, tokens, passwords in code or config
- Service role key: must only exist in `packages/db/src/admin.ts`, never `NEXT_PUBLIC_`
- Answer exposure: `SELECT *` from questions, missing `get_quiz_questions()` RPC usage
- RLS: a command the table is intended to permit with no policy covering it, a policy whose predicate is too broad, disabled RLS on new tables, `ENABLE ROW LEVEL SECURITY` without `FORCE ROW LEVEL SECURITY` (without FORCE, RLS does not bind the table owner) — never a clause the command cannot carry, and never a merely absent `WITH CHECK` on `FOR ALL`/`FOR UPDATE` (PostgreSQL reuses `USING` as the write check there). But DO flag the predicate itself when the write needs a DIFFERENT one from the read: a reused `USING` constrains only the columns it names, so a hypothetical `FOR ALL USING (student_id = auth.uid())` session policy with no `WITH CHECK` would let an owner write any OTHER column — `score_percentage`, `mode`, `config` — the session-forgery primitive. (Illustrative: the real `quiz_sessions` is separately defended by the mig `20260605000001` column grant and `trg_quiz_sessions_immutable_columns`.) Absent clause: never a finding. Too-broad predicate: always one. (See `docs/security.md` §3.)
- Hard DELETEs: any `DELETE FROM` without `WHERE deleted_at`
- Immutable table violations: UPDATE/DELETE on `audit_events`, `student_responses`, `quiz_session_answers`
- SECURITY DEFINER RPCs: missing `auth.uid()` check, missing `SET search_path = public`
- Input validation: Server Actions or API routes without Zod `.parse()`
- Security headers: CSP, HSTS, X-Frame-Options in `next.config.ts`
- Soft-delete filter in SECURITY DEFINER SELECTs (docs/security.md §15); audit-event INSERT subquery soft-delete (§11c); per-caller RPC multiple-permissive-RLS scoping (§3); single-active-session start guard (§11d); sibling guard-set parity (§11c, advisory/MEDIUM)

## Checklist ↔ security.md sync

The auditor's enumerated checklist (`.claude/agents/security-auditor.md`) is a hand-maintained mirror of the binding rules in `docs/security.md`; it does not auto-track the doc. When a security rule is promoted, a matching check must be added to the auditor **in the same session** — enforced by `.claude/rules/agent-learner.md` §Sweep-On-Rule-Promotion (Downstream-enforcer sync). This note keeps the obligation discoverable from the auditor's own rules file.

---

*Last updated: 2026-08-16 (timeout raised 120s → 300s via `AUDIT_TIMEOUT_SECS`; the NEVER bullet no longer presumes an oversized diff is the cause. Prior: 2026-07-08 — added downstream-sync note + auditor checks for docs/security.md soft-delete-in-RPC / audit-subquery / multiple-permissive / single-active / sibling-parity rules).*
