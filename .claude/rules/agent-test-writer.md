# Agent Rules — test-writer

> Model: sonnet | Trigger: post-commit | Non-blocking (tests committed separately)

## Purpose
Writes Vitest unit and integration tests for new or changed TypeScript functions and React components. Discovers coverage gaps that manual review misses. Runs the tests to verify they pass before reporting.

## Handling Results

### DO
- Let the agent discover gaps — it often finds untested files you didn't think about.
- Commit new tests as a separate commit after verifying they pass.
- If a new test reveals a bug in production code, treat it as an ISSUE — fix the production code first, then commit the test.
- Trust the agent's mock patterns — it maintains proven patterns in `.claude/agent-memory/test-writer/MEMORY.md`.
- Run `pnpm test` after committing the agent's tests to confirm nothing regressed.
- Review test names — they should describe behavior, not implementation ("schedules shorter interval when wrong" not "calls updateFsrsState").
- **Mutation-check any test that pins a mechanism.** Before reporting a new test as passing, break
  the thing it protects and confirm exactly that test goes red, then restore. Do this in a scratch
  copy or a throwaway worktree, not in place — it is the one case where touching production code is
  sanctioned, and only because nothing survives it. Before reporting, verify BOTH:
  `git status --porcelain --untracked-files=all` is EMPTY, and `git rev-parse HEAD` is unchanged from
  before the mutation. Neither alone is sufficient and no after-the-fact state check is: bare
  `git diff` shows only UNSTAGED changes, so it reads clean over a staged mutation; bare
  `git status --porcelain` honours `status.showUntrackedFiles`, so with it set to `no` a leftover
  untracked file is invisible (`code-style.md` §10 clause 4 records the same trap); and a mutation that
  was COMMITTED leaves the tree clean on every axis, which is why HEAD is checked too. The structural
  guarantee is the throwaway location — a check taken afterwards is satisfied equally by "never
  happened" and by "committed and left". A green test proves
  nothing on its own — `code-style.md` §7 ("A Test Must Fail If Its Mechanism Is Removed") states the
  rule; this bullet makes it the test-writer's terminal duty rather than a reviewer's catch. On PR
  #1225 a branch-authored disjointness test passed all four post-commit agents and could not fail:
  forcing its function to return a constant left 16/16 green.
- For features that create server-side state outliving the client tab (sessions, payment intents, streaming jobs, etc.), the entry-page test must assert the page reads + surfaces existing server state. Don't just test the localStorage path.

### NEVER
- Let the agent modify production code. It writes tests only. The single carve-out is the mutation check in the DO list above, and it is bounded: the change is made in a scratch copy or throwaway worktree, never in place, and nothing survives it — `git status --porcelain --untracked-files=all` must be EMPTY AND `git rev-parse HEAD` unchanged before the agent reports (the bare form honours `status.showUntrackedFiles`; a committed mutation leaves the tree clean). A mutation the agent cannot make that way is the orchestrator's to run.
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
- `vi.resetAllMocks()` in `beforeEach` — still required: it resets `vi.fn()` mock state (calls/return values), which `restoreMocks` does NOT touch.
- Do NOT hand-add `afterEach(() => vi.restoreAllMocks())` spy-cleanup nets. `restoreMocks: true` in both vitest configs (`vitest.config.ts` + `vitest.integration.config.ts`) already restores every `vi.spyOn` spy to its original before each test, globally and leak-safe even on assertion failure (#929). Per-test `spy.mockRestore()` is no longer required for correctness — but keep it for global/prototype spies (`globalThis.confirm`, `Storage.prototype.setItem`, `document.createElement`) where the explicit restore communicates intent. Drop only the `afterEach` nets.
- Tests that run and pass before being reported

## When Tests Reveal Bugs
If the test-writer creates a test that fails because the production code has a bug:
1. The test exposed a real issue — this is valuable.
2. Fix the production code first (this is an ISSUE-level fix).
3. Then commit both the fix and the test together.
4. Re-run the full test suite to verify.

---

*Last updated: 2026-08-19*
