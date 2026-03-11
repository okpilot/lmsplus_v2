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

### 2026-03-11 — Partial doc fix pattern
- **Context:** Commit c756141 (learner agent + coderabbit) updated `docs/decisions.md` with Decision 20 (post-commit workflow), but left `docs/plan.md` stale (old pipeline diagram, missing learner/coderabbit agents).
- **Result:** Doc-updater flagged the gap in the next cycle (33eb2bb). Plan.md got fixed in a follow-up commit.
- **Pattern:** Agent findings (doc gaps, code style, tests) must be **fully acted on in the same commit**. Partial fixes = extra commits wasted and risk of incomplete state.
- **Lesson:** When doc-updater flags stale files, audit all related docs together. Don't update decision tree without updating plan + CLAUDE.md. Single commit per logical unit of work.

### 2026-03-11 — CI/Vercel build failures (commit 2ac3286)
- **Root cause:** Turbo caching + monorepo package boundary issues masked errors locally that surfaced in CI.
- **Pattern 1 — Integration tests in CI:** `packages/db/vitest.config.ts` runs all tests by default in CI/Vercel. Integration tests that require live DB services (Supabase) fail in CI. Solution: exclude integration tests from default `pnpm test` via glob `!**/*.integration.test.ts` in vitest config, or move to separate config. Locally, devs still run them with explicit flag.
- **Pattern 2 — Auto-generated files in biome ignore:** Next.js generates `next-env.d.ts` dynamically. This file should be in `.biomeignore` (or `.gitignore` equivalent) to prevent biome from formatting it. Prevents spurious "changed" diffs in CI.
- **Pattern 3 — E2E helpers as devDeps:** E2E test helpers (e.g., `apps/web/e2e/helpers.ts`) may import packages not in the app's direct deps (e.g., `@supabase/supabase-js`). In a monorepo, packages should be declared explicitly as devDeps in the package that imports them — not assumed to exist via transitive deps. Turbo caching hides the gap locally.
- **Pattern 4 — Turbo cache masking type errors:** TS type-check passes locally (Turbo cache hit) but fails in CI (fresh install). Root cause: tsconfig path resolution or package versioning differs. Solution: verify `pnpm check-types` (tsc --noEmit) passes in clean environment before pushing. Consider adding explicit `pnpm install --frozen-lockfile` + `pnpm check-types` to CI as separate step before `pnpm build`.
- **Lesson:** In Turborepo + monorepo, always assume CI has a clean state. Test locally with `pnpm install --frozen-lockfile`, `pnpm check-types`, `pnpm build` before commit. Cache hits are not a sign of success.
