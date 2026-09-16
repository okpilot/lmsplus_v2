# Agent Rules — test-writer

> **RULE 0 — NO PROSE.** State what is true; delete the rest. No justification, no precedent, no archaeology — that is what `git log` is for. Every sentence is a claim that can be false, so fewer sentences means fewer defects. If a fact is derivable, ship the command, not the paragraph. Evidence is not prose: a skip reason, an `EVIDENCE:` line, a finding's stated basis or a required status/summary stays wherever a rule asks for it.

> Model: sonnet | Trigger: post-commit | Non-blocking (tests ride the round's ONE fixup commit)

## Purpose
Writes Vitest unit and integration tests for new or changed TypeScript functions and React components. Discovers coverage gaps that manual review misses. Runs the tests to verify they pass before reporting.

## Handling Results

### DO
- Let the agent discover gaps — it often finds untested files you didn't think about.
- Commit new tests in the round's SINGLE fixup commit, alongside every other agent's applied findings, after verifying they pass (`agent-workflow.md § PR Batching`). NOT a commit of their own: each extra commit re-triggers the whole review cycle. This does not change § When Tests Reveal Bugs below — fix and test still land together, which is the same one commit.
- If a new test reveals a bug in production code, treat it as an ISSUE — fix the production code first, then commit the test.
- Trust the agent's mock patterns — it maintains proven patterns in `.claude/agent-memory/test-writer/MEMORY.md`.
- Run `pnpm test` after committing the agent's tests to confirm nothing regressed.
- Review test names — they should describe behavior, not implementation ("schedules shorter interval when wrong" not "calls updateFsrsState").
- **Mutation-check is the AGENT's terminal duty, and its protocol now lives in
  `.claude/agents/test-writer.md` § "Mutation-check every test that pins a mechanism"** — the agent
  must SEE it, not depend on rule injection (#1254). Moved there 2026-09-06; do not restate the
  mechanics here, or the two copies drift and the condensed one wins by being nearer to hand.
  YOUR duty is the receiving end: a mutation check is a self-reported ACTION, so verify the
  ARTIFACT per `agent-workflow.md § Finding Validation` rather than the claim — `git status
  --porcelain --untracked-files=all` empty, HEAD unchanged, `git stash list --format='%H'`
  byte-identical, scratch location gone. A mutation the agent cannot make that way is yours to run.
- **Before writing a `MUTATION:` line, confirm every mechanism it names is REACHABLE by the
  fixture's inputs** — `code-style.md` §7, "A `MUTATION:` Comment Is a Prose Claim". A comment
  naming a second mechanism an earlier guard already rejects reads as coverage and is not.
- For features that create server-side state outliving the client tab (sessions, payment intents, streaming jobs, etc.), the entry-page test must assert the page reads + surfaces existing server state. Don't just test the localStorage path.

### NEVER
- Let the agent modify production code. It writes tests only. The single carve-out is the
  mutation check, bounded to a scratch copy or throwaway worktree that nothing survives — the
  protocol and the full OPEN set of bypasses are in `.claude/agents/test-writer.md`.
- Skip running the tests the agent wrote. Always verify they pass.
- Commit failing tests. If tests fail, fix them (or the production code) first.
- Write tests for the same files the agent is covering — avoid duplicate work.
- Ignore test failures as "flaky" without investigation.
- Let the agent create `__tests__/` directories — tests are co-located with source files.
- Let the agent test pre-hydration state in jsdom (it's a known limitation — `useEffect` runs before assertions in `act()`).
- Let a tracked JSON file be REWRITTEN to change a few fields — neither by the agent nor by
  yourself. Parsing and re-serialising (`json.dumps`, `JSON.stringify`, `jq` without byte-identical
  formatting) reformats every line the source happened to format differently, and the real change
  drowns: on `feat/prose-path-guard` a 9-field edit to `check-prose-paths.mutations.json` came back
  as a diff an order of magnitude larger, because the round-trip expanded every single-element
  array onto three lines. Count them for the file in front of you rather than trusting a figure
  here — `grep -cE '\[ *"[^"]*" *\]' <file>` — the number moves every time a mutation is added.
  **Do not reach for a formatting FLAG to fix this** — `--sort-keys` reorders every key and makes it
  worse, and no `--indent` value reproduces a hand-formatted file's per-line choices. Edit the TEXT:
  an exact-string replacement per field. **Verify by diff stat before committing** — the changed-line
  count should be within a line or two of the number of fields you meant to change; if it is an
  order of magnitude larger, `git checkout HEAD -- <file>` and redo it surgically. Promoted at
  count=2 across distinct commits: archive row 549 (2026-08-15, test-writer,
  `check-file-size-guard.mutations.json`, 178 lines) and this branch, where the test-writer and the
  orchestrator hit it independently. Both times the ONLY thing that caught it was reading the stat.
  A reformat is semantically harmless and reviews as noise, which is why it survives review — after
  re-doing the edit, confirm the parsed structures still match rather than re-running a long harness.

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

*Last updated: 2026-09-16*