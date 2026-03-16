# Red Team — Attack Surface Map

> Last updated: 2026-03-14

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

## Files to Watch

These files contain the attack surface. Changes here should trigger a red-team review:

- `supabase/migrations/*.sql` — RLS policies, RPCs, table definitions
- `packages/db/src/schema.ts` — Zod schemas for input validation
- `apps/web/app/app/quiz/actions/*.ts` — Server Actions (auth checks, input validation)
- `apps/web/proxy.ts` — session middleware
- `apps/web/app/auth/callback/route.ts` — PKCE callback

## Lessons Learned

(populated by the red-team agent after each review cycle)
