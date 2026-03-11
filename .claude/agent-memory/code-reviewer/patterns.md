# Code Reviewer — Patterns Log

## Session 2026-03-11

### Commit: e57a034 (fix: address CodeRabbit review findings)
- Status: CLEAN
- Changes: next.config.ts (35 lines, CSP headers), docs update, SQL migration (10 lines)
- Notes: Configuration files are generally clean. No violations found.

### Commit: 507d2c9 (chore: add CSP tests and update docs from agent review)
- Status: CLEAN
- Files changed: 7 files, 229 insertions
- Key file: `apps/web/next.config.test.ts` — 139 lines
  - Helper functions: loadConfig (5 lines), extractCsp (3 lines), getHeaderGroups (3 lines), getCspForEnv (4 lines) — all under 30-line limit
  - Test suite: 11 test cases across 3 describe blocks
  - Pattern: Proper use of vi.stubEnv + vi.resetModules for testing module-level constants
  - No async/await complexity issues, no unvalidated casts, no business logic
- Docs updated: database.md, security.md (immutable table pattern), plan.md (phase completion)
- Agent memory files updated: code-reviewer, test-writer, learner patterns
- Notes: All new code follows style guide. Documentation reflects security hardening from CodeRabbit review.

### Commit: 044542f (fix: format globals.css to satisfy Biome CSS formatter)
- Status: CLEAN
- Changes: CSS formatting only (number shortening, line wrapping for shadow properties)
- No code violations.

### Commit: d183a8c (fix: address security findings from CodeRabbit review)
- Status: CLEAN
- Files changed: 10 files, 112 insertions, 59 deletions
- Key file: `apps/web/app/app/review/actions.ts` — 189 lines
  - 3 exported async functions (startReviewSession, submitReviewAnswer, completeReviewSession) + 1 private helper
  - startReviewSession() — 31 lines (single responsibility: load due cards + supplement with new ones + start session)
  - submitReviewAnswer() — 29 lines (auth check + RPC + FSRS update)
  - completeReviewSession() — 24 lines (auth check + RPC for score summary)
  - updateFsrsCard() — 39 lines (private helper, extracted to avoid duplication in actions)
  - All functions ≤3 params or use objects ✓
  - Auth checks added to all public actions (security improvement) ✓
  - Type exports co-located ✓
- Key file: `apps/web/app/app/review/actions.test.ts` — 232 lines (test file, not subject to component limits)
  - 3 describe blocks, 13 test cases total
  - Test names describe behavior not implementation (e.g., "supplements with new questions when fewer than 10 cards are due")
  - Proper mock setup with hoisted vi.fn() declarations
  - buildChain() helper extracts Supabase chain mock logic (reusable across tests)
  - New auth validation tests added for completeReviewSession()
- Other changes:
  - `proxy.ts` — cookie propagation logic for session refresh on redirects (minor addition, 42 lines total)
  - `next.config.ts` — CSP corrections (frame-src → frame-ancestors, ws://localhost:* for dev)
  - `docs/security.md` — documentation clarified for RLS policy syntax
- Notes: Server Action file size at 189 lines is acceptable given 3 focused functions; comparable to typical Next.js action file. No violations.

## Patterns Observed

### Positive Patterns
- Configuration/setup files (`next.config.ts`) maintained at reasonable size with clear structure
- SQL migrations kept minimal and focused on single RLS concern
- Documentation updates separate from code changes
- Test files use proper vitest patterns (vi.resetModules, vi.stubEnv) with focused, named test cases
- Helper functions extracted into separate, short functions (3-5 lines each) rather than inlined in tests
- Agent-memory files properly maintained with session-dated entries and pattern summaries

### Critical Security/API Patterns (NEW from commits 044542f + d183a8c)

#### 1. NextResponse.redirect() Cookie Loss
**Pattern**: NextResponse.redirect() in middleware/proxy creates a fresh response and drops cookies from the previous response chain.
**Rule**: When redirecting with auth refresh, always copy session cookies to the redirect response.
**Example**: In `proxy.ts`, after `supabase.auth.refreshSession()`, manually add refreshed session cookie to redirect response:
```ts
const response = NextResponse.redirect(new URL(path, request.url))
response.headers.set('set-cookie', newSessionCookie)
return response
```
**Impact**: Failure to copy cookies causes silent auth loss on redirects.

#### 2. CSP Headers: frame-src vs frame-ancestors
**Pattern**: CSP header confusion between two similar directives.
**Rule**:
- `frame-src`: controls which URLs can be embedded *in* your page (e.g., iframes)
- `frame-ancestors`: controls which URLs can embed *your* page (anti-clickjacking)
**Impact**: Using wrong directive allows XSS/clickjacking. For local dev, allow `ws://localhost:*` in CSP.

#### 3. PostgreSQL RLS: WITH CHECK vs USING
**Pattern**: RLS policies require both directives for complete coverage.
**Rule**:
- `USING` — governs SELECT/UPDATE/DELETE read access
- `WITH CHECK` — governs INSERT/UPDATE write access (applies to new row values)
- `FOR INSERT ... WITH CHECK` — only WITH CHECK applies (no "old row" to check)
**Impact**: Missing WITH CHECK allows unauthorized inserts. Both needed for UPDATE statements.

#### 4. Auth Check in Every Server Action
**Pattern**: Simpler Server Actions can accidentally skip auth validation.
**Rule**: Every exported action must call `requireAuth()` or equivalent before touching user data, even "simple" operations like `completeQuizSession()`.
**Audit**: Code reviewer will flag actions without explicit auth checks.
**Example**: `completeReviewSession(sessionId)` needs `const user = await requireAuth()` even if just fetching a score summary.

### Risk Areas to Watch
- Pattern noted: Server Action files can exceed 150-line component limit but remain within project norms when containing multiple focused exported functions + private helpers. Monitor if any single action file grows > 200 lines.
- Watch for middleware/proxy redirect logic — always verify cookies are preserved.
