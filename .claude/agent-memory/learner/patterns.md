# Learner Agent — Pattern Memory

## Issue Frequency

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Missing `short` prop in test fixtures | 1 | 2026-03-11 | Fixed — types added `short` field, tests didn't update |
| `possibly undefined` in test assertions | 1 | 2026-03-11 | Fixed — biome now allows `!` in test files |
| Missing vitest imports (beforeEach) | 1 | 2026-03-11 | Fixed — 3 test files missing import |
| External agent output invisible | 1 | 2026-03-11 | Fixed — Decision 20: agents now run as in-session subagents |
| Duplicate Next.js installs (Playwright) | 1 | 2026-03-11 | Fixed — excluded e2e/ from tsconfig, cast in proxy.ts |
| Pre-push hooks too slow for large diffs | 1 | 2026-03-11 | Fixed — diff cap + timeout + grep fallback |

## Lessons Learned

### 2026-03-11 — Initial session
- **Root cause of pushed broken code:** Type-check and tests were in pre-push (too late), not pre-commit. Pre-push had slow security-auditor that timed out, forcing `--no-verify`. All quality gates collapsed.
- **Fix:** Moved type-check + tests to pre-commit. Pre-push now only does security + audit.
- **Pattern:** When test fixtures don't match updated types, TS catches it but only if type-check runs early enough (pre-commit, not pre-push).
- **Pattern:** External hooks (Lefthook post-commit) that Claude can't see are useless. All agent output must flow back to the main session.
