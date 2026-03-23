# Red Team — Attack Surface Map

> Last updated: 2026-03-20

## Vector-to-Spec Mapping

| ID | Vector | Priority | Spec File | Status | Notes |
|----|--------|----------|-----------|--------|-------|
| A | submit_quiz_answer accepts foreign questionId | HIGH | rpc-question-membership.spec.ts | FIXED (migration 033) | Added question membership check to RPC |
| B | fetch-stats without auth | MEDIUM | server-action-unauthenticated.spec.ts | PASSING | RPCs require auth.uid() |
| C | Draft with foreign question_ids | MEDIUM | quiz-draft-injection.spec.ts | TBD | RLS may not check question ownership in drafts |
| D | start_quiz_session with cross-org subjectId | MEDIUM | rpc-cross-tenant.spec.ts | PASSING | RLS filters cross-org data |
| E | Topic lookups without auth | MEDIUM | server-action-unauthenticated.spec.ts | PASSING | Covered by unauthenticated spec |
| F | Student INSERT into audit_events | MEDIUM | audit-event-forgery.spec.ts | FIXED (migration 034) | INSERT policy replaced with WITH CHECK (false) |
| G | Concurrent discard + complete | LOW | session-race-condition.spec.ts | PASSING | FOR UPDATE lock prevents race |
| H | PKCE code forwarding | LOW | pkce-state.spec.ts | PASSING | Supabase validates PKCE server-side |
| J | batch_submit on completed session | LOW | session-replay.spec.ts | PASSING | RPC checks session status |
| K | Rapid-fire Server Action calls | MEDIUM | rate-limiting.spec.ts | DOCUMENTED GAP | No rate limiting implemented |
| L | get_report_correct_options called without auth | HIGH | server-action-unauthenticated.spec.ts | GAP — no test case for this RPC | RPC has auth.uid() guard but no spec exercises it |
| M | get_report_correct_options called with foreign session_id (cross-tenant) | HIGH | rpc-cross-tenant.spec.ts | GAP — spec does not test report RPC | RPC has session-ownership check but no spec verifies it holds |
| N | get_report_correct_options called on active (not completed) session | HIGH | (no spec) | GAP — no spec exists | RPC blocks on ended_at IS NOT NULL but no test exercises the bypass |
| O | quiz-report questions SELECT leaks raw correct boolean server-side | CRITICAL | (no spec) | GAP — latent exposure in quiz-report.ts line 88 | .select('options') pulls raw JSONB; correct field filtered only in buildReportQuestions — no spec verifies options are stripped before reaching client |
| P | deleteComment called by non-owner student (IDOR via RLS) | HIGH | (no spec) | GAP — migration 049 adds DELETE RLS but no spec exercises cross-user delete attempt | RLS policy question_comments_delete_own uses USING(user_id = auth.uid()); needs a spec that signs in as student-B and attempts to delete student-A's comment |
| Q | question_comments table read/write without auth (unauthenticated) | HIGH | server-action-unauthenticated.spec.ts | GAP — spec does not cover question_comments table or comments Server Actions | SELECT policy requires EXISTS(SELECT 1 FROM users WHERE id = auth.uid()); INSERT WITH CHECK enforces user_id = auth.uid(); unauthenticated access should return 0 rows / error — no spec verifies this |
| R | createComment/getComments called without auth via Server Action layer | HIGH | server-action-unauthenticated.spec.ts | GAP — getComments silently returns success:true+[] when unauthed (line 20 comments.ts); createComment returns error — inconsistency not tested | getComments does NOT return an error for unauthenticated callers; it silently succeeds with empty array — a spec should confirm no data leaks and that the silent-success behaviour is intentional |
| S | toggleFlag called with a foreign student's questionId (IDOR) | MEDIUM | (no spec) | GAP — no spec exists | toggleFlag hard-codes user.id from auth token for student_id filter; RLS WITH CHECK also binds student_id = auth.uid(); low risk but no spec verifies attacker cannot read or corrupt another student's flag state |
| T | getFlaggedIds called without auth | MEDIUM | server-action-unauthenticated.spec.ts | GAP — spec does not cover flagged_questions table | getFlaggedIds returns success:true+[] when unauthed (line 87 flag.ts); silent success not tested |
| U | deleteComment hard-delete bypasses soft-delete policy for deleted_at column | MEDIUM | (no spec) | GAP — table has deleted_at column but DELETE policy does not require deleted_at IS NULL; admin could hard-delete a comment that was already soft-deleted, which is consistent, but no spec checks the interplay | Low risk; document gap for completeness |

## Files to Watch

These files contain the attack surface. Changes here should trigger a red-team review:

- `supabase/migrations/*.sql` — RLS policies, RPCs, table definitions
- `packages/db/src/schema.ts` — Zod schemas for input validation
- `apps/web/app/app/quiz/actions/*.ts` — Server Actions (auth checks, input validation)
- `apps/web/proxy.ts` — session middleware
- `apps/web/app/auth/callback/route.ts` — PKCE callback
- `apps/web/lib/queries/quiz-report.ts` — post-session report query (answer key access path)

## Lessons Learned

2026-03-16 — review of branch fix/45-remove-answer-keys-from-test:
- The migration sequence (032→033→034) shows iterative hardening: the final RPC correctly derives question IDs from quiz_session_answers rather than accepting them as a parameter, eliminating arbitrary question-ID probing. This is the right pattern.
- quiz-report.ts performs a direct .select('options') on the questions table (line 88). The `correct` boolean is filtered in TypeScript inside buildReportQuestions, not at the DB layer. A future refactor that changes the mapping logic could silently re-expose answer keys. A red-team spec should assert the report payload never contains `correct` fields.
- New RPCs require matching unauthenticated and cross-tenant test cases on every addition — these are not covered by default by the existing generic specs.

2026-03-20 — review of branch adding migration 049 (question_comments) + comments.ts + flag.ts:
- Hard-delete on question_comments is an intentional, documented exception to the soft-delete rule. The migration comment names the rationale. The RLS DELETE policy is correctly scoped to user_id = auth.uid(). However, the absence of a spec means the IDOR protection has never been exercised end-to-end.
- getComments and getFlaggedIds both return success:true with empty data rather than an error when the caller is unauthenticated. This is a deliberate defensive pattern (no information leakage) but it creates an inconsistency with createComment/deleteComment which return error:Not authenticated. The inconsistency itself is not a vulnerability, but a spec should pin this behaviour so a future refactor does not accidentally start returning real data to unauthed callers.
- flag.ts correctly hard-codes user.id from the auth token in all DB filters — the student_id parameter is never accepted from client input. This is the correct IDOR-prevention pattern. Still needs a spec.
- New Server Action files (comments.ts, flag.ts) must be added to the server-action-unauthenticated spec's coverage list, same rule as every previous action file.
