# Test Recipes — reusable scaffolding

> Reference detail pulled in on demand by test-writer. Concise conventions live in `../MEMORY.md`.
> Stack: Vitest 4, @vitejs/plugin-react 5, @testing-library/react 16, user-event 14, jest-dom 6, jsdom 28.
> Configs: `apps/web/vitest.config.ts` (jsdom, globals, setupFiles `./vitest.setup.ts`); `packages/db/vitest.config.ts` (node).
> Run: `cd apps/web && pnpm exec vitest run <substring-of-path>`. On Windows the shell globs `[id]`, so pass a plain substring, not the full bracketed path.

---

## Core mock construction

### `vi.hoisted()` for any var referenced inside a `vi.mock()` factory — NO exceptions
Vitest hoists `vi.mock()` factory calls to the top of the file at compile time. A plain `const` declared above the factory is `undefined` at factory-execution time — the mock silently uses `undefined`, producing no-ops or crashes that are invisible until the test runs (confirmed: subject-row.test.tsx sonner mocks, both `undefined`).

```ts
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }))
vi.mock('some-module', () => ({ fn: mockFn }))
```
If a factory returns only plain `vi.fn()`s (no external var reference), `vi.hoisted` is not required — import the mocked module after the `vi.mock()` call to get a typed ref and use `vi.mocked(x)`.

### `buildChain` — Proxy-based Supabase query chain mock
Forwards any chained method (`.select().eq().order().limit().returns()` …) back to itself and resolves to a given value:
```ts
function buildChain(returnValue: unknown) {
  const awaitable = {
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}
```
Define `buildChain` **locally** in each test file (do not import it across files). Sequence per-table or per-call:
```ts
mockFrom.mockImplementation((table: string) =>
  table === 'questions' ? buildChain({ data: [...] }) : buildChain({ data: null }))
// or queue per call order:
mockFrom
  .mockReturnValueOnce(buildChain({ data: subjects, error: null }))
  .mockReturnValueOnce(buildChain({ count: 5, error: null }))
```

### Chain mock ending in `.order()` (not awaitable proxy)
For actions whose chain terminates at `.order()`, make `order` the async mock:
```ts
function buildSelectChain(result) {
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
           order: vi.fn().mockResolvedValue(result) }
}
```

### `vi.fn` generic typing — Vitest v4 single-arg form ONLY
Two-arg form was removed in Vitest 4 and fails `pnpm check-types` (blocks pre-commit).
```ts
const onSubmit = vi.fn<(input: SubmitInput) => Promise<AnswerResult>>()  // ✅ v4
const onSubmit = vi.fn<[SubmitInput], Promise<AnswerResult>>()           // ❌ removed
```
Plain `vi.fn()` is fine when the type can be inferred; add generics only when a typed param needs the explicit shape.

---

## Supabase client mocks (by surface)

- **Browser / 'use client'** — mock `@repo/db/client`: `createClient: () => ({ auth: { signInWithOtp: mockFn } })`.
- **Server Component / route handler** — mock `@repo/db/server`: `createServerSupabaseClient: async () => ({ auth: {...}, from: mockFrom })`. For RPC-based queries, expose `rpc: mockRpc` and use `mockRpc.mockResolvedValue({ data, error })`; assert RPC param mapping via `mockRpc` call args. Always test the `data: null` (non-array) → empty-result branch when production has `Array.isArray(data) ? data : []` or `data ?? []`.
- **adminClient singleton** (`@repo/db/admin`) — module-level singleton created at import time; mock the whole module with `{ from: mockFrom, rpc: mockAdminRpc }`. The `adminRpc` cast `adminClient as { rpc }` is satisfied by mocking `.rpc` directly.
- **Raw `@supabase/supabase-js`** — mock at module level so `createClient()` is intercepted before top-level env-var checks (`SERVICE_ROLE_KEY`) throw: `createClient: () => ({ from: mockFrom })`.
- **`@repo/db/middleware`** (proxy/middleware) — return a plain object response `{ status: 200, headers: new Headers() }`, NOT `NextResponse.next()` (Next server internals unavailable in tests).
- **async module init with `next/headers`** — mock `@supabase/ssr` + `next/headers` via `vi.hoisted`, then `await import('./server')` after mocks register.
- **`@/lib/supabase-rpc`**, **`@/lib/queries/*`** — mock via `vi.hoisted` named fns.

