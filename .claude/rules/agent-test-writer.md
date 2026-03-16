# Agent Rules — test-writer

> Model: sonnet | Trigger: post-commit | Non-blocking (tests committed separately)

## Purpose
Writes Vitest unit and integration tests for new or changed TypeScript functions and React components. Discovers coverage gaps that manual review misses. Runs the tests to verify they pass before reporting.

## Handling Results

### DO
- Let the agent discover gaps — it often finds untested files you didn't think about.
- Commit new tests as a separate commit after verifying they pass.
- If a new test reveals a bug in production code, treat it as an ISSUE — fix the production code first, then commit the test.
- Trust the agent's mock patterns — it maintains proven patterns in `.claude/agent-memory/test-writer/patterns.md`.
- Run `pnpm test` after committing the agent's tests to confirm nothing regressed.
- Review test names — they should describe behavior, not implementation ("schedules shorter interval when wrong" not "calls updateFsrsState").

### NEVER
- Let the agent modify production code. It writes tests only.
- Skip running the tests the agent wrote. Always verify they pass.
- Commit failing tests. If tests fail, fix them (or the production code) first.
- Write tests for the same files the agent is covering — avoid duplicate work.
- Ignore test failures as "flaky" without investigation.
- Let the agent create `__tests__/` directories — tests are co-located with source files.
- Let the agent test pre-hydration state in jsdom (it's a known limitation — `useEffect` runs before assertions in `act()`).

## What The Agent Produces
- Co-located `.test.ts` / `.test.tsx` files next to source files
- Behavior-focused test names
- Supabase client mocks using the project's established `vi.hoisted` + `buildChain` pattern
- `vi.resetAllMocks()` in `beforeEach`
- Tests that run and pass before being reported

## When Tests Reveal Bugs
If the test-writer creates a test that fails because the production code has a bug:
1. The test exposed a real issue — this is valuable.
2. Fix the production code first (this is an ISSUE-level fix).
3. Then commit both the fix and the test together.
4. Re-run the full test suite to verify.

---

*Last updated: 2026-03-12*
