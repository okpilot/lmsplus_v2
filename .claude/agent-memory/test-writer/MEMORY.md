# Test Writer — Memory

> Operational test-writing knowledge for this repo (Vitest 4 + RTL + jsdom). The repo's binding
> test *conventions* live in `code-style.md` §7 — this file holds the construction know-how that
> rules don't capture. Detailed scaffolding is in `topics/test-recipes.md`.

## Recurring-pattern tracker

> Counts increment per distinct occurrence; rows transition state, never deleted (see `agent-memory.md`).

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| New error path / branch in a modified file left untested (modified file already has a co-located test) | 2026-03-13 | 18 | 2026-08-17 | PROMOTED → enforced: write the branch test in the SAME commit |
| `vi.fn` two-arg generic form (removed in Vitest 4, fails `check-types`) | 2026-03-14 | 2 | 2026-03-15 | PROMOTED → use single function-type arg form (recipes: vi.fn generic) |
| Test name contradicts its assertion postcondition | 2026-04-05 | 3 | 2026-06-06 | PROMOTED → re-read name vs assertion, fix in same commit |
| Sibling-parity retry test asserts only END-state, missing a sibling's "clears at start" test | 2026-08-17 | 1 | 2026-08-17 | WATCHING |
| `toHaveLength(N)` on an array whose CONTENT matters (toUpdate, toInsert) — count-only passes mutants that swap correct entries for wrong ones of equal count | 2026-08-19 | 1 | 2026-08-19 | WATCHING |
| Two sibling error-path tests both happen to produce the SAME numeric literal from two different formulas (e.g. `pageSize` vs `to-from+1`, both = 2), so neither catches a mutant that swaps one formula for the other — only a fixture where the formulas diverge (the last, remainder-sized page) does | 2026-09-01 | 1 | 2026-09-01 | WATCHING |
| A guard's "fires on X alone" fixture (e.g. `x === 0` → sentinel) only ever paired X with a second field ALSO at its zero/default value (e.g. `(0, 0)`), so a mutant that AND-tightens the guard to require both fields at default (`x === 0 && y === 0`) goes undetected — need a fixture with X at trigger value and Y at a NON-default value to isolate the single-field guard | 2026-09-02 | 1 | 2026-09-02 | WATCHING |
| `pipeline.test.mjs` subset-extraction: emptiness-only pins miss a SELECTIVE filter shrink or an extraction collapsed to the sentinel alone — detail: [durable-knowledge § pipeline-subset-extraction](topics/durable-knowledge.md#pipeline-subset-extraction) | 2026-09-08 | 2 | 2026-09-08 | WATCHING |
| MUTATION comment says "delete A or B" when only A is load-bearing — both guards catch the same fixtures so only one is independently pinned. Fix: add a fixture that passes guard A but is rejected by guard B only. | 2026-09-14 | 1 | 2026-09-14 | RESOLVED → `ab310cc9` |
| Parallel implementations share a mechanism but only one is tested — e.g. `reAdded()` and `survivors()` both use escapeRe but only reAdded() had a unit test for it. Fix: unit tests per mechanism. | 2026-09-14 | 2 | 2026-09-14 | RESOLVED → PROMOTED → [durable-knowledge § parallel-implementation-mechanism](topics/durable-knowledge.md#parallel-implementation-mechanism) |
| `grepScope`/`listTracked` ref-branch (`--cached` vs SHA) not independently pinned in `--base` mode — all tests use linear histories where last commit IS HEAD. | 2026-09-14 | 1 | 2026-09-14 | RESOLVED → `e8e3e20b` split to `check-retracted-phrase.base.test.mjs` |
| MUTATION comment names a defence-in-depth mechanism that is not load-bearing — removing pathspec alone leaves all tests green; only removing BOTH pathspec AND filter reddens it. | 2026-09-14 | 1 | 2026-09-14 | WATCHING |
| A multi-flag fix that shares one test across all flags proves nothing about flags the test doesn't exercise — each flag needs its own independently-verifiable fixture. | 2026-09-14 | 1 | 2026-09-14 | WATCHING |
| Deleting a lone `if` whose `else` still exists produces a syntax error reddening ALL tests — change the CONDITION to `false` instead of deleting the line. | 2026-09-14 | 1 | 2026-09-14 | WATCHING |
| MUTATION comment says "any of N throws" but fixture only reaches ONE — narrow the comment to the reachable path and add mutId assertions per distinctive path. | 2026-09-14 | 1 | 2026-09-14 | WATCHING |
| "not pinnable" claim conflates unit-tier limitation with genuinely-unreachable — challenge before accepting. A spawn-level test can reach paths a unit test can't when repoRoot() inherits process.cwd(). | 2026-09-14 | 1 | 2026-09-14 | WATCHING |
| Arithmetic on a previously-always-zero field is invisible until non-zero fixtures exist — once real data makes the field non-zero, pin it with a spawn-level test asserting the output count. | 2026-09-17 | 1 | 2026-09-18 | WATCHING |
| Spawned-process tests for hooks calling `node --test` must strip NODE_TEST_CONTEXT — otherwise inner subprocess detects recursion and produces no TAP plan, faulting for the wrong reason. Pattern: spread without key into spawnSync env. | 2026-09-14 | 1 | 2026-09-14 | WATCHING |
| `hunksfor-paths-through-argv` is a CASCADE mutation for check-retracted-phrase suites — adding any new test requires (a) verifying if it reddens under this mutation in scratch worktree, (b) adding title to expectRed BEFORE running the full harness. | 2026-09-18 | 1 | 2026-09-18 | WATCHING |
| Uniqueness test with `Date.now()`-based collision protection guarded by a `toBeLessThan(N ms)` timing bound — flake risk on loaded CI runners. Fix: freeze clock with `vi.useFakeTimers()` + `vi.setSystemTime()` so uniqueness depends solely on the random half; timing bound unnecessary. | 2026-09-18 | 2 | 2026-09-18 | WATCHING |

## Durable knowledge

- **Untested branches in a feature commit:** compare `git show <sha> --stat --name-only` vs same filtered to `*.test.{ts,tsx}` — any source file missing its co-located test is a gap. Detail + VFR RT Phase 6 example: [durable-knowledge § untested-branches](topics/durable-knowledge.md#untested-branches).
- **One-position-fixed fan-out functions:** mutation-test EVERY sibling position with the SAME probe value — a fixed-and-tested position proves nothing about its siblings reading a different view. Detail: [durable-knowledge § one-position-fixed-sweep](topics/durable-knowledge.md#one-position-fixed-sweep).
- **Catch block multi-effect ordering:** test the specific-error path with BOTH effects (teardown + return value) asserted together — testing separately lets a reordering regression go invisible. Detail: [durable-knowledge § catch-block-multi-effect](topics/durable-knowledge.md#catch-block-multi-effect).
- **Bash security-gate test extras:** (a) empty→fail-closed; (b) BLOCKED wins over APPROVED regardless of order; (c) CRLF `[[:space:]]` pin; (d) leading-whitespace variant. Detail + `run_case_raw_bytes` pattern: [durable-knowledge § bash-security-gate](topics/durable-knowledge.md#bash-security-gate).
- **Bash PostToolUse hook tests:** match/non-match/flat-command/empty-stdin cases; co-located `.test.sh`, `run_case` counter pattern. **1MB cap:** `run_case_no_output` with 1.1MB prefix — reverting `head` to `cat` fires raw-string fallback and reddens it. Confirmed: `cr-local-plan-reminder.test.sh` (2026-07-11).
- **Cleanup destructures `{ error }`** everywhere (finally, afterEach, afterAll) — log via `console.error`, never throw inside `finally` (biome noUnsafeFinally). Promoted count=2 (13fa0249, 50c81b94).
- **`vi.hoisted()` required** for any var a `vi.mock()` factory references — hoisting puts the factory above plain `const`s; the var is `undefined` at factory time otherwise.
- **`buildChain` local per file** — Proxy forwards chained methods to self, resolves to fixture. Never shared across files. Multi-call: per-table counter, not global index (microtask ordering defeats array-index assumptions in `Promise.all`).
- **Co-locate, one file per source** — `_hooks/`/`_utils/`/`lib/` new files ship with co-located test in the same commit. Behavior-first names. §7 is authoritative for naming/router-URL/lifecycle/reload rules.
- **Supabase surface:** `@repo/db/client` (browser), `/server` (SC/route), `/admin` (mock whole module — created at import time), raw `@supabase/supabase-js` (pre-`SERVICE_ROLE_KEY`-throw intercept), `/middleware` (plain `{status,headers}`).
- **`sessionStorage` replacement:** `Object.defineProperty(globalThis,'sessionStorage',{value:{...},writable:true})` in `beforeEach` + `vi.hoisted()` for mock fns — `vi.spyOn` doesn't intercept inside-module calls. Detail: [durable-knowledge § sessionstorage](topics/durable-knowledge.md#sessionstorage).
- **Non-array RPC branch:** always test `{ data: null, error: null }` when production has `Array.isArray(data) ? data : []` — reviewers flag the null branch as dead code otherwise.
- **`restoreMocks: true` in both vitest configs** — no `afterEach(() => vi.restoreAllMocks())` nets needed; keep explicit `.mockRestore()` only for global/prototype spies (`globalThis.confirm`, `Storage.prototype.setItem`).
- **Server-only alias:** stub via `vitest.config.ts` alias — `vi.mock('server-only')` fails (Vite import-analysis throws first).
- **isRedirectError:** Server-Component wrappers need happy path + regular-error fallback + redirect re-throw (mock `next/dist/client/components/redirect-error`).
- **Smart apostrophes (`'` U+2019)** cause invisible `toBe` mismatches — run `hexdump -C` on grep output when assertion fails but terminal renders both sides identically.
- **layout.tsx testable:** `await Layout({ children })` → `render(jsx)`. Stub `'use client'` children as `<div data-testid="…">`. Detail: [durable-knowledge § layout-testing](topics/durable-knowledge.md#layout-testing).
- **"no error banner" → also assert positive content** — pair `queryByRole('alert') toBeNull` with `getByTestId('content-component') toBeInTheDocument` (PR bac94f2a).
- **SECURITY DEFINER RPC integration tests:** `supabase db push --local` first; `getAuthenticatedClient()` for auth.uid() RPCs; in-place migration edits need `db reset`. Detail: [durable-knowledge § rpc-integration](topics/durable-knowledge.md#rpc-integration).
- **Pure DB triggers** → `packages/db/src/__integration__/trigger-*.integration.test.ts`, not unit tests. Run: `pnpm --filter @repo/db test:integration`.
- **TIMESTAMPTZ comparison:** `new Date(value).getTime()` on both sides — never string-compare (`+00:00` vs `Z` diverge).
- **Playwright helpers:** export pure logic, add co-located `.test.ts` (Buffer available in jsdom). Never import `@playwright/test` types — define minimal local fixture type.
- **CHECK constraints:** test via service-role admin INSERT (not RPC) — assert `23514`/`check`/constraint name + positive control. Pattern: `rpc-vfr-rt-constraint-regression.integration.test.ts` mig-094.
- **PostgREST unnamed TEXT param:** key `""` → first `text` param; result format `{value}`; inputs with `"` corrupt via JSON encoding. Detail: [durable-knowledge § postgrest-text-param](topics/durable-knowledge.md#postgrest-text-param).
- **Partial unique index:** name the "permit after ended/deleted" test explicitly — `it('allows a new session after the previous one is ended')` — implicit fixture coverage is insufficient.
- **jsdom: `isContentEditable` undefined** — `el.contentEditable = 'true'` does NOT make `isContentEditable` truthy. `||` chain returns `undefined` not `false` — assert `toBeFalsy()`, not `toBe(false)`. Confirmed: `quiz-key-actions.test.ts`.
- **KeyboardEvent target in jsdom:** create real element, append to body, `Object.defineProperty(event,'target',{value:el})` — constructor ignores `target` init. Wrap dispatch in `act(...)`. Confirmed: `use-quiz-keyboard.test.ts`.
- **No `Promise.all` for PL/pgSQL EXCEPTION paths** — non-deterministic overlap. Substitute: (1) service-role duplicate INSERT proves 23505; (2) idempotent-resume test proves SELECT path.
- **`Promise.race` timeout branch:** fake timers + `vi.runAllTimersAsync()` — `vi.advanceTimersByTime(N+1)` misses microtask chains. Isolate in `vi.useFakeTimers()`/`vi.useRealTimers()` try/finally per test.
- **Array-mapping actions:** assert per-item field shape (not just `.toHaveLength`) — key-name regressions produce all-`undefined` items silently. Confirmed: `batchSubmitQuiz` results mapping (#925 Phase 2).
- **`ended_at IS NULL` guard test:** `seedOpenSession → signInAs → completeQuiz → action → expect error`. `nonexistent UUID` and `cross-user` tests do NOT cover this guard.
- **App-layer integration test setup:** per-file suffix + admin client, `beforeAll` seeds, `signInAs` at TOP of each test, error-accumulator `afterAll`, fresh `seedOpenSession` per session-ending action. Detail: [durable-knowledge § app-layer-integration](topics/durable-knowledge.md#app-layer-integration).
- **Test file splits:** moved `describe` block must carry ALL sentinel vars + cleanup guards + every branch — re-diff setup/`beforeAll`/`afterAll` against source before committing. Count=2: #698/#666, #951.
- **`lib/queries/*.ts` JSONB branches:** co-located unit test with `makeChain(returnValue)` Proxy — integration tests always see well-formed data, so defensive guards are never exercised. Confirmed: `oral-exam-session.test.ts` (2026-07-02).
- **Soft-delete of single-SELECT-policy tables must have an integration test** — when the USING clause requires `deleted_at IS NULL`, the RLS client rejects the update (post-update row is invisible); unit mocks pass regardless. Tables: `questions`, `users` (commit d9abcf41).
- **Zero-export CLI scripts (`apps/web/scripts/*.ts` with no `export` + top-level `process.exit`/env gates) are not unit-testable** — say so plainly, don't force a test. Detail: [durable-knowledge § zero-export-cli-scripts](topics/durable-knowledge.md#zero-export-cli-scripts).
- **Rule-prose-only commits (`.claude/rules/*.md`, `CLAUDE.md`, agent-memory tracker-row edits) are not unit-testable** — same class as zero-export CLI scripts: say so, don't fabricate a `.test.sh`/`.test.mjs` nobody wires up (that exact defect was filed as #1261).
- **Shell embedded in `.claude/commands/*.md` fenced blocks — first-party, proven bug history, still no test:** no artifact in the repo executes command-file bodies, so verify by direct execution in a scratch repo and report inline instead of writing a `.test.sh` against a copy-pasted duplicate. Detail: [durable-knowledge § commands-md-shell](topics/durable-knowledge.md#commands-md-shell).
- **Isolate a new guard-path fixture from a shared deterministic random-selection pool** via `status: 'draft'` + a directly-inserted session row (bypass the start-RPC). Detail: [durable-knowledge § isolate-from-shared-pool](topics/durable-knowledge.md#isolate-from-shared-pool).
- **Sibling-parity audit: diff `it()` TITLES, not just mechanisms** — grep-comparing title lists surfaces gaps a mechanism-by-mechanism read misses. Detail: [durable-knowledge § sibling-title-diff](topics/durable-knowledge.md#sibling-title-diff).
- **Compound-condition branch split:** for `!Array.isArray(x) || x.length === 0`, audit each `A || B` — removing A may produce a different thrown value than removing B; add a dedicated test per mechanism. Confirmed: `mc-content.ts` (2026-08-17).
- **Strict-comparison boundary pins:** test at EXACTLY the threshold and EXACTLY the cap — catches `<` → `<=` and `>` → `>=` drift. Confirmed: `mc-content.ts` `MIN_CORPUS_FOR_KEY_BALANCE` / `KEY_SKEW_TOLERANCE` (2026-08-17).
- **Regex widening: add a `\b` pin for each new alternative** — the existing negative test pins only the old alternative's context. Confirmed: `dialog-fill-content.test.ts` (2026-08-16, `6137a956`).
- **Agent frontmatter `tools:` invariant** — `pipeline.test.mjs` asserts every agent has `tools:` and only test-writer has Write/Edit. Mutation-verified 2026-09-07.
- **Prose-only rule/mirror commits (CLAUDE.md, `.claude/rules/*.md`, `.coderabbit.yaml` prose edits) owe no test** — confirm via `git show <sha> --stat` (zero `.ts`/`.tsx`/`.mjs`/`.sh`/`.sql`) rather than assume. Detail: [durable-knowledge § coderabbit-yaml-prose](topics/durable-knowledge.md#coderabbit-yaml-prose).
- **pipeline.test.mjs role-rename audits:** update EXPECTED_CORE, EXPECTED_ROLES, and REQUIRED_ORDER — each pins a distinct aspect; updating only one leaves typos invisible. Mutation-verified 2026-09-17.
- **JS regex `$` does NOT match before a trailing `\r` (without `m` flag).** `"// GROUP: alpha\r"` fails `/^\s*\/\/ GROUP: (.*)$/` because `.*` cannot consume `\r` (line terminator) and `$` without `m` doesn't match before `\r`. A regex ending with `(.*)$` on input split by `\n` silently drops CRLF lines. Fix: add `m` flag or `[^\n]` instead of `.*`, or strip `\r` before splitting. Confirmed: `parseSuite`'s `GROUP_MARKER_RE` in `run-mutations.mjs` (2026-09-18 chore/validate-mutation-group-refs — filed as ISSUE).

## Topics

- [test-recipes](topics/test-recipes.md) — full scaffolding: `vi.hoisted`/`buildChain`, Supabase/Next/Base-UI/recharts mocks, timer & ref recipes, jsdom quirks, E2E helper patterns.
- [durable-knowledge](topics/durable-knowledge.md) — detail for bullets that reference it: untested-branch detection, bash hook extras, sessionStorage, layout testing, RPC integration, PostgREST quirks, app-layer integration setup.