### Sequential multi-call ordering
- **Per-call queue:** `mockReturnValueOnce(buildChain(...))` in call order.
- **Two-pass questions query** (active-only count vs all-non-deleted attribution): per-table call counter; call 1 = active fixture, call ≥2 = all-non-deleted fixture.
- **`Promise.all([helperA(), helperB(), helperC()])`:** order is driven by the microtask queue, not array index — all *first* awaits fire before any *second* await. Use a **per-table** call counter (not a global one) to target a specific sub-query. (e.g. question-stats.ts: student_responses call 1 = total, call 2 = last-response, call 3 = correct-count.)
- **sessionId chunking** (`fetchUserSessionAnswers`, batches of 1000): mock `@/lib/supabase-paginate` so `fetchAllRows` is a `vi.fn()`; assert `toHaveBeenCalledTimes(N)` for batch count. Boundaries: 0→0 calls, 1000→1, 1001→2, 2500→3, 2000→2; mid-batch error → stops, `data: []`.

---

## React component / hook recipes

- **Server Component (async)** — `const jsx = await MyPage({ searchParams: Promise.resolve(params) }); render(jsx)`. For the redirect-rethrow test, invoke as a function and `await expect(Content(props)).rejects.toThrow('NEXT_REDIRECT:...')`; mock `next/dist/client/components/redirect-error` `isRedirectError` (return false in beforeEach, true in the redirect test).
- **Next error boundary (`error.tsx`)** — `act()` flushes effects, so `Sentry.captureException` is called synchronously; assert immediately, `rerender()` to verify re-capture on new error prop.
- **`useTransition` + sonner** — mock action module + `sonner`; `vi.mocked(action).mockResolvedValue(...)`; wrap assertions in `waitFor` (transition is async). Verify `e.stopPropagation()` by asserting the outer `onClick` did NOT fire.
- **Controlled inputs** — use `fireEvent.change(input, { target: { value } })` for a single precise value; `userEvent.clear()+type()` breaks on controlled inputs (clear→'' ignored by parent, type appends onto stale value). Use `userEvent` for full interaction chains.
- **Composition/wiring hooks** — mock both wired hooks via `vi.hoisted`; assert return shape, fixed args (`isExam: true`), forwarded identity (`toBe`), and that sync wraps resolve to a `Promise`.
- **State-shell components** — mock child components as buttons exposing `onEdit`/`onOpenChange` with `data-testid`; test open/close/switch transitions without Dialog internals.
- **Interval/timer hooks & components** — `vi.useFakeTimers()` in beforeEach, `vi.useRealTimers()` in afterEach; advance inside `act(() => vi.advanceTimersByTime(ms))`. Test stale-closure ref capture (rerender new callback, only latest fires), double-fire guard (count stays 1), deactivation reset (rerender `active:false`, flush with `advanceTimersByTime(0)`).
- **Ref-based same-tick lock** — fire two unawaited calls, `Promise.all` them: first returns true, second false (ref updates synchronously, unlike batched useState).
- **Generation-ref stale-async guard** — manually-controlled deferred promise for the slow/stale call (do NOT await its `act`), await the fast call's `act` (bumps generation), then resolve the stale promise and assert state unchanged.
- **Ref-based render-phase reset** — test reset from BOTH loaded state and error state (the reset block clears `error` too).

---

## jsdom limitations & quirks

- **Pre-hydration state is NOT testable.** RTL wraps `render()` in `act()`, which flushes effects, so a hydration guard's pre-hydration branch (disabled button, skeleton) never appears. Test only the post-hydration state — this is a constraint, not a missing test.
- **`window.location`** — not writable; install a capturing setter once at module scope via `Object.defineProperty(window, 'location', { configurable: true, value: { get/set href } })`; reset the captured array in beforeEach.
- **`sessionStorage`** — jsdom provides a real one; `vi.stubGlobal('sessionStorage', {...})` to inspect keys/values.
- **`process.env`** — `delete process.env.KEY` to simulate missing (assigning `undefined` coerces to the string `"undefined"`).
- **Table rows** — render `<TableHead>/<TableRow>/<TableCell>` inside a `<table><thead><tr>` wrapper or jsdom drops orphan `<th>/<tr>`. Query via `getByRole('columnheader'|'row')`.
- **Text split across DOM nodes** — use the function matcher form of `getByText((_, el) => el?.tagName === 'P' && el.textContent.includes(s))`.
- **Color-threshold logic** — assert the rendered className at each boundary (e.g. `<50`, `=50`, `50–79`, `=80`, `>80`), not an internal function.

