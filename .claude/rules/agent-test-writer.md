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
  sanctioned, and only because nothing survives it. **RECORD BOTH `git rev-parse HEAD` AND
  `git stash list --format='%H'` BEFORE you mutate** — two of the four checks below are COMPARISONS,
  and a comparison with no recorded baseline is not a check at all. Recording only HEAD leaves the
  stash check unenforceable in exactly the way it exists to prevent: a comparison with no captured
  before is satisfied by ANY later value, and this repo's stash list is routinely non-empty
  (15 entries on 2026-09-06 — derive the current value with `git stash list`), so it cannot be
  eyeballed either. Record the IDENTITIES, not a count: a drop-and-push pair leaves the count
  unchanged, so `wc -l` reports clean while a pre-existing stash has been destroyed and the mutation
  hidden in its place. Then, before reporting, verify ALL of: `git status --porcelain
  --untracked-files=all` EMPTY; `git rev-parse HEAD` equal to the recorded value;
  `git stash list --format='%H'` byte-identical to the recorded output; and the scratch worktree or
  copy actually removed — that last one because a
  worktree left in place keeps the mutated copy on disk while the primary repo's status, HEAD and
  stash list are all blind to it.
  No after-the-fact state check is sufficient on its own, and each of these closes a hole the others
  miss: bare `git diff` shows only UNSTAGED changes, so it reads clean over a staged mutation; bare
  `git status --porcelain` honours `status.showUntrackedFiles`, so with it set to `no` a leftover
  untracked file is invisible (`code-style.md` §10 clause 4 records the same trap); a COMMITTED
  mutation leaves the tree clean on every axis, which is why HEAD is compared; and `git stash -u`
  clears tree, index AND untracked files without moving HEAD, so it defeats both of those at once
  while the mutation stays recoverable (this repo has a documented history of abandoned stashes —
  `agent-memory.md`, #1115).
  The bypasses are an OPEN set that no after-the-fact state check closes. The three below are
  ILLUSTRATIONS, not a census — do not read them as complete, and do not "fix" this paragraph by
  appending a fourth: a mutation written to a GITIGNORED or out-of-repo path that the test still
  imports is invisible to `--untracked-files=all` (which does not imply `--ignored`); a mutation
  committed inside a linked worktree never touches the primary repo's HEAD or status; and a
  `git stash push` of an in-place mutation followed by `git stash drop` of that SAME new stash leaves
  status EMPTY, HEAD unchanged and the stash list byte-identical, while the mutated tree survives as a
  dangling commit recoverable with `git fsck --unreachable`. DERIVE the rest rather than trusting this
  list: of any sequence, ask which of the four checks it leaves unchanged — one that leaves all four
  unchanged WHILE THE MUTATION SURVIVES somewhere recoverable is another member. Both halves are
  required: a sequence that genuinely reverts leaves all four unchanged too, and is not a bypass.
  This is why the structural guarantee — a throwaway location, discarded rather than restored — is
  the real one: a check taken afterwards is satisfied equally by "never happened" and by "committed
  and left". A green test proves
  nothing on its own — `code-style.md` §7 ("A Test Must Fail If Its Mechanism Is Removed") states the
  rule; this bullet makes it the test-writer's terminal duty rather than a reviewer's catch. On PR
  #1225 a branch-authored disjointness test passed all four post-commit agents and could not fail:
  forcing its function to return a constant left 16/16 green.
- For features that create server-side state outliving the client tab (sessions, payment intents, streaming jobs, etc.), the entry-page test must assert the page reads + surfaces existing server state. Don't just test the localStorage path.

### NEVER
- Let the agent modify production code. It writes tests only. The single carve-out is the mutation check in the DO list above, and it is bounded: the change is made in a scratch copy or throwaway worktree, never in place, and nothing survives it — record HEAD AND the stash IDENTITIES (`git stash list --format='%H'`, not a count — a drop-and-push pair preserves the count) first, then before reporting require `git status --porcelain --untracked-files=all` EMPTY, `git rev-parse HEAD` equal to the recorded value, `git stash list --format='%H'` byte-identical to the recorded output, and the scratch location removed. See the DO bullet for what each closes and for the OPEN set of bypasses no state check closes. A mutation the agent cannot make that way is the orchestrator's to run.
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
