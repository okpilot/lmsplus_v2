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
- For features that create server-side state outliving the client tab (sessions, payment intents, streaming jobs, etc.), the entry-page test must assert the page reads + surfaces existing server state. Don't just test the localStorage path.

### NEVER
- Let the agent modify production code. It writes tests only.
- Skip running the tests the agent wrote. Always verify they pass.
- Treat `pnpm test` green as sufficient — vitest uses esbuild (strips types, no lint), so green tests do NOT mean clean `tsc` or Biome. After test-writer produces tests, the orchestrator MUST run `pnpm check-types` AND `pnpm check` (biome) on the new test files before committing them. (Promoted count=4, 2026-07-02 — recurring test-writer output that passed vitest but failed a gate: e.g. a `setupAuth` param type inferred from its default excluding `null` [tsc], and an unused `type FromClient` [Biome `noUnusedVariables`]; both invisible to `pnpm test`.)
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

*Last updated: 2026-03-12*
