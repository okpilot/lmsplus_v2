# Test Writer — Memory

> Operational test-writing knowledge for this repo (Vitest 4 + RTL + jsdom). The repo's binding
> test *conventions* live in `code-style.md` §7 — this file holds the construction know-how that
> rules don't capture. Detailed scaffolding is in `topics/test-recipes.md`.

## Recurring-pattern tracker

> Counts increment per distinct occurrence; rows transition state, never deleted (see `agent-memory.md`).

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| New error path / branch in a modified file left untested (modified file already has a co-located test) | 2026-03-13 | 3 | 2026-03-14 | PROMOTED → enforced: write the branch test in the SAME commit |
| `vi.fn` two-arg generic form (removed in Vitest 4, fails `check-types`) | 2026-03-14 | 2 | 2026-03-15 | PROMOTED → use single function-type arg form (recipes: vi.fn generic) |
| Test name contradicts its assertion postcondition | 2026-04-05 | 2 | 2026-04-05 | PROMOTED → re-read name vs assertion, fix in same commit |

## Durable knowledge

- **Always `vi.hoisted()` for any variable a `vi.mock()` factory references** — no exceptions. Vitest hoists factories above plain `const`s, so the var is `undefined` at factory time and the mock silently no-ops. Bug is invisible until the test runs.
- **jsdom: pre-hydration state is untestable.** RTL's `render()` runs inside `act()`, which flushes effects, so a hydration guard's pre-hydration branch (skeleton/disabled) never appears. Test only the post-hydration state — not a missing test, a jsdom constraint.
- **Co-locate tests, one file per source file, behavior-first names; new `_hooks/`, `_utils/`, `lib/` files ship with a test in the same commit** (per `code-style.md` §7). Disallowed `it(...)` title patterns (impl leakage) and required router-URL / lifecycle / reload assertions are all in §7 — defer to it, don't re-document.
- **`buildChain` is defined locally per test file** (Proxy that forwards chained methods and resolves to a fixture); never import it across files. Sequence multi-call queries with a per-call queue or a **per-table** call counter — never a global counter (microtask ordering in `Promise.all` defeats array-index assumptions).
- **Mock the right Supabase surface:** `@repo/db/client` (browser), `@repo/db/server` (Server Component/route), `@repo/db/admin` singleton (mock whole module — created at import time), raw `@supabase/supabase-js` (intercept before top-level `SERVICE_ROLE_KEY` checks throw), `@repo/db/middleware` (plain `{ status, headers }`, not `NextResponse.next()`).
- **Always test the non-array RPC branch** when production has `Array.isArray(data) ? data : []` or `data ?? []` — `{ data: null, error: null }` is a real gap reviewers flag as dead code. Read the full loop→map→filter pipeline first: a null-data empty Map can drop filtered subjects entirely, not just zero their fields.
- **Stub `server-only` via a `vitest.config.ts` alias** (`vi.mock('server-only')` fails — Vite import-analysis throws first). One-time config change.
- **Re-throw `isRedirectError` tests:** Server-Component content wrappers must verify happy path, regular-error fallback, AND redirect re-throw (mock `next/dist/client/components/redirect-error`).
- **Confirm the exact production fallback string before asserting it** in try/catch wrapper tests; `vi.spyOn(console,'error')` to silence + assert logging.

## Topics

- [test-recipes](topics/test-recipes.md) — full scaffolding: `vi.hoisted`/`buildChain`, Supabase/Next/Base-UI/recharts mocks, timer & ref recipes, jsdom quirks, E2E helper patterns.