## Stubbing libraries that fail in jsdom/Vite

- **`server-only`** — `vi.mock('server-only')` does NOT work (Vite import-analysis throws first). Fix once in `vitest.config.ts`: alias `'server-only'` → `vitest.server-only-stub.ts` (`export {}`).
- **`lucide-react`** — stub each imported icon as `() => <span data-testid="icon-..." />` (SVG transforms fail in jsdom).
- **`next/link`** — `default: ({ href, children }) => <a href={href}>{children}</a>`.
- **`next/navigation`** — mock `useRouter`/`useSearchParams` together; mock `useSearchParams().toString()` and reset in beforeEach; use `router.replace` vs `push` to match the component. Note `page=1` is omitted from URLs (param deleted).
- **`recharts`** — to assert transformed `data`, capture it in a module-scope `unknown[]` inside the mock (`BarChart: ({ data }) => { captured = data ?? []; ... }`); cast at the assertion site.
- **Base UI `Select`** — portal-based, not userEvent-testable; mock `@/components/ui/select` as a native `<select>` + `<option>`s, drive with `fireEvent.change`. Keep `items` in the prop type but ignore it in the mock body.
- **Base UI `Collapsible`** — create a React context **inside** the factory via `require('react')` (ES import unavailable in hoisted factories); forward `onOpenChange` from `Collapsible` to `CollapsibleTrigger`; expose `data-open`. Query within `collapsible-content` to avoid role ambiguity.
- **Base UI `Dialog.Popup`** — renders as `<div role="dialog">`; trigger open first, then `getByRole('dialog')` + `toHaveAttribute('aria-label', ...)`. No mock needed.
- **`@sentry/nextjs`** — `vi.mock('@sentry/nextjs', () => ({ captureException: mockFn }))`.

---

## Server Action / query coverage rules

- **Zod-wrapping action** — test: valid input delegates; non-UUID/empty rejects with ZodError (`rejects.toThrow()`); inner fn NOT called on validation failure.
- **Pure try/catch wrappers** (`executeSubmit` etc.) — pass typed `vi.fn()` mocks directly, no module mock; `vi.spyOn(console, 'error')`; confirm the exact fallback string from production source before asserting.
- **Type-guard fallback paths** — test every rejection branch (null, wrong type, missing field) + happy path; spy on `console.error` and restore.
- **Runtime type-guard filters** (`filter((r): r is T => …)`) — supply a mixed array (valid row + each-field-null rows + all-null row), assert only valid survives; plus an all-valid array to confirm good data is not dropped.
- **Early-return guard** — assert `mockFrom`/downstream call count to confirm no further queries ran past the guard.
- **Two early returns before a target path** (e.g. cleanup discard-error) — the fixture must satisfy the *earlier* returns (include a stale code) so execution reaches the target branch.
- **Test name ↔ assertion** — re-read the `it(...)` name against the assertion postcondition; update the name in the same commit when the assertion changes.

## E2E helper recipes

- **`ensure*` helpers** (`ensureAdminTestUser` …) — org lookup → user lookup/create → optional update. Mock `@supabase/supabase-js`, fresh client per test. `from('users')` returns separate `select/insert/update` (each called independently — do NOT use `buildChain`). Rollback: insert-fail → `auth.admin.deleteUser(userId)`; rollback-fail message includes `"rollback also failed: <msg>"`. Non-PGRST116 lookup error throws `'..user lookup: <msg>'`; PGRST116 = no-rows → create path.
- **Two-client pattern** (`cleanupInternalExamStudentActiveSessions`) — `getAdminClient()` (service-role, internal, for raw table I/O) vs `adminAuthedClient` (anon + signed-in admin, arg, for SECURITY DEFINER RPCs needing `auth.uid()`). Mock both independently. `signInAsAdmin` test MUST assert the 2nd `createClient` arg is the **anon** key, not service-role (security-critical).
- **Hermetic cleanup** — see `code-style.md` §7 (E2E Spec Hermiticity). Stable exported marker constant; rows carry a queryable text-prefix marker; single describe-level `afterEach` calling a shared helper; **soft-delete** when FK children exist; zero-row no-op chain (`.select('id')`, log only when `data.length > 0`). Test the helper with the queue/shift mock pattern covering org-lookup error, each update error, no-op silence, each log path, and the `org null without error` (`.single()` → `{ data: null, error: null }`) branch.
