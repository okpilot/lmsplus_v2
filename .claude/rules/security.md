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

## When the security-auditor agent runs
On every `git push` via Lefthook pre-push hook.
Blocks on CRITICAL and HIGH findings.
See `.claude/agents/security-auditor.md` for full checklist.
