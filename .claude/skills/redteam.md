---
name: redteam
description: Run the red team test suite and report results
user_invocable: true
---

# /redteam — Red Team Test Suite

Run the adversarial security test suite against local Supabase.

## Prerequisites

1. Local Supabase must be running: `npx supabase start`
2. Next.js dev server must be running: `pnpm dev` (only needed for PKCE test)
3. Test data must be seeded (specs handle this automatically)

## Steps

1. Run the red team specs:
   ```bash
   pnpm --filter @repo/web e2e:redteam
   ```

2. Parse the results and report:
   - Which specs PASSED (defenses held)
   - Which specs FAILED (gaps found)
   - Which specs were SKIPPED (documented gaps)

3. For any NEW failures (previously passing spec now fails):
   - This means a defense was weakened — treat as CRITICAL
   - Read the failing spec to understand the attack vector
   - Report to the user with the exact vector and recommended fix

4. Update `.claude/agent-memory/red-team/attack-surface.md` with current status.

## Expected Results

| Spec | Expected |
|------|----------|
| rpc-question-membership | FAILING (gap A) |
| rpc-cross-tenant | PASSING |
| server-action-unauthenticated | PASSING |
| audit-event-forgery | FAILING (gap F) |
| quiz-draft-injection | TBD |
| session-replay | PASSING |
| session-race-condition | PASSING |
| pkce-state | PASSING |
| rate-limiting | SKIPPED (documented gap) |
