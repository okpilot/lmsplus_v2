# Red Team — Attack Surface Map

> Last updated: 2026-03-16

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
