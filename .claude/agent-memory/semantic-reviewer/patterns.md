# Semantic Reviewer — Patterns & Learnings

> Running log of recurring issues, positive patterns, and areas needing extra scrutiny.

## Recurring Issues

### auth-before-parse ordering
**First seen:** commit 23a9f10 (2026-03-12)
**File:** `apps/web/app/app/quiz/actions.ts` — `startQuizSession`
**Pattern:** Originally parsed Zod input before checking auth, meaning an unauthenticated caller
could leak validation error details (field names, schema shape) before being rejected.
**Fix applied:** auth check moved before `StartQuizInput.parse(raw)`.
**Watch for:** any new Server Action where `.parse(raw)` appears before `getUser()` / `requireAuth()`.

### submitQuizAnswer / completeQuiz — ZodError propagates uncaught
**First seen:** commit 23a9f10 (2026-03-12)
**File:** `apps/web/app/app/quiz/actions.ts` — `submitQuizAnswer`, `completeQuiz`
**Pattern:** Neither function wraps its body in try/catch. A ZodError on malformed input throws
instead of returning `{ success: false, error: ... }`, unlike `startQuizSession` which catches
ZodError and returns a structured failure. This is a documented behavioral inconsistency
confirmed by the test at line 238 (`rejects.toThrow(ZodError)`).
**Status:** Intentional by test design — tests assert the throw, not a structured return.
Worth flagging as ISSUE if the callers are not all wrapped in their own try/catch.

## Positive Patterns

### FSRS best-effort scheduling with try/catch
**File:** `apps/web/app/app/quiz/actions.ts`, `apps/web/app/app/review/actions.ts`
Both `submitQuizAnswer` and `submitReviewAnswer` wrap `updateFsrsCard` in try/catch so that
a scheduling failure never blocks answer submission. Correct and consistent across both files.

### Auth-before-Zod pattern now consistently applied in startQuizSession and review/actions.ts
`startReviewSession` already had auth before parse. `startQuizSession` now matches it.
All six "start/submit/complete" Server Actions check auth before parsing input.

## High-Scrutiny Files
- `apps/web/proxy.ts` — auth flow, cookie handling, redirects
- `apps/web/app/auth/callback/route.ts` — PKCE code exchange, session creation
- `apps/web/app/app/*/actions.ts` — Server Actions, auth checks, input validation
- `packages/db/src/admin.ts` — service role key usage

## CodeRabbit Findings to Learn From
- Cookie forwarding consistency across redirect branches (PR #23)
- Query param forwarding to auth endpoints (PR #23)
- auth-before-parse ordering in Server Actions (PR #26, round 4)
