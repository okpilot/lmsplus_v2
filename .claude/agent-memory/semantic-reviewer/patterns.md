# Semantic Reviewer — Patterns & Learnings

> Running log of recurring issues, positive patterns, and areas needing extra scrutiny.

## Recurring Issues
- (none yet — first run pending)

## Positive Patterns
- (none yet)

## High-Scrutiny Files
- `apps/web/proxy.ts` — auth flow, cookie handling, redirects
- `apps/web/app/auth/callback/route.ts` — PKCE code exchange, session creation
- `apps/web/app/app/*/actions.ts` — Server Actions, auth checks, input validation
- `packages/db/src/admin.ts` — service role key usage

## CodeRabbit Findings to Learn From
- Cookie forwarding consistency across redirect branches (PR #23)
- Query param forwarding to auth endpoints (PR #23)
