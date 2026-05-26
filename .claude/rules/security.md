# Security Rules — LMS Plus v2

> Full binding security reference: `docs/security.md`
> This file is a quick summary. When writing any DB/auth/API code, read `docs/security.md` first.

## Critical rules (memorise these)

1. **Correct answers** — strip via `get_quiz_questions()` RPC only. Never SELECT * questions for students.
2. **RLS** — every table needs BOTH `USING` (read) and `WITH CHECK` (write) policies.
3. **Service role key** — `packages/db/src/admin.ts` only. Never `NEXT_PUBLIC_`. Never in client components.
4. **Zod validation** — every Server Action and API route must parse input with Zod before using it.
5. **Audit log** — `audit_events` is append-only. No UPDATE or DELETE policies. Ever.
6. **Soft delete** — never hard DELETE. Always `UPDATE SET deleted_at = now()`.
7. **Auth check in RPCs** — all SECURITY DEFINER functions must call `auth.uid()` manually and raise if null.
8. **Secrets** — never commit `.env*` files. Pre-commit hook blocks them.
9. **Soft-delete in RPCs** — every SELECT inside a SECURITY DEFINER function must include `AND deleted_at IS NULL` on soft-deletable tables. SECURITY DEFINER bypasses RLS, so soft-delete filters must be manual. **Narrow exception:** SELECTs fetching records by IDs stored in an immutable, write-once column (only current case: `batch_submit_quiz` reading `questions` via `quiz_sessions.config.question_ids`, written once at session start) may omit the filter. Any new instance must cite the immutable column at the call site — see `docs/security.md` §15 and `docs/database.md` §3.

10. **Audit-event INSERT subqueries** — Every `INSERT INTO audit_events (...)` SQL block in a SECURITY DEFINER function must filter `deleted_at IS NULL` on any user/session/question/membership FK lookup used to populate `actor_id`, `actor_role`, or session-derived columns. The outer auth/ownership guards may already enforce this for the calling student, but the audit-row subqueries are independent SELECTs. First seen: issue #550 (`batch_submit_quiz`). Replicated: `complete_empty_exam_session` (cross-referenced 2026-04-27). Pattern hit count=3 — promoted from watch to hard rule.

11. **Multiple permissive RLS SELECT policies** — Postgres ORs permissive policies together. If a table has more than one permissive SELECT policy (currently `student_responses`, `quiz_sessions`, `exam_configs`, `audit_events`), a per-caller RPC reading it must scope explicitly with `WHERE <owner_col> = auth.uid()` (or an `auth.uid() = p_student_id` identity guard) — RLS alone over-scopes to the broader (instructor/admin) policy. Admin/org-wide RPCs behind `is_admin()` are exempt. First seen: #540 / red-team BW3 (`get_student_mastery_stats`, 2026-05-26). See `docs/security.md` §3.

## When the security-auditor agent runs
On every `git push` via Lefthook pre-push hook.
Blocks on CRITICAL and HIGH findings.
See `.claude/agents/security-auditor.md` for full checklist.
