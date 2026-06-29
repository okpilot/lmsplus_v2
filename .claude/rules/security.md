# Security Rules — LMS Plus v2

> Full binding security reference: `docs/security.md`
> This file is a quick summary. When writing any DB/auth/API code, read `docs/security.md` first.

> **Citing these rules in code, docs, or migrations:** the §N section numbers in *this* file are local to this quick-summary and do **not** match `docs/security.md`. When citing a rule outside this file, use the rule **title** (e.g., "Multiple Permissive RLS SELECT Policies") or cite `docs/security.md §N` directly — never `security.md §N` pulled from here. Several rules below already end with a "See `docs/security.md §N`" mapping; prefer that.

## Critical rules (memorise these)

1. **Correct answers** — strip via `get_quiz_questions()` RPC only. Never SELECT * questions for students. The MC key is column-REVOKE-gated (mig 111, #823): stored in `questions.correct_option_id` (NULL for non-MC), kept out of the `options` JSONB by `trg_sanitize_question_options`; students read it post-session only via the report RPCs (mig 114/113, `ended_at`-gated), admins via `get_question_authoring_fields()`.
2. **RLS** — every table needs BOTH `USING` (read) and `WITH CHECK` (write) policies.
3. **Service role key** — `packages/db/src/admin.ts` only. Never `NEXT_PUBLIC_`. Never in client components.
4. **Zod validation** — every Server Action and API route must parse input with Zod before using it.
5. **Audit log** — `audit_events` is append-only. No UPDATE or DELETE policies. Ever.
6. **Soft delete** — never hard DELETE. Always `UPDATE SET deleted_at = now()`.
7. **Auth check in RPCs** — all SECURITY DEFINER functions must call `auth.uid()` manually and raise if null.
8. **Secrets** — never commit `.env*` files. Pre-commit hook blocks them.
9. **Soft-delete in RPCs** — every SELECT inside a SECURITY DEFINER function must include `AND deleted_at IS NULL` on soft-deletable tables. SECURITY DEFINER bypasses RLS, so soft-delete filters must be manual. **Narrow exception:** SELECTs fetching records by IDs stored in an immutable, write-once column (current cases per `docs/security.md` §15: `batch_submit_quiz`, `submit_quiz_answer`, `check_quiz_answer`, `check_non_mc_answer`, `submit_vfr_rt_exam_answers`, `get_vfr_rt_exam_questions`, `get_vfr_rt_exam_results` — all reading `questions` via the frozen `quiz_sessions.config.question_ids`, written once at session start, IDs derived server-side from the caller-owned session row) may omit the filter. Any new instance must cite the immutable column at the call site — see `docs/security.md` §15 and `docs/database.md` §3.

10. **Audit-event INSERT subqueries** — Every `INSERT INTO audit_events (...)` SQL block in a SECURITY DEFINER function must filter `deleted_at IS NULL` on any user/session/question/membership FK lookup used to populate `actor_id`, `actor_role`, or session-derived columns. The outer auth/ownership guards may already enforce this for the calling student, but the audit-row subqueries are independent SELECTs. First seen: issue #550 (`batch_submit_quiz`). Replicated: `complete_empty_exam_session` (cross-referenced 2026-04-27). Pattern hit count=3 — promoted from watch to hard rule.

11. **Multiple permissive RLS SELECT policies** — Postgres ORs permissive policies together. If a table has more than one permissive SELECT policy (currently `student_responses`, `quiz_sessions`, `exam_configs`, `audit_events`), a per-caller RPC reading it must scope explicitly with `WHERE <owner_col> = auth.uid()` (or an `auth.uid() = p_student_id` identity guard) — RLS alone over-scopes to the broader (instructor/admin) policy. Admin/org-wide RPCs behind `is_admin()` are exempt. First seen: #540 / red-team BW3 (`get_student_mastery_stats`, 2026-05-26). See `docs/security.md` §3.

12. **Sibling SECURITY DEFINER RPC guard-set consistency** — When rewriting or extending any SECURITY DEFINER RPC, compare its guard set against ALL sibling RPCs in the same feature family BEFORE committing. The guard classes: `auth.uid()` null-check (rule 7); mode/whitelist guard; soft-delete filter on every SELECT (rule 9); **active-user / soft-deleted-caller gate** (`PERFORM 1 FROM users WHERE id = <uid> AND deleted_at IS NULL; IF NOT FOUND THEN RAISE`); ownership/identity scope (rule 11); org/config-membership; audit-subquery soft-delete (rule 10); `SET search_path = public`. A guard present in any sibling and absent in the target is a **gap, not an intentional difference** — unless the difference is justified (admin/org-wide RPCs behind `is_admin()` are exempt from per-caller ownership scoping; a function reading no soft-deletable table needs no soft-delete filter; a function with no `audit_events` INSERT has no audit-subquery concern). When introducing a NEW guard class into one family member, audit every other member for the same guard **in the same commit**. Promoted count=3 (two 2026-03-14 sibling-guard misses + `check_quiz_answer` shipped as a verbatim copy of its weaker older body in PR #856, missing 3 guards `submit_quiz_answer` already had). The promotion sweep found 4 legacy read-RPCs missing the active-user gate — see #883 and `docs/security.md` §11c.

13. **Single-active-session invariant** — at most ONE active (`ended_at IS NULL AND deleted_at IS NULL`) `quiz_sessions` row per student, across all modes (#1011, mig 136: global partial unique index `uq_one_active_session_per_student` + each start RPC raising `another_session_active`; Discovery is now a real ephemeral `mode='discovery'` row, mig 137). This is the STRUCTURAL complement to rule 1 / the §4 answer-oracle guards: an answer-revealing Discovery/practice session cannot START while a graded exam on the shared MC pool is live, so it cannot coexist with one. See `docs/security.md` §11d.

## When the security-auditor agent runs
On every `git push` via Lefthook pre-push hook.
Blocks on CRITICAL and HIGH findings.
See `.claude/agents/security-auditor.md` for full checklist.
