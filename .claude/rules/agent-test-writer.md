# Agent Rules — test-writer
> Model: sonnet | Trigger: pre-push review gate — round 1; a later round only when the fixup added surface it has not seen | Non-blocking (it PRODUCES tests, it does not gate)
## Purpose
Writes Vitest unit and integration tests for the functions and React components the branch diff adds or changes. Discovers coverage gaps. Runs the tests to verify they pass before reporting.
## Handling Results
### DO
- Let the agent discover gaps — it often finds untested files.
- Commit new tests in the round's ONE pooled fixup commit, alongside every other agent's applied findings, after verifying they pass (`agent-workflow.md § PR Batching`). Not a commit of their own.
- If a new test reveals a bug in production code, treat it as an ISSUE — fix production code first, then commit the test.
- Run `pnpm test` after committing the agent's tests to confirm nothing regressed.
- Review test names — describe behavior, not implementation ("schedules shorter interval when wrong" not "calls updateFsrsState").
- **Mutation-check is the AGENT's terminal duty**, protocol in `.claude/agents/test-writer.md` § "Mutation-check every test that pins a mechanism". YOUR duty is the receiving end: a mutation check is a self-reported ACTION — verify the ARTIFACT per `agent-workflow.md § Finding Validation` rather than the claim — `git status --porcelain --untracked-files=all` empty, HEAD unchanged, `git stash list --format='%H'` byte-identical, scratch location gone.
- **Name a test for the behaviour that SHOULD hold, never for a bug it currently pins.** A title asserting the broken behaviour inverts the moment the bug is fixed, taking its `expectRed` entry with it. Where the fix has not landed, `.skip` the test.
- **Before writing a `MUTATION:` line, confirm every mechanism it names is REACHABLE by the fixture's inputs** — `code-style.md` §7. A comment naming a second mechanism an earlier guard already rejects reads as coverage and is not.
- For features that create server-side state outliving the client tab (sessions, payment intents, streaming jobs), the entry-page test must assert the page reads + surfaces existing server state, not just the localStorage path.
### NEVER
- Let the agent modify production code. It writes tests only. The single carve-out is the mutation check, bounded to a scratch copy or throwaway worktree — protocol and bypasses in `.claude/agents/test-writer.md`.
- Skip running the tests the agent wrote. Always verify they pass.
- Commit failing tests. If tests fail, fix them (or the production code) first.
- Write tests for the same files the agent is covering — avoid duplicate work.
- Ignore test failures as "flaky" without investigation.
- Let the agent create `__tests__/` directories — tests are co-located with source files.
- Let the agent test pre-hydration state in jsdom (known limitation — `useEffect` runs before assertions in `act()`).
- Let a tracked JSON file be REWRITTEN to change a few fields — neither by the agent nor by yourself. Never re-serialise (`json.dumps`, `JSON.stringify`, `jq`), never `--sort-keys` / `--indent`. `check-file-size-guard.mjs --update-baseline` does this too — take the rows it computes, apply them as TEXT. Edit the TEXT: an exact-string replacement per field. Measure with `jq --indent 2 . <file> > /tmp/x && diff <file> /tmp/x | grep -c '^<'`, and check `git diff --stat` before committing — if the changed-line count is not close to the fields you meant to change, `git checkout HEAD -- <file>` and redo it surgically.
## What The Agent Produces
- Co-located `.test.ts` / `.test.tsx` files next to source files
- Behavior-focused test names
- Supabase client mocks using the project's `vi.hoisted` + `buildChain` pattern
- `vi.resetAllMocks()` in `beforeEach` — resets `vi.fn()` mock state, which `restoreMocks` does NOT touch
- No hand-added `afterEach(() => vi.restoreAllMocks())` spy-cleanup nets — `restoreMocks: true` in both vitest configs already restores every `vi.spyOn` spy before each test. Keep explicit restores only for global/prototype spies (`globalThis.confirm`, `Storage.prototype.setItem`, `document.createElement`).
- Tests that run and pass before being reported
## When Tests Reveal Bugs
If the test-writer creates a test that fails because the production code has a bug:
1. Real issue — fix the production code first (ISSUE-level fix).
2. Commit both the fix and the test together.
3. Re-run the full test suite to verify.
