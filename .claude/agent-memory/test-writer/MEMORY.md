# Test Writer — Memory

> Operational test-writing knowledge for this repo (Vitest 4 + RTL + jsdom). The repo's binding
> test *conventions* live in `code-style.md` §7 — this file holds the construction know-how that
> rules don't capture. Detailed scaffolding is in `topics/test-recipes.md`.

## Recurring-pattern tracker

> Counts increment per distinct occurrence; rows transition state, never deleted (see `agent-memory.md`).

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| New error path / branch in a modified file left untested (modified file already has a co-located test) | 2026-03-13 | 16 | 2026-07-13 | PROMOTED → enforced: write the branch test in the SAME commit |
| `vi.fn` two-arg generic form (removed in Vitest 4, fails `check-types`) | 2026-03-14 | 2 | 2026-03-15 | PROMOTED → use single function-type arg form (recipes: vi.fn generic) |
| Test name contradicts its assertion postcondition | 2026-04-05 | 3 | 2026-06-06 | PROMOTED → re-read name vs assertion, fix in same commit |

## Durable knowledge

- **Untested branches in a feature commit:** compare `git show <sha> --stat --name-only` vs same filtered to `*.test.{ts,tsx}` — any source file missing its co-located test is a gap. Detail + VFR RT Phase 6 example: [durable-knowledge § untested-branches](topics/durable-knowledge.md#untested-branches).
- **Catch block multi-effect ordering:** test the specific-error path with BOTH effects (teardown + return value) asserted together — testing separately lets a reordering regression go invisible. Detail: [durable-knowledge § catch-block-multi-effect](topics/durable-knowledge.md#catch-block-multi-effect).
- **Bash security-gate test extras:** (a) empty→fail-closed; (b) BLOCKED wins over APPROVED regardless of order; (c) CRLF `[[:space:]]` pin; (d) leading-whitespace variant. Detail + `run_case_raw_bytes` pattern: [durable-knowledge § bash-security-gate](topics/durable-knowledge.md#bash-security-gate).
- **Bash PostToolUse hook tests:** cases needed — matching stdin fires output, non-matching exits clean, flat-command backward-compat fires output, empty stdin exits clean. Co-located `.test.sh`, no framework, `run_case` counter pattern (mirrors `run-security-auditor.test.sh`). Confirmed: `cr-local-plan-reminder.test.sh` (2026-07-11). **1MB cap pin (bash hooks using `head -c 1000000`):** add a `run_case_no_output` case where 1.1MB of padding precedes the trigger string — `big_padding="$(printf '%1100000s' '' | tr ' ' 'x')"` + `run_case_no_output "..." "${big_padding}trigger"`. Regression guard: reverting to `cat` exposes the full payload → raw-string fallback fires → test fails.
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

## Topics

- [test-recipes](topics/test-recipes.md) — full scaffolding: `vi.hoisted`/`buildChain`, Supabase/Next/Base-UI/recharts mocks, timer & ref recipes, jsdom quirks, E2E helper patterns.
- [durable-knowledge](topics/durable-knowledge.md) — detail for bullets that reference it: untested-branch detection, bash hook extras, sessionStorage, layout testing, RPC integration, PostgREST quirks, app-layer integration setup.
