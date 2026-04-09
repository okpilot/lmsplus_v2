# Test Writer — Patterns Log

## Stack setup (Phase 4, 2026-03-11)

### Installed packages (apps/web devDependencies)
- `vitest` ^4
- `@vitejs/plugin-react` ^5
- `@testing-library/react` ^16
- `@testing-library/user-event` ^14
- `@testing-library/jest-dom` ^6
- `jsdom` ^28

### Installed packages (packages/db devDependencies)
- `vitest` ^4

### Config files created
- `apps/web/vitest.config.ts` — jsdom environment, globals: true, setupFiles: ['./vitest.setup.ts']
- `apps/web/vitest.setup.ts` — imports `@testing-library/jest-dom`
- `packages/db/vitest.config.ts` — node environment, globals: true

### scripts added
- `apps/web/package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`
- `packages/db/package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`

---

## Rules

### Mocking adminClient singleton from @repo/db/admin (2026-04-06)
`adminClient` is a module-level singleton created at import time (calls `createClient` immediately).
Mock the entire `@repo/db/admin` module to prevent real Supabase client creation. The mock object
must expose every method the queries file calls (`.from`, `.rpc`).

```ts
const mockAdminRpc = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@repo/db/admin', () => ({
  adminClient: {
    from: mockFrom,
    rpc: mockAdminRpc,
  },
}))
```

The `adminRpc` wrapper in `queries.ts` casts `adminClient as { rpc: RpcFn }` — mocking `.rpc`
directly on the mock object satisfies this cast. Use `mockAdminRpc.mockResolvedValue({ data, error })`.

### parseFilters-style param validation tests (2026-04-06)
When a page.tsx exports a `parseFilters(params)` helper that validates URL search params,
the test file follows this structure (see `admin/dashboard/page.test.ts`):
- One `it` per field per case: valid value, invalid value → default, array → default, undefined → default
- A final `it` asserting all defaults together via `toEqual` on the full return object
- No mocks needed — pure function, no external deps
- Vitest run command: `cd apps/web && pnpm exec vitest run <path/to/page.test.ts>`

---

### Test name must match assertion postcondition (2026-04-05, count 2)
After writing a test, re-read the test name against the assertion body. The name must match the assertion's postcondition exactly, not the original intent. When the assertion body changes, update the name in the same commit. A passing test with a contradicting name gives false confidence and will be flagged by reviewers.

---

### Testing isRedirectError re-throw in async Server Component content wrappers (2026-04-08)
Content components (e.g. `KpiCardsContent`) wrap an async query in try/catch and show
an error fallback on failure. After adding `isRedirectError` re-throw, tests must verify:
1. Happy path: query succeeds → child component rendered
2. Regular error: query rejects → fallback message rendered
3. Redirect error: query rejects with a redirect → error is re-thrown, NOT swallowed

Mock `next/dist/client/components/redirect-error` directly via vi.hoisted:

```ts
const mockIsRedirectError = vi.hoisted(() => vi.fn())

vi.mock('next/dist/client/components/redirect-error', () => ({
  isRedirectError: mockIsRedirectError,
}))
```

In tests, set `mockIsRedirectError.mockReturnValue(false)` in `beforeEach`, and
`mockIsRedirectError.mockReturnValue(true)` in the redirect-specific test.

Invoke the async Server Component directly as a function (no render needed for the throw test):
```ts
const redirectError = new Error('NEXT_REDIRECT:/auth/login')
mockQuery.mockRejectedValue(redirectError)
mockIsRedirectError.mockReturnValue(true)
await expect(MyContent({ props })).rejects.toThrow('NEXT_REDIRECT:/auth/login')
```

For happy-path and fallback tests, `await Component(props)` and then `render(element)`.

### Testing Next.js error boundary components with Sentry (2026-04-08)
Error boundaries (Next.js `error.tsx`) are `'use client'` components that call
`Sentry.captureException(error)` in a `useEffect`. Since `act()` flushes effects,
Sentry is called synchronously in the test — no need to wait or flush manually.

```ts
const mockCaptureException = vi.hoisted(() => vi.fn())
vi.mock('@sentry/nextjs', () => ({ captureException: mockCaptureException }))
```

After `render(<ErrorPage error={err} reset={vi.fn()} />)`:
- `expect(mockCaptureException).toHaveBeenCalledWith(err)` — passes immediately
- Use `rerender()` to verify Sentry is called again when error prop changes

### Vitest run command for bracket paths on Windows (2026-04-08)
The shell expands `[id]` as a glob on Windows. Use a simple string pattern that
matches part of the file path instead of the full glob:
```bash
pnpm exec vitest run "student-header"
# NOT: pnpm exec vitest run "app/app/admin/.../[id]/_components/student-header.test.tsx"
```

## Patterns established

### Testing async module initialisation with next/headers (packages/db, 2026-03-12)
When `server.ts` (or similar) calls `await cookies()` from `next/headers`, mock both
`@supabase/ssr` and `next/headers` via `vi.hoisted`, then use top-level `await import()`
to load the module under test after mocks are registered:

```ts
const { mockCreateServerClient, mockCookiesGetAll, mockCookiesSet } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
  mockCookiesGetAll: vi.fn(),
  mockCookiesSet: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({ createServerClient: mockCreateServerClient }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: mockCookiesGetAll,
    set: mockCookiesSet,
  }),
}))

const { createServerSupabaseClient } = await import('./server')
```

### Verifying silent error suppression in try/catch
To assert a catch block silently suppresses errors (no rethrow), make the mock throw,
then call the adapter and assert `.not.toThrow()`:

```ts
mockCookiesSet.mockImplementation(() => { throw new Error('read-only') })
const cookiesConfig = mockCreateServerClient.mock.calls[0]?.[2].cookies
expect(() => cookiesConfig.setAll([...])).not.toThrow()
```

### Mocking Supabase client (browser / 'use client' components)
```ts
const mockSignInWithOtp = vi.fn()
vi.mock('@repo/db/client', () => ({
  createClient: () => ({
    auth: { signInWithOtp: mockSignInWithOtp },
  }),
}))
```

### Mocking Supabase server client (Server Components / route handlers)
```ts
const mockExchangeCodeForSession = vi.fn()
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getUser: mockGetUser,
      signOut: vi.fn(),
    },
    from: mockFrom,
  }),
}))
```

### Mocking next/navigation (useRouter)
```ts
const mockRouterPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))
```

### Mocking Server Actions in hook tests (2026-03-12)
Server Actions ('use server' files) must be mocked at the module path — the same
import path used in the hook under test. Use vi.hoisted + spread args pattern:
```ts
const { mockStartQuizSession } = vi.hoisted(() => ({ mockStartQuizSession: vi.fn() }))
vi.mock('../actions/start', () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
}))
```
This avoids TypeScript overload resolution issues while keeping the mock callable.

### Mocking sessionStorage in jsdom
jsdom provides a real sessionStorage but `vi.stubGlobal` can replace it for inspection:
```ts
const storage: Record<string, string> = {}
vi.stubGlobal('sessionStorage', {
  setItem: (key: string, value: string) => { storage[key] = value },
  getItem: (key: string) => storage[key] ?? null,
})
```
Use this when the test needs to assert that specific keys/values were stored.

### Mocking next/link in tests
```tsx
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
```

### vi.hoisted() for mocks referenced inside vi.mock factory
When a mock variable needs to be referenced inside the `vi.mock()` factory AND also used
in tests, use `vi.hoisted()` — never declare it as a plain `const` above `vi.mock()`:
```ts
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }))
vi.mock('some-module', () => ({ fn: mockFn }))
```

**This applies to every new mock module, without exception.** Vitest hoists `vi.mock()` factory
calls to the top of the file at compile time. A plain `const` declared above the factory is
`undefined` at factory execution time — the mock silently uses `undefined` as the implementation,
producing no-ops or crashes depending on the call site. The bug is invisible until the test runs.

Confirmed failure case (2026-03-20, subject-row.test.tsx): sonner toast mocks declared as plain
`const` above `vi.mock('sonner', ...)` — both `mockToastSuccess` and `mockToastError` were
`undefined` inside the factory. Caught by the test run, fixed before commit.

Rule: for every new `vi.mock()` factory that references a variable, that variable MUST come from
`vi.hoisted()`. There are no exceptions.

### window.location.href in jsdom
jsdom's `window.location` is not directly writable. Use `Object.defineProperty` once at
module scope to install a custom setter that captures values:
```ts
const assignedHrefs: string[] = []
Object.defineProperty(window, 'location', {
  configurable: true,
  value: {
    origin: 'http://localhost:3000',
    get href() { return assignedHrefs[assignedHrefs.length - 1] ?? '' },
    set href(val: string) { assignedHrefs.push(val) },
  },
})
// In beforeEach: assignedHrefs.length = 0
```

### Testing async server components (Next.js)
Server components are async functions returning JSX. Await them and pass the result to render():
```tsx
async function renderPage(params?: unknown) {
  const jsx = await MyServerPage({ searchParams: Promise.resolve(params ?? {}) })
  render(jsx)
}
```

### Mocking @repo/db/middleware (proxy / middleware tests)
```ts
const MOCK_SESSION_RESPONSE = { status: 200, headers: new Headers() }
vi.mock('@repo/db/middleware', () => ({
  createMiddlewareSupabaseClient: () => ({
    supabase: { auth: { getUser: mockGetUser } },
    response: MOCK_SESSION_RESPONSE,
  }),
}))
```
Use a plain object (not `NextResponse.next()`) as the mock response to avoid Next.js
server internals not being available in test environments.

### Route handler redirect assertions
`NextResponse.redirect()` defaults to status 307:
```ts
expect(response.status).toBe(307)
const location = new URL(response.headers.get('location') ?? '')
expect(location.pathname).toBe('/expected/path')
expect(location.searchParams.get('error')).toBe('expected_code')
```

### Supabase .from() chain mock
```ts
mockFrom.mockReturnValue({
  select: () => ({
    eq: () => ({
      single: async () => ({ data: { id: 'row-id' } }),
    }),
  }),
})
```

### Testing table-row components in jsdom (2026-04-06)
Render `<TableHead>`, `<TableRow>`, and `<TableCell>` components inside a minimal
`<table><thead><tr>` / `<table><tbody>` wrapper so jsdom does not strip the elements:
```tsx
render(
  <table>
    <thead>
      <tr>
        <SortableHead {...props} />
      </tr>
    </thead>
  </table>,
)
```
Without the wrapper, browsers (and jsdom) silently drop orphan `<th>` / `<tr>` nodes.
Use `screen.getByRole('columnheader')` for `<th>` and `screen.getByRole('row')` for `<tr>`.

### Testing colour threshold logic through rendered CSS classes (2026-04-06)
When a component applies a colour class based on a numeric threshold (e.g. mastery, score),
verify the className attribute of the value element at each boundary rather than checking
an internal function:
```tsx
render(<KpiCards data={buildKpis({ avgMastery: 50 })} range="30d" />)
expect(screen.getByText('50%').className).toContain('text-amber-500')
```
Boundary cases to cover: below-low (< 50), at-low-boundary (= 50), mid (50–79),
at-high-boundary (= 80), above-high (> 80).

---

### process.env deletion in tests
Use `delete process.env.SOME_KEY` (not `= undefined`) to simulate missing env vars.
`process.env` only stores strings — assigning `undefined` coerces to the string `"undefined"`.

### Proxy-based Supabase chain mock
For query functions that chain `.select().eq().order().limit().returns()` etc., use a Proxy
that forwards any method call back to itself and resolves to a given return value:
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
Then sequence multiple from() calls per table name using a counter or table-name switch:
```ts
mockFrom.mockImplementation((table: string) => {
  if (table === 'easa_subjects') return buildChain({ data: [...] })
  if (table === 'questions') return buildChain({ data: [...] })
  return buildChain({ data: null })
})
```

### Testing pure async wrapper functions with try/catch (2026-03-14)
For thin wrapper functions that call a callback and catch errors (e.g., `executeSubmit`,
`executeComplete`), pass typed `vi.fn()` mocks directly — no module mocking needed.
Spy on `console.error` to assert logging without output noise:
```ts
beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

it('returns a failure result when the callback rejects', async () => {
  const onSubmit = vi.fn<(input: Input) => Promise<Result>>().mockRejectedValue(new Error('boom'))
  const result = await executeSubmit(onSubmit, input)
  expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
})
```
Always confirm the exact fallback error string from the production source before asserting.

### Mocking Base UI Collapsible with context-forwarded open state (2026-04-09)

When a component wraps Base UI `Collapsible` + `CollapsibleTrigger` with controlled open/close
state via `onOpenChange`, the mock must forward `onOpenChange` from `Collapsible` to
`CollapsibleTrigger` so that clicking the trigger actually toggles the open state in tests.

Use a React context created **inside** the `vi.mock()` factory, obtained via `require('react')`
(not the ES module import, which is not available at factory execution time):

```ts
vi.mock('@/components/ui/collapsible', () => {
  const R = require('react') as typeof React
  type Ctx = { open: boolean; onOpenChange: (v: boolean) => void }
  const CollapsibleCtx = R.createContext<Ctx>({ open: false, onOpenChange: () => {} })

  function Collapsible({ children, open = false, onOpenChange = () => {} }: { ... }) {
    return (
      <CollapsibleCtx.Provider value={{ open, onOpenChange }}>
        <div data-testid="collapsible" data-open={open}>{children}</div>
      </CollapsibleCtx.Provider>
    )
  }

  function CollapsibleTrigger({ children, className }: { ... }) {
    const { open, onOpenChange } = R.useContext(CollapsibleCtx)
    return (
      <button type="button" data-testid="collapsible-trigger" className={className}
              onClick={() => onOpenChange(!open)}>
        {children}
      </button>
    )
  }

  function CollapsibleContent({ children }: { children: R.ReactNode }) {
    return <div data-testid="collapsible-content">{children}</div>
  }

  return { Collapsible, CollapsibleTrigger, CollapsibleContent }
})
```

Key points:
- `require('react')` is needed because ES imports are not available inside hoisted mock factories.
- The context is created once per mock module evaluation, shared between all three mock components.
- `data-open={open}` on the `Collapsible` div lets tests assert open/closed state.
- `CollapsibleContent` always renders children (no conditional gate) — we test the component's
  state logic, not Base UI's animation.
- When querying list-row buttons that share text with the trigger (selected state), query within
  `screen.getByTestId('collapsible-content')` to avoid `getByRole` ambiguity errors.


### Testing formatTimeAgo (text split across DOM nodes)
When a time string appears inside a paragraph alongside other text nodes, use a function
matcher instead of `getByText(string)`:
```ts
screen.getByText((_, element) => {
  return element?.tagName === 'P' && (element.textContent ?? '').includes(dateString)
})
```

### Mocking @/lib/supabase-rpc (rpc + upsert)
```ts
const { mockRpc, mockUpsert } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockUpsert: vi.fn(),
}))
vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
  upsert: mockUpsert,
}))
```

### Mocking next/navigation with useSearchParams (2026-04-03)
When testing components that use both `useRouter` and `useSearchParams`, mock both together.
`useSearchParams()` returns a URLSearchParams-like object — mock its `.toString()` method to
control the current param string, and reset it in `beforeEach`:
```ts
const mockRouterReplace = vi.fn()
const mockSearchParamsToString = vi.fn().mockReturnValue('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => ({ toString: mockSearchParamsToString }),
}))

beforeEach(() => {
  vi.resetAllMocks()
  mockSearchParamsToString.mockReturnValue('')
})
```
Use `mockRouterReplace` (not `push`) when the component calls `router.replace()`.

When asserting URL navigation calls, remember that `page=1` is omitted from the URL
(the component deletes the param) — navigating to page 1 produces `?` or `?otherParam=x`,
not `?page=1`.

### Extending .test.ts to .test.tsx for JSX
When an existing `.test.ts` file needs RTL component tests added, replace it with a
`.test.tsx` file containing the original logic plus the new RTL tests. Delete the old
`.test.ts` to avoid duplicate test file conflicts. The vitest config `include` glob
covers both extensions.

### Mocking lucide-react icons in RTL tests
SVG transforms can fail in jsdom. Stub icon components with simple span elements:
```tsx
vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
}))
```
Add only the icons actually imported by the component under test.

### Testing 'use server' actions with .select().eq().order() chain (2026-03-13)
For actions that end the chain with `.order()` (not `.returns()`), mock with a plain object
where `order` is an async mock (not `.mockReturnThis()`):
```ts
function buildSelectChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  }
}
mockFrom.mockReturnValue(buildSelectChain({ data: [...rows], error: null }))
```
This pattern is used in `load-draft.test.ts` for `loadDrafts()`.

### Testing generation-ref stale-async guards in hooks (2026-03-13)
When a hook uses `useRef` + generation counter to discard stale async results, test it with
a manually-controlled deferred promise:

```ts
// 1. Create a deferred promise for the "slow" (stale) call
let resolveSlowFetch!: (v: ResultType) => void
const slowPromise = new Promise<ResultType>((res) => { resolveSlowFetch = res })

// 2. Wire mocks: first call is slow, second is fast
mockFetchFn
  .mockImplementationOnce(() => slowPromise)
  .mockResolvedValueOnce(FAST_RESULT)

const { result } = renderHook(() => useHook())

// 3. Fire the slow (first) call — do NOT await act
act(() => { result.current.handleChange(SLOW_VALUE) })

// 4. Fire the fast (second) call — await it so it fully settles
await act(async () => { result.current.handleChange(FAST_VALUE) })

// 5. Assert state reflects the fast result
expect(result.current.state).toEqual(FAST_RESULT)

// 6. Resolve the slow call — stale, must not change state
await act(async () => { resolveSlowFetch(STALE_RESULT) })

// 7. State must still reflect the fast result
expect(result.current.state).toEqual(FAST_RESULT)
```

Key: the non-awaited `act(() => {...})` starts the transition but does not flush the async
mock. The awaited second `act` resolves and bumps the generation ref. When the slow promise
finally resolves, `gen !== generation.current` so the state setter is skipped.

### Testing type-guard fallback paths (2026-03-13)
When production code has a runtime type guard that falls back to a safe value on failure,
test all rejection branches (null, wrong type, missing required field) plus the happy path:
```ts
// null → rejected by isSessionConfig
buildDraftRow({ session_config: null })
// non-object → rejected
buildDraftRow({ session_config: 'malformed-string' })
// object missing required field → rejected
buildDraftRow({ session_config: { subjectName: 'Nav' } })
// valid → passes through
buildDraftRow({ session_config: { sessionId: 'sess-abc', subjectName: 'Nav' } })
```
Always spy on `console.error` in the guard-failure tests and restore it after.

### Mocking @/lib/queries/* functions
```ts
const { mockGetRandomQuestionIds } = vi.hoisted(() => ({
  mockGetRandomQuestionIds: vi.fn(),
}))
vi.mock('@/lib/queries/quiz', () => ({
  getRandomQuestionIds: mockGetRandomQuestionIds,
}))
```

---

## Files tested in Phase 4

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/_components/login-form.tsx` | `login-form.test.tsx` | Client component, Zod validation + OTP |
| `apps/web/app/app/_components/sign-out-button.tsx` | `sign-out-button.test.tsx` | Client component, signOut + router |
| `apps/web/app/auth/callback/route.ts` | `route.test.ts` | Route handler, 4 branches |
| `apps/web/app/auth/verify/page.tsx` | `page.test.tsx` | Async server component, 3 error codes |
| `apps/web/proxy.ts` | `proxy.test.ts` | Middleware, 5 redirect/passthrough cases |
| `packages/db/src/middleware.ts` | `middleware.test.ts` | Supabase client factory, env var guards |

## Files tested in Phase 5

| Source file | Test file | Notes |
|---|---|---|
| `packages/db/src/fsrs.ts` | `fsrs.test.ts` | Pure logic; `ratingFromAnswer`, `stateToString`, `dbRowToCard`, `scheduleCard` |
| `apps/web/lib/supabase-rpc.ts` | `supabase-rpc.test.ts` | `rpc()` and `upsert()` wrappers with fake client |
| `apps/web/lib/queries/quiz.ts` | `queries/quiz.test.ts` | `getSubjectsWithCounts`, `getTopicsForSubject`, `getRandomQuestionIds` |
| `apps/web/lib/queries/review.ts` | `queries/review.test.ts` | `getDueCards`, `getNewQuestionIds` |
| `apps/web/lib/queries/dashboard.ts` | `queries/dashboard.test.ts` | `getDashboardData`, auth guard, aggregation |
| `apps/web/lib/queries/progress.ts` | `queries/progress.test.ts` | `getProgressData`, topic breakdown, mastery calc |
| `apps/web/app/app/quiz/actions.ts` | `quiz/actions.test.ts` | `startQuizSession`, `submitQuizAnswer`, `completeQuiz` |
| `apps/web/app/app/review/actions.ts` | `review/actions.test.ts` | `startReviewSession`, `submitReviewAnswer`, `completeReviewSession` |
| `apps/web/app/app/review/session/_components/load-questions.ts` | `load-questions.test.ts` | `loadSessionQuestions`, ordering, error paths |
| `apps/web/app/app/_components/answer-options.tsx` | `answer-options.test.tsx` | Client component; selection, submit, correct/wrong styling |
| `apps/web/app/app/_components/feedback-panel.tsx` | `feedback-panel.test.tsx` | Conditional text, image, onNext callback |
| `apps/web/app/app/_components/session-summary.tsx` | `session-summary.test.tsx` | Score display, mode label, links |
| `apps/web/app/app/dashboard/_components/due-reviews-banner.tsx` | `due-reviews-banner.test.tsx` | Zero state, singular/plural, link |
| `apps/web/app/app/dashboard/_components/recent-sessions.tsx` | `recent-sessions.test.tsx` | `formatTimeAgo` all branches, score display |
| `apps/web/app/app/progress/_components/subject-breakdown.tsx` | `subject-breakdown.test.tsx` | Expand/collapse toggle, topic details |

## Files tested in commit 1f3bd0b

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/session/_components/quiz-session-loader.tsx` | `quiz-session-loader.test.tsx` | Client component; sessionStorage read, redirect, loading/error/success states |
| `apps/web/app/app/review/session/_components/review-session-loader.tsx` | `review-session-loader.test.tsx` | Same pattern; review-specific storage key + redirect |

### Module-level cache in session loaders (Strict Mode survival)
Both loaders use a module-level `cachedSession` variable to survive React Strict Mode double-mount.
This is NOT exported, so it cannot be reset between tests. **Strategy:**
- Put the "redirect when no session" test FIRST — module cache is null on fresh load
- Later tests that set sessionStorage data will re-populate the cache, but that's OK since
  sessionStorage takes priority (`raw ? JSON.parse(raw) : cachedSession`)
- Document the ordering dependency with a clear comment in the test file

### Mocking child session components
```tsx
vi.mock('./quiz-session', () => ({
  QuizSession: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="quiz-session">{sessionId}</div>
  ),
}))
```
Pass through key props so tests can assert on them (e.g., `screen.getByText(sessionId)`).

### Asserting RPC argument shapes after signature changes (2026-03-16)

When an RPC gains a new parameter (e.g., `p_session_id` added to `get_report_correct_options`),
always add a test that calls `expect(mockRpc).toHaveBeenCalledWith(rpcName, { ...allArgs })`.
This catches silent regressions where a new required arg is dropped from the call site.
Pair it with a test that passes options with the field being projected out and asserts via
`not.toHaveProperty()` that the stripped field is absent from the output:

```ts
it('forwards sessionId as p_session_id when calling the correct-options RPC', async () => {
  // arrange mocks ...
  await getQuizReport('sess-1')
  expect(mockRpc).toHaveBeenCalledWith('get_report_correct_options', {
    p_session_id: 'sess-1',
    p_question_ids: ['q1', 'q2'],
  })
})

it('strips the correct field from options so it is never exposed', async () => {
  const questionsWithCorrectField = [{
    id: 'q1',
    options: [{ id: 'opt-a', text: 'Upward force', correct: true }],
    // ...
  }]
  // arrange, call, then:
  expect(options[0]).not.toHaveProperty('correct')
})
```

Rule: whenever a production function projects a DB/RPC result shape, the test fixture MUST
include the fields being projected out — otherwise the projection code is untested.

---

## Integration test pattern: BEFORE UPDATE trigger

Triggers raise a Postgres EXCEPTION, which PostgREST surfaces as `{ error: { message: '...' } }`
(unlike RLS silent-block, which returns success with 0 affected rows). Test both the block
and the service-role bypass in the same file:

```ts
// Block path — error must be non-null and message must match trigger text
const { error } = await studentClient.from('users').update({ role: 'admin' }).eq('id', id)
expect(error).not.toBeNull()
expect(error?.message).toMatch(/Cannot modify role column/i)

// Verify unchanged via admin client (not trusted client)
const { data } = await admin.from('users').select('role').eq('id', id).single()
expect(data?.role).toBe('student')

// Service-role bypass — must succeed (error is null)
const { error: adminErr } = await admin.from('users').update({ role: 'instructor' }).eq('id', id)
expect(adminErr).toBeNull()
```

Key differences from RLS immutability tests:
- Trigger exceptions ARE returned as errors — assert `error` is non-null and check message
- RLS silent-block tests assert data is unchanged; trigger tests assert BOTH error AND data
- Service-role bypass tests run after block tests and restore state in the same `it` block

File: `packages/db/src/__integration__/trigger-protect-users-columns.integration.test.ts` (added 2026-03-16)

### useRouter with replace (not push)
Navigation-away patterns use `router.replace`, not `router.push`. Mock accordingly:
```ts
const mockRouterReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}))
```

### Testing "never resolves" loading state
```ts
mockLoadSessionQuestions.mockReturnValue(new Promise(() => {}))
// then assert synchronously — no need for waitFor
expect(screen.getByText('Loading questions...')).toBeInTheDocument()
```

---

### Testing keyboard a11y on table rows (onKeyDown handler, 2026-03-23)

When a `<tr>` has `tabIndex={0}` + `onKeyDown` to handle Enter/Space navigation, use
`userEvent.keyboard` after `row.focus()`. The row element itself must be focused first —
`userEvent.click` triggers `onClick`, not `onKeyDown`.

```tsx
it('navigates when Enter is pressed on a row', async () => {
  const user = userEvent.setup()
  render(<SessionTable sessions={[makeSession({ id: 'row-1' })]} />)
  const row = screen.getAllByRole('row')[1] // index 0 is the header row
  row.focus()
  await user.keyboard('{Enter}')
  expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/report?session=row-1')
})

it('navigates when Space is pressed on a row', async () => {
  const user = userEvent.setup()
  // ...
  await user.keyboard(' ')
  expect(mockRouterPush).toHaveBeenCalledWith(...)
})

it('does not navigate for unrelated keys', async () => {
  // ...
  await user.keyboard('{Tab}')
  expect(mockRouterPush).not.toHaveBeenCalled()
})
```

Note: `screen.getAllByRole('row')[0]` is the header row; data rows start at index 1.
Also mock `next/link` when the component uses `<Link>` — otherwise JSDOM renders it
as a custom element and `<a href>` assertions fail.

---

## Files tested in commit feat/178-quiz-results-redesign (2026-03-21)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/report/_components/score-ring.tsx` | `score-ring.test.tsx` | Pure SVG component; color thresholds, size prop, geometry |
| `apps/web/app/app/quiz/report/_components/result-summary.tsx` | `result-summary.test.tsx` | Presenter with formatDuration/formatDate logic; null fallbacks |
| `apps/web/app/app/quiz/report/_components/question-breakdown.tsx` | `question-breakdown.test.tsx` | Client component; pagination toggle, PAGE_SIZE boundary |

## Files tested in CodeRabbit/SonarCloud fix commit (2026-03-23)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/reports/_components/session-table.tsx` | `session-table.test.tsx` | `<tr>` click + keyboard a11y (Enter/Space), score color, null score em-dash, mode label fallback |

### Testing SVG components (score-ring pattern, 2026-03-21)
SVG elements rendered in jsdom are queryable via `container.querySelectorAll`. Use index
to distinguish the track circle (index 0) from the progress circle (index 1):
```tsx
const { container } = render(<ScoreRing percentage={70} />)
const circles = container.querySelectorAll('circle')
const progressCircle = circles[1]
expect(progressCircle?.getAttribute('stroke')).toBe('#22C55E')
```
For the `role="img"` + `aria-label` pattern, use `screen.getByRole('img', { name: '...' })`.

### Testing color threshold boundaries
Always test at the boundary value itself (e.g., exactly 70%, exactly 50%, exactly 49%)
rather than just above/below. This catches off-by-one errors in `>= vs >` comparisons:
```tsx
// Score >= 70 → green
render(<ScoreRing percentage={70} />)   // at threshold
render(<ScoreRing percentage={95} />)   // above threshold

// Score >= 50 and < 70 → amber
render(<ScoreRing percentage={50} />)   // at lower threshold
render(<ScoreRing percentage={69} />)   // at upper threshold - 1

// Score < 50 → red
render(<ScoreRing percentage={49} />)   // at upper threshold - 1
render(<ScoreRing percentage={0} />)    // minimum
```

### Testing expand/collapse (client component pagination)
When a list component has a show-more toggle backed by `useState`, stub child rows with
a `data-testid` so you can count visible rows without rendering child internals:
```tsx
vi.mock('./report-question-row', () => ({
  ReportQuestionRow: ({ index }: { index: number }) => (
    <div data-testid={`question-row-${index}`} />
  ),
}))
// then assert:
expect(screen.queryByTestId('question-row-5')).not.toBeInTheDocument()
```
Test the boundary (PAGE_SIZE=5, total=5 → no button; total=6 → button appears).
Use `userEvent.setup()` for toggle interaction tests — avoids `act()` wrapping.

### Testing date/time formatting functions embedded in presenters
When a component formats dates with `toLocaleDateString`, assert on a partial substring
(e.g., `/Mar 2026/`) rather than the full locale string. This avoids CI locale mismatch:
```tsx
expect(screen.getAllByText(/Mar 2026/).length).toBeGreaterThan(0)
```
For duration formatting, assert the exact string when the output is locale-independent
(e.g., `'3m 30s'`, `'45s'`, `'—'`).

## Files tested in commit 481ea3a (dark mode)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/_components/theme-provider.tsx` | `theme-provider.test.tsx` | Thin wrapper; assert on props forwarded to NextThemesProvider |
| `apps/web/app/app/_components/theme-toggle.tsx` | `theme-toggle.test.tsx` | Client component; icon switching, click handler, no-call on mount |

### Mocking next-themes (ThemeProvider and useTheme)
```ts
// For ThemeProvider wrapper tests — capture props via mock.calls[0][0]
const { mockNextThemesProvider } = vi.hoisted(() => ({
  mockNextThemesProvider: vi.fn(),
}))
vi.mock('next-themes', () => ({
  ThemeProvider: mockNextThemesProvider,
}))
// Assert props directly from the first call instead of toHaveBeenCalledWith + expect.anything()
// (React 19 passes props as a single argument, no second ref arg)
const [receivedProps] = mockNextThemesProvider.mock.calls[0]
expect(receivedProps).toMatchObject({ attribute: 'class' })

// For useTheme hook tests — control theme value
const { mockSetTheme, mockUseTheme } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockUseTheme: vi.fn(),
}))
vi.mock('next-themes', () => ({ useTheme: mockUseTheme }))
mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme })
```

### userEvent with delay:null (avoids fake-timer conflicts)
When tests don't need fake timers, always set up userEvent with `delay: null` to prevent
potential timer-related timeouts in vitest:
```ts
const user = userEvent.setup({ delay: null })
render(<Component />)
await user.click(screen.getByRole('button', { name: /label/i }))
```

## Files tested in commit 157f421 (post-sprint-3-polish)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/actions/discard.ts` | `discard.test.ts` | New server action; auth, Zod validation, session soft-delete, draft cleanup (non-fatal), uncaught error |
| `apps/web/lib/queries/reports.ts` | `reports.test.ts` | Extended: added `answersResult.error` throws, `answeredCount` fallback to `correct_count` |
| `apps/web/lib/queries/quiz.ts` | `quiz.test.ts` | Extended: `filterIncorrect` empty-pool early return — verifies fsrs_cards is NOT queried |

### Testing non-fatal error paths in server actions
When a sub-operation error is explicitly non-fatal (logged but not returned), verify two things:
1. The action still returns `{ success: true }` despite the error
2. The DB mock for the failing table returns `{ error: { message: '...' } }`

This is different from testing a fatal error path where you assert `{ success: false }`.

### Asserting a DB table was NOT called
Use `mockFrom.mock.calls.map(c => c[0])` to extract called table names and assert with
`expect(tablesCalled).not.toContain('table_name')`:
```ts
const tablesCalled = mockFrom.mock.calls.map((c: unknown[]) => c[0])
expect(tablesCalled).not.toContain('quiz_drafts')
```
This is the right way to assert a guarded early-return prevents an unnecessary DB query.

### Mount guard (useState + useEffect) — not testable via fake timers in jsdom
Components that show a placeholder div until `mounted` becomes true (SSR hydration guard)
cannot have their pre-mount state reliably tested in jsdom because `@testing-library/react`
wraps `render()` in `act()` which flushes all effects synchronously.
Skip the pre-mount branch and only test the post-mount behaviour.

## Files tested in commit fb1f92a (Playwright E2E setup)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/e2e/helpers/mailpit.ts` | `mailpit.test.ts` | Pure `extractMagicLink` + mocked fetch for retry loop and timeout |
| `apps/web/e2e/helpers/supabase.ts` | `supabase.test.ts` | `ensureTestUser` all branches; `getAdminClient` config check |

### Vitest alias for @supabase/supabase-js in apps/web
The e2e helpers import `@supabase/supabase-js` directly, but it's not a direct dep of apps/web.
Fix: add a resolve alias in `apps/web/vitest.config.ts` pointing to packages/db symlink:
```ts
'@supabase/supabase-js': path.resolve(__dirname, '../../packages/db/node_modules/@supabase/supabase-js')
```
This is in the config now. Do NOT remove it.

### Avoid unhandledRejection warning in timeout tests with fake timers
When testing that a long-running async function throws after a timeout, attach the
`.rejects` assertion BEFORE advancing the timers:
```ts
const promise = someFn()
// Attach rejection handler first — avoids Node's unhandledRejection warning
const expectation = expect(promise).rejects.toThrow('expected message')
await vi.advanceTimersByTimeAsync(10_500)
await expectation
```
If `.rejects` is attached AFTER `advanceTimersByTimeAsync`, the promise may reject before
the handler is attached, firing `unhandledRejection` and causing Vitest to report an error
even though the test assertion ultimately passes.

### Response body can only be read once — use mockImplementation, not mockResolvedValue
When a mocked `fetch` will be called multiple times (e.g., retry loops), always use
`mockImplementation(() => new Response(...))` to create a fresh Response per call.
`mockResolvedValue(new Response(...))` shares ONE Response instance whose body stream
gets consumed on the first `.json()` call, causing "Body has already been read" on
subsequent calls.

## Files tested in CSP tightening commit

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/next.config.ts` | `next.config.test.ts` | CSP dev/prod split; `vi.stubEnv` + `vi.resetModules` + dynamic import |

## Files extended in allowLocal commit

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/next.config.ts` | `next.config.test.ts` | Added 6 tests for `allowLocal` (isLocalSupabase); total 18 tests |

### Passing extra env vars to the loadConfig helper
When a module-level constant depends on multiple env vars (e.g., both `NODE_ENV` and
`NEXT_PUBLIC_SUPABASE_URL`), extend the `loadConfig` helper with an `extraEnv` map:

```ts
async function loadConfig(nodeEnv: string, extraEnv: Record<string, string> = {}) {
  vi.stubEnv('NODE_ENV', nodeEnv)
  for (const [key, value] of Object.entries(extraEnv)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  const mod = await import('./next.config')
  return mod.default
}
```

Then call `getCspForEnv('production', { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' })`.

### Testing "env var not set" (vs env var set to empty string)
Use `delete process.env.KEY` rather than `vi.stubEnv('KEY', '')` to simulate a truly absent
env var. `vi.stubEnv` always stores a string, so `startsWith` on `undefined` would throw —
the source uses optional chaining (`process.env.KEY?.startsWith(...)`) which returns `undefined`
(falsy) when the var is missing. Deleting the key lets that optional chain evaluate correctly.

### Thin delegating hook — extend parent hook's test file, not a new file (2026-03-13)
When a new hook is a pure delegate (every function body is a single `return handleXxx(...)` call
into a shared helper) and the parent hook already has a test file with matching mocks, extend
the parent's test file rather than creating a new co-located test file. Reasons:
1. All mocks are already wired — no duplication of `vi.hoisted` + `vi.mock` scaffolding.
2. The hook is only useful via its parent; testing in isolation would require re-wiring the same
   deps with no additional coverage signal.
3. Keeps the mock surface in one place — changes to the quiz-submit helpers only require
   updating one mock.

Decision applied: `use-quiz-submit.ts` coverage extended in `use-quiz-state.test.ts` (not a
new `use-quiz-submit.test.ts`).

## Files extended in eb67cc8 (post-sprint-3-polish hook split)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/session/_hooks/use-quiz-submit.ts` | `use-quiz-state.test.ts` | Thin delegate; coverage extended in parent hook's test file. Added handleDiscard (3 tests) + showFinishDialog (3 tests). Total: 26 tests. |

### Testing UI orchestrator handlers (setSubmitting / setError pattern)
Handlers that coordinate state callbacks (`setSubmitting`, `setError`, `onSuccess`) and a
router should be tested with inline `vi.fn()` mocks — do NOT render a component. Pass them
in an options object and assert on the mock call history:

```ts
function makeOpts(overrides?: Partial<Parameters<typeof handleFoo>[0]>) {
  return {
    sessionId: SESSION_ID,
    router: makeRouter() as never,
    setSubmitting: vi.fn(),
    setError: vi.fn(),
    onSuccess: vi.fn(),
    ...overrides,
  }
}

it('sets error and returns early when precondition fails', async () => {
  const opts = makeOpts({ answers: new Map() })
  await handleFoo(opts)
  expect(opts.setError).toHaveBeenCalledWith('expected message')
  expect(opts.setSubmitting).not.toHaveBeenCalled()
})
```

Key assertions to cover per handler:
1. Happy path: `onSuccess` / `router.push` called, error not set
2. Guard clause: early return with `setError`, downstream action NOT called
3. Failure path: `setError` set, `setSubmitting(false)` reset
4. Ordering: `setSubmitting(true)` and `setError(null)` fire BEFORE the action call

## Files extended in commit 274821b (isCheckAnswerRpcResult type guard)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/actions/check-answer.ts` | `check-answer.test.ts` | Extended: 7 new tests covering `isCheckAnswerRpcResult` guard — non-null primitive, missing field, wrong-type fields for all 4 shape properties. Total: 22 tests. |

### Testing runtime type guards in server actions (2026-03-13)
When a server action upgrades from a falsy check (`!data`) to a structural type guard
(`!isTypeGuard(data)`), add tests for every shape variant the guard rejects that the old
falsy check would have silently passed through:

1. Non-null primitive (e.g., `data: 'unexpected-string'`) — guard rejects at `typeof !== 'object'`
2. Missing required field (e.g., omit `is_correct`) — guard rejects on the field check
3. Wrong type on a boolean field (e.g., `is_correct: 'true'` instead of `boolean`) — guard rejects
4. Null where a string is required (e.g., `correct_option_id: null`) — guard rejects
5. Wrong type on a nullable string field (e.g., `explanation_text: 42`) — guard rejects

All these cases should return `{ success: false, error: '<contextual message>' }`.
Spy on `console.error` and restore it to keep test output clean, since the action logs
the rejection:

```ts
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const result = await checkAnswer({ ... })
consoleSpy.mockRestore()
expect(result.success).toBe(false)
```

### Stale test description after source logic changes
When a source change alters a fallback value (e.g., `?? s.correct_count` → `?? s.total_questions`),
update the corresponding test description to match. A passing test with a wrong description
is misleading. Example: "falls back to correct_count" → "falls back to total_questions".

## Files extended in commit 028fc09 (Zod validation + handler extraction)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/actions/lookup.ts` | `lookup.test.ts` | Extended: added 4 Zod rejection tests for `fetchTopicsForSubject` and `fetchSubtopicsForTopic` (null + non-UUID) |
| `apps/web/app/app/quiz/session/_hooks/quiz-submit.ts` | `quiz-submit.test.ts` | Extended: added `discardQuiz` mock + 14 tests across `handleSubmitSession`, `handleSaveSession`, `handleDiscardSession` |
| `apps/web/lib/queries/reports.ts` | `reports.test.ts` | Fixed stale description: "falls back to correct_count" → "falls back to total_questions" |

## Files written/extended in commit 306f44a (session ownership + error recovery)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/session/_hooks/use-answer-handler.ts` | `use-answer-handler.test.ts` | New file. 12 tests: happy path, lock guard, error recovery (revert + lock release), multi-question feedback isolation |
| `apps/web/app/app/quiz/actions/lookup.ts` | `lookup.test.ts` | Extended: 2 new tests for `OptionalUuid` preprocessor — empty string coerced to absent for both `topicId` and `subtopicId` |

### Testing a hook that manages its own answers Map externally
When a hook accepts `answers` + `setAnswers` as props (rather than owning the state itself),
drive the external state manually using a closure variable and a `vi.fn()` setter that
applies the updater function to it:

```ts
let answers = new Map<string, DraftAnswer>()
const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
  answers = updater(answers)
})
const { result } = renderHook(() =>
  useAnswerHandler({ ..., answers, setAnswers: setAnswers as React.Dispatch<...> }),
)
// Then inspect answers directly to assert map mutations
```

This simulates the React setState model without needing a wrapper component.

### Verifying ref lock release after error (retry pattern)
To assert a ref-based lock is released after failure so the same question can be answered again:
1. Mock the action to reject once, then resolve on second call
2. Assert `checkAnswer` was called twice
3. Assert the answer is stored after the second call
Do not try to inspect `lockedRef` directly — it's an implementation detail. Test the observable
behaviour: can the user retry?

### OptionalUuid preprocessor — empty string treated as absent
The `OptionalUuid = z.preprocess(v => v === '' ? undefined : v, z.string().uuid().optional())`
pattern means `''` is valid (coerced to absent) while `'bad-id'` is invalid (Zod throws).
Test both sides: empty string must NOT throw and must produce the same result as omitting
the field entirely.

### Testing module-level constants that depend on NODE_ENV
When a module evaluates `process.env.NODE_ENV` at the top level (not inside a function),
`vi.stubEnv` alone is not enough — the value is already captured. Use this pattern to
test both branches:

```ts
async function loadConfig(nodeEnv: string) {
  vi.stubEnv('NODE_ENV', nodeEnv)
  vi.resetModules()
  const mod = await import('./next.config')
  return mod.default
}
```

Call `vi.resetModules()` in `beforeEach` and `vi.unstubAllEnvs()` + `vi.resetModules()`
in `afterEach` so each test gets a fresh module load.

Dynamic `import()` after `resetModules()` forces Node to re-evaluate the module, picking
up the newly stubbed env value.

### Testing concurrent async race conditions (ref lock / double-click guard)
When a `useRef` lock is added to block concurrent calls before async state settles,
test it by firing two calls without awaiting between them inside a single `act()`:

```ts
// Deferred promise — lets us control when the first call resolves
let resolveFirst: (() => void) | null = null
mockCheckAnswer.mockImplementationOnce(
  () =>
    new Promise<ReturnType>((resolve) => {
      resolveFirst = () => resolve({ success: true, ... })
    }),
)

await act(async () => {
  const p1 = result.current.handleSelectAnswer('opt-a')
  const p2 = result.current.handleSelectAnswer('opt-b')  // fired before p1 resolves
  resolveFirst?.()
  await Promise.all([p1, p2])
})

expect(mockCheckAnswer).toHaveBeenCalledTimes(1)  // ref lock dropped p2
expect(result.current.existingAnswer?.selectedOptionId).toBe('opt-a')
```

Key points:
- Use `mockImplementationOnce` with a deferred promise so p2 fires while p1 is still pending
- Both calls go inside a single `act()` wrapper so React state is flushed together
- Assert on `toHaveBeenCalledTimes(1)` to prove the downstream call was blocked, not just
  that state is correct (state correctness alone would pass even without the ref lock once
  the state-based guard fires on the second call)
- This pattern distinguishes the ref lock (fires synchronously, before state) from the
  state-based guard (fires after the first `setState` re-render)

## Files extended in commit eb67cc8 (lockedQuestionsRef)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts` | `use-quiz-state.test.ts` | Extended: added concurrent double-click test for `lockedQuestionsRef` race guard |

## Files extended in commit a0d9973 (Array.isArray guard)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/actions/check-answer.ts` | `check-answer.test.ts` | Extended: 3 new tests for `Array.isArray(qIds)` guard — null, plain string, and null config |
| `apps/web/app/app/quiz/actions/fetch-explanation.ts` | `fetch-explanation.test.ts` | Extended: same 3 guard tests mirrored for fetch-explanation |

### Existing tests did NOT cover the new Array.isArray guard
The original tests for `question_ids` membership only tested the `.includes()` branch
(wrong question ID in a valid array). The `Array.isArray()` guard that fires when the field
is null, a string, or when config itself is null was completely uncovered.

**Rule:** whenever a type-narrowing guard is added to a production file (e.g., replacing
`config.question_ids.includes()` with `Array.isArray(qIds) || qIds.includes()`), always
ask: does the test suite exercise the case where the guard's early-return fires?
Typically the answer is no — the original tests only exercise the "valid input" path
through the guard.

### use-answer-handler reactive lock clearing (useEffect path) — behavior-tested, not structural
The `useEffect([answers])` that clears `lockedRef.current` for keys absent from `answers`
is tested via the retry-after-error test: mock rejects once → user can retry → `checkAnswer`
called twice. This proves the lock is cleared. Do NOT add a test that inspects
`lockedRef.current` directly — that is an implementation detail. Behavior proof is sufficient.

---

## Files tested in commits 044542f + d183a8c (CSP + security fixes)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/proxy.ts` | `proxy.test.ts` | Added 2 tests: cookie forwarding on both redirect branches |

### Asserting cookies on a NextResponse redirect
`NextResponse.redirect()` returns a real `Response`. Cookies set via
`redirect.cookies.set()` appear as a `set-cookie` header string:
```ts
const response = await proxy(makeRequest('/app/dashboard'))
expect(response.status).toBe(307)
const setCookie = response.headers.get('set-cookie') ?? ''
expect(setCookie).toContain('sb-token=refreshed')
```
The mock session response must already expose `cookies.getAll()` returning the
expected cookie array (already present in `MOCK_SESSION_RESPONSE`). No extra mock
changes are needed — just assert on the `set-cookie` header of the returned redirect.

---

## Files tested in commit f272e2b (CodeRabbit fix plan batches 1-6)

All source changes in this commit were already covered by tests shipped in the same commit.
No new test files needed. Suite: 34 files, 281 tests (apps/web) + 2 files, 22 tests (packages/db) — all green.

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/lib/fsrs/update-card.ts` | `lib/fsrs/update-card.test.ts` | 9 tests; try/catch upsert failure logged via console.error (new in this commit) |
| `apps/web/e2e/helpers/mailpit.ts` | `e2e/helpers/mailpit.test.ts` | Deadline-based polling already covered by existing timeout + retry tests |

### Testing try/catch logging in async functions
When a source adds `try { await sideEffect() } catch (err) { console.error(...) }`, verify with:
```ts
it('logs an error when the upsert call fails', async () => {
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockUpsert.mockRejectedValue(new Error('connection timeout'))
  // ... set up rest of call ...
  await updateFsrsCard(supabase as never, 'user-1', 'question-1', true)
  expect(consoleSpy).toHaveBeenCalledWith('FSRS card upsert failed:', expect.any(Error))
  consoleSpy.mockRestore()
})
```
The function must NOT re-throw — assert it resolves normally even after the rejection.

---

## Files tested in PKCE cookie-preservation commit (proxy.ts)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/proxy.ts` | `proxy.test.ts` | Added 2 tests: PKCE redirect destination + cookie forwarding on PKCE branch |

### PKCE branch test notes
The PKCE redirect (`/?code=<token>` → `/auth/callback?code=<token>`) runs BEFORE the auth guard,
so `getUser` result is irrelevant — mock it to return `null` to keep the test minimal.
Assert both the redirect destination (`pathname` + `searchParams.get('code')`) and the
`set-cookie` header to verify cookie forwarding.

---

## Files tested in previous commit (FSRS module extraction)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/lib/fsrs/update-card.ts` | `lib/fsrs/update-card.test.ts` | Shared FSRS upsert logic; 8 tests covering happy path, existing vs new card, error paths |

### Testing async functions that take a Supabase client argument
When the function under test accepts a Supabase client parameter, build a fake
client with `vi.fn()` chains rather than mocking the module:
```ts
function buildSupabaseChain(maybeSingleReturn: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    returns: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(maybeSingleReturn),
  }
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain, // expose for assertions
  }
}
```
Cast the fake as `never` to satisfy the `SupabaseClient` type: `updateFsrsCard(supabase as never, ...)`.
Assert on `supabase.from` and `supabase._chain.eq` calls to verify correct table + filter values.

### Mocking @repo/db/fsrs helpers
```ts
vi.mock('@repo/db/fsrs', () => ({
  createEmptyCard: (...args: unknown[]) => mockCreateEmptyCard(...args),
  dbRowToCard: (...args: unknown[]) => mockDbRowToCard(...args),
  ratingFromAnswer: (...args: unknown[]) => mockRatingFromAnswer(...args),
  scheduleCard: (...args: unknown[]) => mockScheduleCard(...args),
  stateToString: (...args: unknown[]) => mockStateToString(...args),
}))
```
Use plain `vi.fn()` (not `vi.hoisted`) for these since they are not referenced inside a `vi.mock()` factory.

### Asserting upsert arguments by position
```ts
const [, table, values, opts] = mockUpsert.mock.calls[0]!
expect(table).toBe('fsrs_cards')
expect(values.student_id).toBe('user-42')
expect(opts).toEqual({ onConflict: 'student_id,question_id' })
```
`upsert(supabase, table, values, opts)` — first arg is the client, index 0; table is index 1.

### Early-return / skip-upsert test for DB errors
```ts
it('returns early without calling upsert when maybeSingle returns an error', async () => {
  const supabase = buildSupabaseChain({
    data: null,
    error: { message: 'permission denied for table fsrs_cards' },
  })
  await updateFsrsCard(supabase as never, 'user-1', 'question-1', true)
  expect(mockUpsert).not.toHaveBeenCalled()
  expect(mockScheduleCard).not.toHaveBeenCalled()
})
```
The `console.error` in stderr is EXPECTED — it confirms the catch branch ran.

---

## Files tested in commits dd94991..44a0baf (cookie fix + E2E hardening)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/e2e/helpers/supabase.ts` | `supabase.test.ts` | Added test for new `listError` throw branch in `ensureTestUser` |
| `apps/web/e2e/helpers/mailpit.ts` | `mailpit.test.ts` | Added test for `getMessage` non-OK status path (404 from detail endpoint) |

## E2E Test Structure Pattern (NEW from commit f272e2b)

When writing Playwright specs, use numbered sections with clear comments to guide reader through user flow:

```ts
// apps/web/e2e/review-flow.spec.ts — PATTERN
test('review flow: start review → answer questions → view results → dashboard', async ({ page }) => {
  // 1. Navigate to review page
  await page.goto('/app/review')

  // 2. Start session
  await page.click('button:has-text("Start Review")')

  // 3. Answer questions
  for (let i = 0; i < 2; i++) {
    // locate + interact
  }

  // 4. View results
  await expect(page.getByRole('heading', { name: /results/i })).toBeVisible()
})
```

Benefits: reader immediately sees user journey; easy to add variations (e.g., "answer 5 questions instead of 2").

## Mock Lifecycle Pattern (STANDARDIZED from commit f272e2b)

**Rule**: Use `vi.resetAllMocks()` instead of `vi.clearAllMocks()`.

- `clearAllMocks()` — clears call history only; implementations stay mocked
- `resetAllMocks()` — clears history AND resets implementations to default `vi.fn()`

Better isolation: each test starts with fully clean mocks.

```ts
// ❌ OLD PATTERN
beforeEach(() => {
  vi.clearAllMocks()
})

// ✅ NEW PATTERN
beforeEach(() => {
  vi.resetAllMocks()
})
```

Applied in: quiz/actions.test.ts, review/actions.test.ts, queries/dashboard.test.ts (commit dd0fbea onwards).

### Extending MockClientOptions to carry an `error` field on listUsers
When a Supabase admin method mock needs to return both `data` and `error`, add both
fields to the options type. The default (no error) simply omits the field — `undefined`
is falsy so existing tests are unaffected:
```ts
listUsers?: {
  data: { users: Array<...> } | null
  error?: { message: string } | null
}
```
Then the mock builder passes the whole object as the resolved value:
```ts
listUsers: vi.fn().mockResolvedValue(listUsers),
```
The source code destructures `{ data: existingUsers, error: listError }` from that value —
both fields are present and the guard `if (listError) throw ...` works correctly.

### Testing a downstream fetch failure (getMessage 404)
When the search endpoint succeeds but the message detail endpoint fails, use
`mockImplementation` to route by URL, returning a non-OK Response only for the
`/message/` path:
```ts
vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
  if (url.toString().includes('/search')) {
    return new Response(JSON.stringify({ total: 1, messages: [MOCK_MESSAGE] }))
  }
  return new Response(null, { status: 404 })
})
await expect(getLatestEmail('test@example.com')).rejects.toThrow('getMessage: 404')
```

---

## Files tested in commit 8d7d9e2 (E2E Mailpit rewrite + try/catch server actions)

All source changes were covered by tests shipped in the same commit, with three gaps
identified and filled by the test-writer agent post-review:

| Gap | Fix |
|---|---|
| `startQuizSession` catch branch: no test for non-Zod unexpected error + `console.error` prefix | Added test: `mockGetRandomQuestionIds.mockRejectedValue(...)` to trigger catch |
| `startReviewSession` catch branch: no test at all for unexpected error path | Added test: `mockGetDueCards.mockRejectedValue(...)` to trigger catch |
| `clearAllMessages` non-OK response path: `throw new Error('clearAllMessages: ...')` untested | Added test: `fetch` returns `{ status: 503 }` |

### Testing the outer try/catch in Server Actions (wrap-all pattern)
When a Server Action wraps its entire body in `try { ... } catch (err) { console.error(...); return { success: false } }`,
the ZodError validation tests already exercise the catch path (Zod throws are caught).
But add a dedicated test for unexpected errors from async dependencies:

```ts
it('returns failure and logs when an unexpected error is thrown', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockSomeDependency.mockRejectedValue(new Error('unexpected DB failure'))
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const result = await startSomeSession(validInput)
  expect(result.success).toBe(false)
  if (!result.success) expect(result.error).toBe('unexpected DB failure')
  expect(consoleSpy).toHaveBeenCalledWith('[startSomeSession] Uncaught error:', expect.any(Error))
  consoleSpy.mockRestore()
})
```

Note: The existing Zod validation tests will print `stderr` output (the `console.error` from the catch
block) when they run — this is expected behaviour, not a test failure.

### Testing `clearAllMessages` non-OK response
```ts
it('throws when the DELETE request returns a non-OK status', async () => {
  vi.spyOn(global, 'fetch').mockImplementation(async () => new Response(null, { status: 503 }))
  await expect(clearAllMessages('test@example.com')).rejects.toThrow('clearAllMessages: 503')
})
```

---

## Files tested in commit eeea5ea (try/catch in quiz-session + nullable types)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/session/_components/quiz-session.tsx` | `quiz-session.test.tsx` | Added 2 tests for new catch branches: submitQuizAnswer throw + completeQuiz throw |
| `apps/web/app/app/quiz/types.ts` | — | Pure type file (string → string\|null); no logic to test |
| `apps/web/app/app/review/types.ts` | — | Pure type file (string → string\|null); no logic to test |

### Testing catch branches in client components (try/catch around Server Actions)
When a component wraps a Server Action call in `try/catch` that sets an error state,
test by mocking the action to reject and asserting on the `role="alert"` element:
```ts
it('shows an error and stays on the question when the action throws', async () => {
  const user = userEvent.setup({ delay: null })
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockSubmitQuizAnswer.mockRejectedValue(new Error('Network request failed'))

  render(<QuizSession sessionId="sess-1" questions={QUESTIONS} />)
  await user.click(screen.getByText('Option text'))
  await user.click(screen.getByRole('button', { name: 'Submit Answer' }))

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  })
  // Assert component did NOT advance state
  expect(screen.queryByRole('button', { name: /Next Question/ })).not.toBeInTheDocument()
  expect(consoleSpy).toHaveBeenCalledWith('Failed to submit answer:', expect.any(Error))
  consoleSpy.mockRestore()
})
```
Key assertions: (1) error alert visible, (2) UI stayed in pre-action state (no transition), (3) console.error called with correct prefix.

---

## Files tested in commit 3d47867 (hydration guard on LoginForm)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/_components/login-form.tsx` | `login-form.test.tsx` | Extended with 1 test; 9 → 10 tests total |

### Hydration guard: what is and is not testable

The `hydrated` state pattern (`useState(false)` + `useEffect(() => setHydrated(true), [])`)
disables a button during SSR and enables it after client hydration.

**Not testable in jsdom:** the pre-hydration disabled state. `@testing-library/react` wraps
`render()` in `act()`, which flushes all effects synchronously. `hydrated` is already `true`
before any test assertion can run.

**Testable:** that the button IS enabled after render (i.e., the effect fired and the guard
resolved). Add one explicit test for this:

```ts
it('enables the submit button after hydration completes', () => {
  // @testing-library/react wraps render() in act(), flushing all effects synchronously.
  // The button must be enabled by the time render() returns.
  render(<LoginForm />)
  expect(screen.getByRole('button', { name: /send magic link/i })).not.toBeDisabled()
})
```

This documents the intent of the guard and ensures no future regression breaks the
post-hydration state. The pre-hydration SSR path is validated only by Playwright E2E
(the Playwright `auto-wait` relies on the button being disabled, then enabled).

---

## Files skipped (no testable logic)
- `apps/web/app/layout.tsx` — pure layout, font config
- `apps/web/app/page.tsx` — pure composition
- `apps/web/app/app/layout.tsx` — Server Component with redirect; skipped as it requires
  mocking `next/navigation`'s `redirect` (throws internally) — defer to E2E
- `apps/web/app/app/dashboard/page.tsx` — thin page, just renders user.email
- `apps/web/app/app/_components/question-card.tsx` — pure presenter, no logic (just renders text + optional image)
- `apps/web/app/app/dashboard/_components/subject-grid.tsx` — pure presenter, MODE_LABELS only

## Files extended in commit d77f70d (wall-clock timer + aria-expanded + auth order + error surfacing)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/review/_components/review-explainer.tsx` | `review-explainer.test.tsx` | 2 tests: `aria-expanded` is false when collapsed, true when expanded |
| `apps/web/lib/queries/review.ts` | `queries/review.test.ts` | 1 test: subject filter query error throws 'Failed to load due cards' |
| `apps/web/app/app/review/actions.ts` | `review/actions.test.ts` | Fixed existing Zod UUID test — added getUser mock so auth guard is passed before Zod runs |

### Auth-before-parse ordering: always mock auth in Zod validation tests
When a Server Action checks auth BEFORE calling `Zod.parse()`, Zod validation tests must
mock `getUser` to return a valid user first. Without it, the action crashes before Zod runs:
```ts
// After auth-before-parse reorder: mock getUser so Zod is actually reached
it('returns failure when subjectIds contain invalid UUIDs', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const result = await startReviewSession({ subjectIds: ['not-a-uuid'] })
  expect(result.success).toBe(false)
  consoleSpy.mockRestore()
})
```
Without the getUser mock, `vi.resetAllMocks()` leaves it returning `undefined`, the
destructure `const { data: { user } }` crashes with TypeError, the outer catch returns
`{ success: false }` — the assertion passes but the wrong code path is exercised.

### Testing a second-chain error in filterBySubjects (two sequential from() calls)
Use `mockFromSequence` with two responses: first call succeeds (returns due cards),
second call returns an error (subject filter fails):
```ts
mockFromSequence(
  { data: [{ question_id: 'q1', due: '2026-03-10T00:00:00Z', state: 'review' }] },
  { data: null, error: { message: 'permission denied for table questions' } },
)
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
await expect(getDueCards({ subjectIds: ['subj-1'] })).rejects.toThrow('Failed to load due cards')
expect(consoleSpy).toHaveBeenCalledWith('[getDueCards] Subject filter query failed:', 'permission denied for table questions')
```
The `subjectIds` option must be provided to trigger `filterBySubjects`; without it the
second `from()` call never happens.

---

## Files extended in commit c6a80b5 (subject selector for Smart Review)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/review/_components/review-config-form.tsx` | `review-config-form.test.tsx` | 3 tests: toggle deselect, sessionStorage verification, loading state |
| `apps/web/lib/queries/review.ts` | `queries/review.test.ts` | 2 tests: query error path, subject filter matching no cards |
| `apps/web/app/app/review/actions.ts` | `review/actions.test.ts` | 1 test: Zod validation rejects invalid UUIDs in subjectIds |

---

## Files extended in commit 7599b50 (auth-before-parse regression tests in quiz/actions)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/quiz/actions.ts` | `quiz/actions.test.ts` | 3 regression tests (one per action): auth guard runs before Zod parse — unauthenticated call with `{}` returns `'Not authenticated'`, not a ZodError |

### Auth-before-parse regression test pattern (quiz/actions)
The source moved `StartQuizInput.parse(raw)` to after `getUser()` in `startQuizSession`.
`submitQuizAnswer` and `completeQuiz` already had auth before parse, but their Zod validation
tests were missing the `getUser` mock (fixed in the same commit).

The regression tests use invalid input (`{}`) together with a null user to assert the auth
guard fires first:
```ts
it('rejects unauthenticated calls before reaching Zod validation', async () => {
  mockGetUser.mockResolvedValue({ data: { user: null } })
  const result = await startQuizSession({})  // {} would fail Zod if parse ran first
  expect(result.success).toBe(false)
  if (!result.success) expect(result.error).toBe('Not authenticated')
})
```

Note: `submitQuizAnswer` and `completeQuiz` have no outer `try/catch`, so ZodError bubbles up.
Their Zod tests correctly use `.rejects.toThrow(ZodError)` rather than checking `result.success`.
`startQuizSession` wraps everything in `try/catch(ZodError)`, so its Zod tests assert `result.success === false`.

### Suite state after this commit
40 test files, 338 tests — all passing.

---

## Files extended in commit 33c1fa8 (users query error destructuring)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/quiz/actions/draft.ts` | `draft.test.ts` | 1 test: users query returns `{ error }` → returns `{ success: false, error: 'Failed to look up user' }` and logs prefix `[saveDraft] Users query error:` |

### Distinguishing the two failure branches on a `.single()` call
When production code destructures `{ data, error }` from `.single()` and handles them
separately, there are two distinct test cases:
1. `{ data: null, error: null }` — query succeeded but returned no row → test the "not found" message
2. `{ data: null, error: { message: '...' } }` — query itself failed (RLS, network, etc.) → test the "query error" message

Before commit 33c1fa8, only case 1 was covered. Case 2 (the `userError` branch) was added
to the source and must have its own test:

```ts
it('returns failure when the users query errors', async () => {
  setupAuthenticatedUser()
  const chain = mockChainWithCount(0)
  ;(chain.single as ReturnType<typeof vi.fn>).mockReturnValue({
    data: null,
    error: { message: 'row-level security policy violation' },
  })
  mockFrom.mockReturnValue(chain)
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  const result = await saveDraft(VALID_DRAFT_INPUT)

  expect(result).toEqual({ success: false, error: 'Failed to look up user' })
  expect(consoleSpy).toHaveBeenCalledWith(
    '[saveDraft] Users query error:',
    'row-level security policy violation',
  )
  consoleSpy.mockRestore()
})
```

The existing `mockChainWithCount(0)` helper already wires the `.eq()` → `{ count, error }` path
for the draft-count query, but its `.single` mock can be overridden independently for the
users-org query. Reusing the helper avoids duplicating the count-chain setup.

---

## Files tested in commit 97ab4ac (SessionRunner + AppShell + shared load-session-questions)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/_components/session-runner.tsx` | `session-runner.test.tsx` | New in this commit; 11 tests — happy path, next question, summary, all error branches |
| `apps/web/lib/queries/load-session-questions.ts` | `load-session-questions.test.ts` | Moved from review folder; 6 tests — ordering, field mapping, RPC error, empty data |
| `apps/web/app/app/_components/app-shell.tsx` | `app-shell.test.tsx` | New in this commit; 6 tests — normal layout, fullscreen mode, display name, brand name |
| `apps/web/app/app/quiz/session/_components/quiz-session.tsx` | `quiz-session.test.tsx` | Now a thin wrapper — 1 wiring test; full logic tested via SessionRunner |
| `apps/web/app/app/review/session/_components/review-session.tsx` | `review-session.test.tsx` | Now a thin wrapper — 1 wiring test; full logic tested via SessionRunner |

### AppShell: usePathname-based fullscreen branch
`AppShell` uses `usePathname()` to detect session routes and switch between full-layout
and bare fullscreen mode. Test pattern:
```tsx
const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
}))
vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))

// Mock all child components that have their own dependencies
vi.mock('./mobile-nav', () => ({ MobileNav: () => <div data-testid="mobile-nav" /> }))
vi.mock('./sidebar-nav', () => ({ SidebarNav: () => <nav data-testid="sidebar-nav" /> }))
vi.mock('./sign-out-button', () => ({ SignOutButton: () => <button type="button">Sign out</button> }))
vi.mock('./theme-toggle', () => ({ ThemeToggle: () => <button type="button">Toggle theme</button> }))

// Normal layout: header (role="banner") + sidebar present
mockUsePathname.mockReturnValue('/app/dashboard')
expect(screen.getByRole('banner')).toBeInTheDocument()

// Fullscreen: no header, no sidebar, children still render
mockUsePathname.mockReturnValue('/app/quiz/session')
expect(screen.queryByRole('banner')).not.toBeInTheDocument()
```

### Suite state after this commit
41 test files, 344 tests — all passing.

---

## Files tested in commit 54e9351 (sprint-2 quiz overhaul: batch-submit + finish-dialog + nav-bar)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/actions/batch-submit.ts` | `actions/batch-submit.test.ts` | Server Action; auth guard, Zod validation (generic catch), happy path, RPC errors, non-fatal FSRS, unexpected error logging |
| `apps/web/app/app/quiz/_components/finish-quiz-dialog.tsx` | `_components/finish-quiz-dialog.test.tsx` | Client component; open/closed, answered counts, singular/plural unanswered text, callbacks (submit/cancel/save), backdrop click, Escape key, submitting state |
| `apps/web/app/app/quiz/session/_components/quiz-nav-bar.tsx` | `session/_components/quiz-nav-bar.test.tsx` | Client component; Prev disabled at index 0, Next disabled at last index, callbacks, Finish Test never disabled |

### batchSubmitQuiz: generic catch catches ZodError too
Unlike `startQuizSession` (which has `if (err instanceof ZodError)` before the generic re-throw),
`batchSubmitQuiz` catches ALL errors with a single generic handler. This means Zod validation
errors produce "Something went wrong. Please try again." rather than the Zod message.
Tests that check Zod branches must assert the generic error message, not the Zod message:
```ts
// ✅ CORRECT for batchSubmitQuiz
expect(result.error).toBe('Something went wrong. Please try again.')
// ❌ WRONG
expect(result.error).toContain('Invalid uuid')
```

### FinishQuizDialog: dialog element and overlay interaction
The component uses `<dialog>` (HTML element) inside a wrapping overlay div. The `<dialog>` element
gets `role="dialog"` automatically. Use `screen.getByRole('dialog', { name: /finish quiz/i })` to
find it. To assert backdrop click calls `onCancel`, access `.parentElement` from the dialog:
```ts
const overlay = screen.getByRole('dialog', { name: /finish quiz/i }).parentElement
if (overlay) fireEvent.click(overlay)
```
The dialog's `onClick` calls `e.stopPropagation()`, so clicking inside the dialog does NOT bubble
to the overlay — test this as a non-call assertion.

### Suite state after commit 54e9351
44 test files, 383 tests (39 new) — all passing.

---

## Files tested in commits e8d70fc + dce30b1 (quiz report page + use-quiz-state hook)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/lib/queries/quiz-report.ts` | `lib/queries/quiz-report.test.ts` | Already existed — 7 tests; happy path, null session, empty/null answers, missing questions fallback |
| `apps/web/app/app/quiz/report/_components/report-card.tsx` | `report/_components/report-card.test.tsx` | Already existed — 8 tests; score color branches, duration, links |
| `apps/web/app/app/quiz/report/_components/report-question-row.tsx` | `report/_components/report-question-row.test.tsx` | New — 17 tests (see below) |
| `apps/web/app/app/quiz/report/page.tsx` | — | Server Component; no logic, no unit test needed |
| `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts` | — | All branches exercised indirectly via quiz-session.test.tsx |

### ReportQuestionRow: what to test
The component has two pure helper functions (`truncate` and `formatResponseTime`) and four
conditional rendering branches. All are unit-testable via @testing-library/react:

- **Label**: `questionNumber` shown when present; `Q{index+1}` fallback when null
- **Correct answer path**: no "Correct answer:" row; answer text shown in green
- **Incorrect answer path**: "Correct answer:" row shown; correct option text displayed
- **correctOption not found**: guard prevents "Correct answer:" row even on incorrect answer
- **No answer fallback**: `selectedOptionId` that matches no option → "No answer"
- **Explanation**: shown when `explanationText` is non-null; hidden when null
- **`formatResponseTime`**: 3000ms → "3.0s"; 500ms → "0.5s"; 12500ms → "12.5s"
- **`truncate`**: text ≤ 80 chars shown in full; > 80 chars truncated with "..."; exactly 80 not truncated

### Suite state after commits e8d70fc + dce30b1
45 test files, 400 tests — all passing.

---

## Files tested in commits 3c7b966 + dce30b1 + e8d70fc (sprint-2 quiz overhaul cont.)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/_components/question-tabs.tsx` | `question-tabs.test.tsx` | Already existed and extended — 7 tests; tab rendering, aria-selected, disabled state, hiddenTabs filter, click callback, disabled click no-op |
| `apps/web/app/app/quiz/actions/batch-submit.ts` | `actions/batch-submit.test.ts` | Already existed — 11 tests; auth guard, Zod branches, happy path score + results, single RPC call, FSRS, RPC error, unexpected error |
| `apps/web/app/app/quiz/session/_hooks/use-flagged-questions.ts` | `use-flagged-questions.test.ts` | Already existed — 4 tests; initial empty set, toggle add, toggle remove, multiple questions |
| `apps/web/app/app/quiz/session/_hooks/quiz-submit.ts` | `quiz-submit.test.ts` | New — 11 tests (see below) |
| `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts` | — | All branches exercised indirectly via quiz-session.test.tsx (13 tests including flag toggle, navigation, submit, error paths) |

### quiz-submit.ts: what to test
Two exported functions with distinct responsibilities:

**`submitQuizSession`:**
- Converts `Map<string, StoredAnswer>` to an array and calls `batchSubmitQuiz`
- Returns success result unchanged on happy path
- Calls `deleteDraft()` fire-and-forget on success (assert called, don't await)
- Returns failure error forwarded from batchSubmitQuiz on API error
- Does NOT call deleteDraft when API reports failure
- Returns generic error message when batchSubmitQuiz throws

**`saveQuizDraft`:**
- Converts Map to plain object before calling `saveDraft`
- Calls `router.push('/app/quiz')` on success
- Returns `{ success: true }` on success
- Returns `{ success: false, error }` without redirect on saveDraft failure
- The plain-object conversion is a key assertion: `expect(answers).not.toBeInstanceOf(Map)`

### Suite state after these commits
59 test files, 490 tests — all passing.

---

## Files extended/created in commit 9d9e898 (CodeRabbit fix plan — bugs, validation, safety)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/quiz/actions/draft.ts` | `draft.test.ts` | 3 tests: `currentIndex >= questionIds.length` → out-of-range error; boundary at `length - 1` succeeds |
| `apps/web/app/app/quiz/session/_hooks/quiz-submit.ts` | `quiz-submit.test.ts` | 1 test: `deleteDraft` rejection logs to `console.error` with correct prefix |
| `apps/web/app/app/quiz/_components/quiz-config-form.tsx` | `quiz-config-form.test.tsx` | 2 tests: `startQuizSession` throw → generic error + loading reset; count clamped to maxQuestions |
| `apps/web/app/app/quiz/_components/resume-draft-banner.tsx` | `resume-draft-banner.test.tsx` | 1 test: banner stays visible when `deleteDraft` returns `{ success: false }` |
| `apps/web/app/app/quiz/session/_components/quiz-session-loader.tsx` | `quiz-session-loader.test.tsx` | 2 tests: `draftCurrentIndex` > questions.length - 1 clamped; absent `draftCurrentIndex` passes undefined |
| `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts` | `use-quiz-state.test.ts` | **NEW FILE** — 16 tests across 5 groups: initial index clamping (5), navigation (4), answer selection (3), handleSubmit (2), handleSave (2) |

### Asserting fire-and-forget `.catch()` error logging
When a function calls `somePromise.catch((e) => console.error(prefix, e))` (not awaited),
the rejection is processed in a microtask. After awaiting the outer function, flush with
`await Promise.resolve()` before asserting on the consoleSpy:

```ts
it('logs via console.error when draft cleanup fails', async () => {
  mockDeleteDraft.mockRejectedValue(cleanupError)
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  const result = await submitQuizSession(SESSION_ID, answers)
  expect(result.success).toBe(true)  // submit still succeeds

  await Promise.resolve()  // flush the microtask queue

  expect(consoleSpy).toHaveBeenCalledWith('[submitQuizSession] Draft cleanup failed:', cleanupError)
  consoleSpy.mockRestore()
})
```

### Testing boundary-value validation (index out of range)
For `currentIndex >= questionIds.length` guards, test three cases:
1. `currentIndex === length` (exactly equal — the boundary)
2. `currentIndex > length` (clearly beyond)
3. `currentIndex === length - 1` (last valid — must succeed)

```ts
it('returns failure when currentIndex equals questionIds.length', async () => {
  const result = await saveDraft({ ...input, currentIndex: 2 })  // length is 2
  expect(result).toEqual({ success: false, error: 'Current index out of range' })
})

it('accepts currentIndex at the last valid position (length - 1)', async () => {
  const result = await saveDraft({ ...input, currentIndex: 1 })  // length is 2
  expect(result).toEqual({ success: true })
})
```

### Testing "prop forwarding to child via data-attribute" in session loaders
To assert that a clamped numeric value is passed as a prop to a mocked child component,
add a `data-*` attribute to the mock and check it with `getAttribute`:

```tsx
vi.mock('./quiz-session', () => ({
  QuizSession: ({ sessionId, initialIndex }: { sessionId: string; initialIndex?: number }) => (
    <div data-testid="quiz-session" data-initial-index={initialIndex}>{sessionId}</div>
  ),
}))

// In test:
expect(el.getAttribute('data-initial-index')).toBe('1')  // clamps 99 → 1 for 2 questions
expect(el.getAttribute('data-initial-index')).toBeNull()  // undefined is not rendered as attribute
```

### Testing React hooks with renderHook
For hooks with multiple external dependencies (router, other hooks), mock all deps with `vi.hoisted`:

```ts
const { mockRouterPush, mockSubmitSession } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockSubmitSession: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }))
vi.mock('./quiz-submit', () => ({ submitQuizSession: mockSubmitSession }))

// Also mock hooks used internally:
vi.mock('./use-flagged-questions', () => ({
  useFlaggedQuestions: () => ({ flaggedQuestions: new Set<string>(), toggleFlag: vi.fn() }),
}))
vi.mock('../../_hooks/use-navigation-guard', () => ({ useNavigationGuard: vi.fn() }))
```

Use `act()` for state-changing calls:
```ts
act(() => result.current.navigateTo(1))
await act(async () => result.current.handleSubmit())
```

### Cross-file jsdom environment flakiness
When running many test files together (e.g., `npx vitest run "app/app/quiz"`), a test may fail
due to React/jsdom state leaking between files in the same worker. The same test passes when
run alone. This is a **pre-existing Vitest jsdom isolation issue**, not caused by new tests.
Confirmation: stash new changes, run the same combined command — if still clean, the test was
already failing intermittently. Do NOT chase this flakiness unless it fails in isolation.

### Suite state after commit 9d9e898
60 test files, 506 tests — all passing (each file individually; combined run has pre-existing cross-file jsdom flakiness unrelated to new tests).

### Testing hooks extracted from larger hooks (2026-03-12)
When a hook like `useQuizNavigation` is extracted from a larger hook (`useQuizState`), test
the extracted hook independently. The parent hook's tests (testing delegation through the public
API) remain valid; add a dedicated test file for the new hook covering its own contracts
(initial state, navigation, ref resets). Do NOT re-test index clamping if a shared utility
(`clampIndex`) already has its own tests — focus on the hook's added behavior (navigateTo guard,
answerStartTime reset on valid navigation).

### Testing fake timers with useRef (2026-03-12)
When verifying that a `useRef` value (like `answerStartTime`) updates after navigation:
```ts
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 3 }))
const timeBefore = result.current.answerStartTime.current
vi.advanceTimersByTime(2000)
act(() => result.current.navigateTo(1))
expect(result.current.answerStartTime.current).toBeGreaterThan(timeBefore)
vi.useRealTimers()
```
Always call `vi.useRealTimers()` at the end to avoid leaking fake timer state.

### Extending tests for optional field pass-through (2026-03-12)
When a new optional field is threaded through a call chain (e.g., `subjectName`/`subjectCode`
from `useQuizConfig` → `sessionStorage` → `useQuizState` → `saveQuizDraft` → `saveDraft`),
add one targeted test at each layer:
- storage layer: parse JSON from the stub and assert the field value
- pass-through function: use `expect.objectContaining({ subjectName: ..., subjectCode: ... })`
- caller hook: same `expect.objectContaining` pattern on the mocked callee
This avoids duplicating full-chain integration tests while ensuring each link passes the data.

### Suite state after commit 0176634
61 test files, ~522 tests — all passing individually.
New file: `use-quiz-navigation.test.ts` (16 tests).
Extended: `quiz-submit.test.ts` (+2), `use-quiz-config.test.ts` (+1), `use-quiz-state.test.ts` (+1), `draft.test.ts` (+2).

---

## Files extended in latest commit (try/catch + clamped label)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/quiz/_components/resume-draft-banner.tsx` | `resume-draft-banner.test.tsx` | +4 tests: thrown exception → error message shown + banner stays; finally block re-enables Discard button on both failure paths |
| `apps/web/app/app/quiz/_components/quiz-config-form.tsx` | `quiz-config-form.test.tsx` | +1 test: label text shows clamped value when slider value exceeds maxQuestions |

### Changes with no new tests needed
- `quiz-submit.ts`: internal import path change only — no behaviour changed; existing 14 tests remain valid.
- `report-card.tsx`: `'use client'` removed (now a Server Component); pure presenter with no logic — existing 8 tests remain valid.
- `batch_submit_rpc.sql`: DB migration — no unit test target; covered by integration tests.

### try/catch in async event handlers — two distinct failure paths to test
When a component's async event handler adds `try/catch/finally` around a Server Action, always
test BOTH failure modes independently:

1. **`{ success: false }` return** — action resolves but signals failure:
   ```ts
   mockDeleteDraft.mockResolvedValue({ success: false })
   ```
   Assert: error message shown, banner still visible, Discard button re-enabled.

2. **thrown exception** — action rejects (network error, uncaught exception):
   ```ts
   mockDeleteDraft.mockRejectedValue(new Error('network error'))
   ```
   Assert: same error message shown, banner still visible, Discard button re-enabled.

The `finally` block (loading reset) must be tested for each failure path, not just the success path.

### Clamped display value: assert the DOM text, not the action call argument
When a component shows `Math.min(count, maxQuestions)` in a label, the existing test that
asserts `startQuizSession` was called with a clamped count does NOT cover the label text.
Add a dedicated test using `fireEvent.change(slider, { target: { value: '50' } })` to
force the internal count state beyond the max, then assert the label text:
```ts
fireEvent.change(slider, { target: { value: '50' } })
expect(screen.getByText(/Number of questions: 30/)).toBeInTheDocument()
```
The slider's `max` attribute prevents interactive input above the bound, but `fireEvent.change`
bypasses that constraint — exactly what the Math.min guard is designed to handle.

### Suite state after this commit
65 test files, 580 tests — all passing.

---

## Files tested in commit 845923b (Sprint 3 analytics)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/lib/queries/analytics.ts` | `lib/queries/analytics.test.ts` | Already present — shipped with the commit |
| `apps/web/lib/queries/reports.ts` | `lib/queries/reports.test.ts` | Already present — shipped with the commit |
| `apps/web/lib/queries/question-stats.ts` | `lib/queries/question-stats.test.ts` | Already present — shipped with the commit |
| `apps/web/app/app/quiz/_components/statistics-tab.tsx` | `_components/statistics-tab.test.tsx` | Already present — shipped with the commit |
| `apps/web/app/app/reports/_components/reports-list.tsx` | `reports-list.test.tsx` | **NEW** — 17 tests: empty state, mode labels, sort state machine, link hrefs, arrow indicator |
| `apps/web/app/app/dashboard/_components/activity-heatmap.tsx` | `activity-heatmap.test.tsx` | **NEW** — 12 tests: `getIntensity` all 6 branches + boundary values, locale date format, null return on empty data |
| `apps/web/app/app/dashboard/_components/activity-chart.tsx` | `activity-chart.test.tsx` | **NEW** — 3 tests: empty state, chart renders, heading visible |
| `apps/web/app/app/dashboard/_components/subject-scores-chart.tsx` | `subject-scores-chart.test.tsx` | **NEW** — 5 tests: empty state, chart renders, heading, legend entries, >5 subjects colour cycling |
| `apps/web/app/app/quiz/actions/fetch-stats.ts` | `actions/fetch-stats.test.ts` | **NEW** — 2 tests: delegates to getQuestionStats, propagates errors |
| `apps/web/app/app/dashboard/_components/quick-actions.tsx` | — | Pure presenter (two hardcoded links, no logic) — no unit test needed |

### Mocking Recharts in jsdom
Recharts renders SVG using browser layout APIs not available in jsdom. Stub the entire module:
```tsx
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
```
For `PieChart` + `Pie` + `Cell`, use the same approach. The `data-testid` on the container
lets tests assert the chart rendered without depending on SVG details.

### ActivityHeatmap: `getIntensity` intensity boundaries
The function uses `<=` comparisons, so boundary values belong to the LOWER intensity band:
- `total === 0` → `bg-muted`
- `total === 5` → `bg-green-200` (not muted)
- `total === 15` → `bg-green-300`
- `total === 30` → `bg-green-400`
- `total === 50` → `bg-green-500`
- `total >= 51` → `bg-green-600`
Test the exact boundary value for each threshold to catch off-by-one regressions.

### ReportsList: sortKey default and toggleSort behaviour
- Default sort: `date` descending (newest first).
- Clicking the active key flips `sortDir` (asc ↔ desc).
- Clicking an inactive key sets `sortDir` to `'desc'` for `date`, `'asc'` for `score`/`subject`.
- The active sort key button shows `↑` (asc) or `↓` (desc); inactive keys show no arrow.
Test by clicking sort buttons and asserting the `href` order of rendered `<a>` elements.

### Suite state after commit 845923b
70 test files, 619 tests — all passing (5 new files, 39 new tests).

---

## Promise.all call-ordering with per-table Supabase mocks (2026-03-12)

When a function uses `Promise.all([helperA(), helperB(), helperC()])` and each helper queries
a Supabase table, the order in which `from()` is called is determined by the Node.js microtask
queue, not the array index. The rule for sequential helpers within `Promise.all`:

- All first awaits across all helpers fire before any second await.
- So for `Promise.all([getResponseCounts(), getFsrsCard(), getLastResponse()])`:
  - Call 1: `student_responses` (getResponseCounts total — first await)
  - Call 2: `fsrs_cards` (getFsrsCard — first and only await, fires concurrently)
  - Call 3: `student_responses` (getLastResponse — first and only await, fires concurrently)
  - Call 4: `student_responses` (getResponseCounts correct — second await, fires after call 1 resolves)

To target a specific sub-query within a table, use a per-table call counter, NOT a global counter:

```ts
const studentResponsesCalls: number[] = []
mockFrom.mockImplementation((table: string) => {
  if (table === 'student_responses') {
    const callIndex = studentResponsesCalls.push(1)
    if (callIndex === 3) {  // 3rd student_responses call = correct-count query
      return buildChain({ count: null, error: { message: 'db error' } })
    }
    return buildChain({ count: 2, data: null, error: null })
  }
  return buildChain({ data: null, error: null })
})
```

**Key call indices for question-stats.ts helpers:**
- student_responses call 1 = total count (getResponseCounts first await)
- student_responses call 2 = last response (getLastResponse fires concurrently)
- student_responses call 3 = correct count (getResponseCounts second await, after call 1 resolves)

### Zod validation tests for Server Actions
When a Server Action wraps input in a Zod schema before delegating, add these tests:
1. Passes valid UUID → delegates to inner function (happy path already covered)
2. Rejects non-UUID string → `rejects.toThrow()` (ZodError)
3. Rejects empty string → `rejects.toThrow()` (ZodError)
4. Does not call inner function when validation fails → `expect(mockFn).not.toHaveBeenCalled()`

### useTransition component patterns
For components using `useTransition` + a manual trigger button:
- Test that `hasAnswered=false` shows the "answer first" message (no button)
- Test that `hasAnswered=true` shows the load trigger button
- Test success: click load → `waitFor` stats to appear
- Test error: mock rejects → `waitFor` error message + retry button
- Test retry: mock rejects once then resolves → click retry → stats appear
- Use `vi.hoisted` + named mock variable so `beforeEach(() => vi.resetAllMocks())` works properly
  (static `vi.fn().mockResolvedValue(...)` in `vi.mock()` factory is not reset between tests)

### Ref-based render-phase state reset: edge case coverage (commit 946fb46)
When a component uses the ref-based pattern to reset state during render on prop change:
```tsx
if (prevRef.current !== newProp) {
  prevRef.current = newProp
  setStateA(null)
  setStateB(null)
}
```
Test all cases where the reset must clear distinct prior states:
1. Reset from loaded stats (the obvious path — tested first in the commit)
2. Reset from error state — `error` was also reset in the same block; test it explicitly
   (render with failing mock, verify error message, rerender with new id, verify error gone + load button shown)

### Suite state after commit 946fb46
Previous: 73 test files, 643 tests. After this cycle: 73 test files, 644 tests (1 new test added to statistics-tab.test.tsx for error-state reset on questionId change).

---

## Files tested in commit c4879a1 (generation counter + single-query refactor)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/quiz/_components/statistics-tab.tsx` | `_components/statistics-tab.test.tsx` | +1 test: discards stale fetch result when questionId changes before fetch resolves |
| `apps/web/lib/queries/question-stats.ts` | `lib/queries/question-stats.test.ts` | Tests updated in the commit: single-query mock; +1 new test for zero counts |

### Generation counter race condition: now testable (replaces prior "known limitation")
Commit 946fb46 noted that the in-flight + prop-change race was NOT testable because
`useTransition`'s `isPending` cannot be reset from the render body — stale setStats would
fire. Commit c4879a1 fixed this with a `generation` ref that guards the setState call.

**The test approach:** use a manually-controlled promise for the stale fetch. Click load
(enters pending), rerender with new questionId (bumps generation), then resolve the stale
promise (ends transition), then assert stats never appear:

```ts
let resolveQ1: (value: Stats) => void = () => {}
const staleFetchPromise = new Promise<Stats>((resolve) => { resolveQ1 = resolve })
mockFetchQuestionStats.mockReturnValueOnce(staleFetchPromise)

const { rerender } = render(<StatisticsTab questionId="q-1" hasAnswered={true} />

---

## Files tested in latest commit (selectedOptionId fix in session-answer-block)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/_components/session-answer-block.tsx` | `session-answer-block.test.tsx` | **NEW** — 11 tests across 4 groups: selectedOptionId forwarding, FeedbackPanel visibility, AnswerOptions disabled state, correctOptionId forwarding |

### Testing a pure orchestrator component by mocking its children
`SessionAnswerBlock` has no logic of its own beyond prop wiring and conditional rendering.
Test it by mocking both child components (`AnswerOptions` and `FeedbackPanel`) with
lightweight stubs that expose key props as `data-*` attributes. This lets you assert on
prop forwarding without rendering child internals:

```tsx
vi.mock('./answer-options', () => ({
  AnswerOptions: (props: {
    disabled: boolean
    selectedOptionId?: string | null
    correctOptionId?: string | null
    // ...
  }) => (
    <div
      data-testid="answer-options"
      data-disabled={String(props.disabled)}
      data-selected-option-id={props.selectedOptionId ?? ''}
      data-correct-option-id={props.correctOptionId ?? ''}
    />
  ),
}))
```

Then assert with `screen.getByTestId('answer-options').dataset.selectedOptionId`.

Key insight: `selectedOptionId={selectedOption}` (the post-fix version) passes the value
unconditionally. Before the fix it was `selectedOptionId={feedbackData ? selectedOption : null}`,
meaning the selection was hidden during the answering state. The test that catches the regression:
```ts
it('passes the selected option id to AnswerOptions while answering, before any submission', () => {
  render(<SessionAnswerBlock {...makeProps({ selectedOption: 'opt-b' })} />)
  expect(screen.getByTestId('answer-options').dataset.selectedOptionId).toBe('opt-b')
})
```

### use-session-state.test.ts — no changes needed
The existing hook test suite was not affected by the `session-answer-block.tsx` change.
The hook's `selectedOption` state and its internal transitions are unchanged; only the
component's prop-passing (the presentational layer) changed.

### Suite state after this commit
133 test files, 1582 tests — all passing.)
await user.click(screen.getByRole('button', { name: 'Load Statistics' }))

// Bump generation before stale fetch resolves
rerender(<StatisticsTab questionId="q-2" hasAnswered={true} />)

// Resolve the stale fetch — ends isPending, but guard discards the result
resolveQ1(defaultStats)

// Component shows load button for q-2, not stats from q-1
await waitFor(() => {
  expect(screen.getByRole('button', { name: 'Load Statistics' })).toBeInTheDocument()
})
expect(screen.queryByText('Times seen')).not.toBeInTheDocument()
```

**Key timing insight:** `waitFor` for the load button must come AFTER `resolveQ1()`, not before.
While the q-1 fetch is still pending, `isPending` is `true` and both the Load Statistics button
and stats are hidden (component renders the loading skeleton). Only after the stale fetch resolves
does `isPending` drop to `false`, at which point the guard discards the stale result and the
component shows the Load Statistics button for q-2.

**Single-query refactor (question-stats.ts):** the old two-sequential-COUNT pattern was replaced
by a single `.select('is_correct')` query with client-side `.filter()`. Mocks changed from
`{ count: N }` shape to `{ data: Array<{ is_correct: boolean }> }` shape. The per-table call
counter pattern (studentResponsesCalls[]) became simpler — only two concurrent `from()` calls
now (student_responses + fsrs_cards) instead of four.

### Suite state after commit c4879a1
73 test files, 646 tests — all passing.

---

## Files extended in commit 3a0d1e6 (authError destructuring in query files)

The fix adds `error: authError` destructuring from `getUser()` and an early branch before
the existing `!user` guard across 7 query files. Each branch has a distinct return type:

| File | authError behaviour |
|---|---|
| `dashboard.ts` | throws `Error('Auth error: ...')` |
| `progress.ts` | throws `Error('Auth error: ...')` |
| `review.ts` (getDueCards) | throws `Error('Auth error: ...')` |
| `review.ts` (getNewQuestionIds) | throws `Error('Auth error: ...')` |
| `question-stats.ts` | throws `Error('Auth error: ...')` |
| `reports.ts` | throws `Error('Auth error: ...')` |
| `quiz-report.ts` | returns `null` |
| `load-session-questions.ts` | returns `{ success: false, error: 'Auth error: ...' }` |

### authError branch test pattern (query files)
```ts
it('throws when getUser returns an auth error', async () => {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'token expired' },
  })
  await expect(someQuery()).rejects.toThrow('Auth error: token expired')
})
```
For functions that return null on auth failure:
```ts
it('returns null when getUser returns an auth error', async () => {
  mockGetUser.mockResolvedValueOnce({
    data: { user: null },
    error: { message: 'token expired' },
  })
  const result = await getQuizReport('sess-1')
  expect(result).toBeNull()
  expect(mockFrom).not.toHaveBeenCalled()  // no DB calls after early return
})
```
For functions that return a structured error object:
```ts
it('returns failure when getUser returns an auth error', async () => {
  mockGetUser.mockResolvedValueOnce({
    data: { user: null },
    error: { message: 'token expired' },
  })
  const result = await loadSessionQuestions(['q1'])
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.error).toBe('Auth error: token expired')
  expect(mockRpc).not.toHaveBeenCalled()
})
```

### Suite state after commit 3a0d1e6
73 test files, 63 tests in the 7 affected query test files (7 new authError tests added) — all passing.

---

## Files extended in commit 53efbdd (isLoading refactor + NaN/Infinity guard)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/quiz/_components/statistics-tab.tsx` | `_components/statistics-tab.test.tsx` | +2 tests: isLoading reset on question change during in-flight fetch; FsrsSection hidden when fsrsState is null |
| `apps/web/lib/queries/analytics.ts` | `lib/queries/analytics.test.ts` | +5 tests: NaN/Infinity inputs for both getDailyActivity and getSubjectScores |

### What changed
1. `isPending` (useTransition) replaced by explicit `isLoading` state for loading skeleton display.
   - `setIsLoading(false)` is now called in the render-phase reset block (when questionId changes),
     so the load button appears immediately without waiting for the stale fetch's `finally` block.
   - `setIsLoading(true)` on load start; `setIsLoading(false)` in the `finally` block.

2. `boundParam()` in analytics.ts gained a `Number.isFinite` guard before clamping:
   - Non-finite values (NaN, +Infinity, -Infinity) all fall back to `min` (not `max`).
   - This is because `Number.isFinite(nonFinite) === false`, so `n = min`.
   - Then `Math.max(min, Math.min(max, Math.trunc(min))) = min`.

### NaN/Infinity boundParam behaviour table
| Input | isFinite | n | Result (days 1-365) |
|---|---|---|---|
| NaN | false | 1 (min) | 1 |
| +Infinity | false | 1 (min) | 1 |
| -Infinity | false | 1 (min) | 1 |
| 500 | true | 500 | 365 (clamped) |
| 0 | true | 0 | 1 (clamped) |

All non-finite inputs produce `min`, not `max`. Test +Infinity expecting `1`, not `365`.

### isLoading reset on question change: test pattern
The key assertion: the Load Statistics button appears BEFORE the stale promise is resolved.
This distinguishes the new `setIsLoading(false)` in the reset block from the old behavior
(which waited for `isPending` to drop after the transition ended):

```ts
// Start in-flight fetch for q-1
await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
// Verify loading state (button gone)
await waitFor(() => {
  expect(screen.queryByRole('button', { name: 'Load Statistics' })).not.toBeInTheDocument()
})
// Change question — reset block fires setIsLoading(false) synchronously during render
rerender(<StatisticsTab questionId="q-2" hasAnswered={true} />)
// Load button appears BEFORE resolving the stale promise
await waitFor(() => {
  expect(screen.getByRole('button', { name: 'Load Statistics' })).toBeInTheDocument()
})
// Only then resolve the stale fetch — generation guard discards it
resolveQ1(defaultStats)
expect(screen.queryByText('Times seen')).not.toBeInTheDocument()
```

Note: the `act()` warning ("A suspended resource finished loading inside a test...") from
resolving the stale promise after assertions is expected and harmless. The test passes correctly.

### FsrsSection null branch: pattern
```ts
it('hides the FSRS section when fsrsState is null', async () => {
  mockFetchQuestionStats.mockResolvedValue({ ...defaultStats, fsrsState: null })
  const user = userEvent.setup()
  render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
  await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
  await waitFor(() => { expect(screen.getByText('Times seen')).toBeInTheDocument() })
  expect(screen.queryByText('FSRS Data')).not.toBeInTheDocument()
  expect(screen.queryByText('State')).not.toBeInTheDocument()
})
```
Tests the explicit `if (!stats.fsrsState) return null` branch in the extracted `FsrsSection` component.

### Suite state after commit 53efbdd
73 test files, 33 tests passing in the 2 affected test files (5 new in analytics, 2 new in statistics-tab).

---

## Capturing recharts data props for data-transformation tests (2026-03-13)

When testing a component that passes transformed data to recharts `BarChart`, the default
mock (`<div data-testid="bar-chart">`) discards the `data` prop. To assert on the formatted
output (e.g., UTC-safe date labels), capture it in a module-level variable inside the mock:

```tsx
let capturedBarChartData: unknown[] = []

vi.mock('recharts', () => ({
  BarChart: ({ children, data }: { children: React.ReactNode; data?: unknown[] }) => {
    capturedBarChartData = data ?? []
    return <div data-testid="bar-chart">{children}</div>
  },
  // ...other stubs
}))
```

Then after `render(...)`, cast and assert:

```tsx
it('formats day strings as UTC dates', () => {
  render(<ActivityChart data={[makeDay('2026-01-01', 3, 1)]} />)
  const formatted = capturedBarChartData as Array<{ label: string }>
  expect(formatted[0].label).toBe('1 Jan')
})
```

Key points:
- Declare the capture variable at module scope (outside describe), reset is implicit on each test
  because `render()` always triggers a re-render that overwrites it.
- Use `unknown[]` for the variable type; cast to a concrete shape at the assertion site — no `any`.
- This pattern covers `formatActivityData` and similar pure data-transform helpers that are
  module-private (not exported) but whose output flows into a mocked child prop.

### Suite state after commit f0f8d0e
activity-chart.test.tsx: 6 tests (3 existing + 3 new for formatActivityData/ChartBody behavior).
statistics-tab.test.tsx: 14 tests — no new tests needed (useQuestionStats is not exported;
all its behavior paths were already covered through StatisticsTab integration tests).

## Files extended in commit ec84acc (ended_at guard)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/lib/queries/quiz-report.ts` | `quiz-report.test.ts` | Added 4 cases (guard short-circuits DB calls, no correct option, null questions response, responseTimeMs passthrough); total 14 tests |

### Verifying early-return guard does not issue downstream DB calls
When a function has a guard clause that returns before hitting subsequent DB queries,
assert on the `mockFrom` call count to confirm no further queries ran:

```ts
it('does not query answers or questions when session is active', async () => {
  const activeSession = { ...sessionRow, ended_at: null }
  mockFromSequence({ data: activeSession })
  await getQuizReport('sess-1')
  // Only the session query should have fired — no downstream DB calls
  expect(mockFrom).toHaveBeenCalledTimes(1)
})
```

This is distinct from asserting the return value — it verifies the guard did not fall
through. Use `vi.clearAllMocks()` (not just `resetAllMocks`) in `beforeEach` to reset
the call count between tests.

### Testing option-map fallback paths in buildReportQuestions
When `buildReportQuestions` uses `options.find(o => o.correct)`, two fallback branches
need coverage:
1. No option has `correct: true` → `correctOptionId` falls back to `''`
2. Questions DB returns `null` → `questions ?? []` produces empty map → all fields fall back

Test (1) by supplying options where all have `correct: false`.
Test (2) by returning `{ data: null }` from the questions DB call (not `{ data: [] }`
which the "empty array" test already covers — these are distinct code paths in the
`questions ?? []` expression).

### Array index safety in generated test assertions (TS2532 — count 2, now a rule)
When accessing elements of a result array in test assertions, always guard against
`undefined` to prevent TS2532 ("Object is possibly 'undefined'") errors that block
the pre-commit type-check gate.

**Preferred patterns (pick one per test):**

```ts
// Option A: assert length first, then use non-null assertion with justification
expect(report.questions).toHaveLength(2)
// Length asserted above — index access is safe
const q1 = report.questions[0]!

// Option B: optional chaining (no assertion needed, but weaker signal)
expect(report.questions?.[0]?.questionText).toBe('What is lift?')
```

**Never do:**
```ts
// ❌ WRONG — TS2532 if noUncheckedIndexedAccess is enabled
expect(report.questions[0].questionText).toBe('What is lift?')
```

This pattern has caused pre-commit failures twice (different commits). The type-check
gate catches it, but generating correct code the first time avoids the fix cycle.

### Test fixture type annotations (shape mismatch — count 2, now a rule)
When constructing fixture objects for tests, always annotate them with the exported
TypeScript type from the source module. This forces a compile-time shape check and
prevents mismatches between fixture fields and the actual type contract.

**Correct pattern:**
```ts
import type { SubjectOption } from './use-quiz-config'

// ✅ Type annotation catches missing/wrong fields at compile time
const SUBJECTS: SubjectOption[] = [
  { id: 'abc', code: '010', name: 'Air Law', short: 'ALW', questionCount: 50 },
]
```

**Never do:**
```ts
// ❌ WRONG — plain object may drift from SubjectOption shape
const SUBJECTS = [{ id: 'abc', name: 'Air Law', short: 'ALW', count: 50 }]
```

This pattern has caused pre-commit type-check failures twice (2026-03-11: missing `short`
field; 2026-03-13: wrong `SubjectOption` shape with `count` instead of `questionCount`
and missing `code`). Both caught by tsc, but generating correctly-typed fixtures avoids
the fix cycle entirely.

---

## Files tested in feat/post-sprint-3-polish (2026-03-13)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/actions/check-answer.ts` | `actions/check-answer.test.ts` | **NEW** — 12 tests: auth guard, Zod throws, question not found, no correct option, isCorrect true/false, explanation fields, deleted_at filter |
| `apps/web/app/app/quiz/actions/lookup.ts` (getFilteredCount) | `actions/lookup.test.ts` | **NEW** — 20 tests: delegates for fetch wrappers, auth/Zod guards, filter:all with topic/subtopic, filter:unseen (answered set logic), filter:incorrect (fsrs_cards intersection) |
| `apps/web/app/app/quiz/_hooks/use-quiz-cascade.ts` | `_hooks/use-quiz-cascade.test.ts` | **NEW** — 11 tests: initial state, handleSubjectChange (fetch, no-fetch, cascade reset), handleTopicChange (fetch, no-fetch, cascade reset), setSubtopicId direct, full cascade flow |
| `apps/web/app/app/quiz/_hooks/use-quiz-start.ts` | `_hooks/use-quiz-start.test.ts` | **NEW** — 13 tests: initial state, guard (empty subjectId), happy path (args, topic/subtopic, count cap, min=1, sessionStorage, subjectName/Code, navigation), failure (error state, loading reset, throw, no navigation) |

### checkAnswer: Zod is not wrapped in try/catch
Unlike `batchSubmitQuiz` (generic catch) and `startQuizSession` (ZodError catch), `checkAnswer`
calls `CheckAnswerSchema.parse(raw)` **without a surrounding try/catch**. ZodErrors propagate
directly to the caller. Tests for invalid input must use `.rejects.toThrow()`, NOT
`expect(result.success).toBe(false)`:

```ts
// ✅ CORRECT for checkAnswer
await expect(checkAnswer({ questionId: 'bad', selectedOptionId: 'x' })).rejects.toThrow()

// ❌ WRONG — checkAnswer has no catch, so ZodError is uncaught
const result = await checkAnswer({ questionId: 'bad', selectedOptionId: 'x' })
expect(result.success).toBe(false)
```

Always read the source for try/catch presence before writing Zod validation tests — the error
handling contract varies per action.

### getFilteredCount: two-phase DB pattern (questions then filter table)
`getFilteredCount` always queries `questions` first (call 1), then conditionally queries
`student_responses` (filter:unseen) or `fsrs_cards` (filter:incorrect) as call 2. For `filter:all`,
there is no second query. Use `mockFrom.mockImplementation(() => { callIndex++; ... })` to
route the two sequential calls. Key assertions:
1. **filter:all** — single `from('questions')` call, count = data.length
2. **filter:unseen** — second call to `student_responses`, subtracts answered set
3. **filter:incorrect** — second call to `fsrs_cards`, intersects with question set
4. **null from second table** — treated as empty set (no crash)

### useQuizCascade: cascade reset + mock sequencing
When testing that "change to new topic resets subtopics", the default mock returns subtopics
for ANY topic. To verify the reset (subtopics become `[]` transiently before refetch completes),
use `mockReturnValueOnce([])` before triggering the second change — this makes the refetch
for the new topic return empty, so the final assertion is clean:

```ts
mockFetchSubtopicsForTopic.mockResolvedValueOnce([])
await act(async () => result.current.handleTopicChange('new-topic-id'))
expect(result.current.subtopics).toEqual([])
```

Without this, the default mock fills subtopics with the previous data, making the reset
invisible to the test.

### useQuizStart: sessionStorage mock via Object.defineProperty
jsdom provides a real `sessionStorage`, but `vi.stubGlobal` is also valid. For this hook,
`Object.defineProperty(globalThis, 'sessionStorage', ...)` is more reliable because it
replaces the whole object (preventing real writes from leaking between tests):

```ts
beforeEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { setItem: mockSessionStorageSetItem, getItem: vi.fn(), removeItem: vi.fn() },
    writable: true,
  })
})
```

Restore with `writable: true` so subsequent `beforeEach` calls can overwrite it again.

### Suite state after this session
4 new test files, 56 new tests. Overall suite: ~77 test files, ~702 tests.

---

## Files tested in commit 81c1428 (post-sprint-3-polish)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/actions/fetch-explanation.ts` | `fetch-explanation.test.ts` | New file; 10 tests — auth guard, Zod throws, happy path, null fields, DB error, select fields asserted, deleted_at filter |
| `apps/web/app/app/quiz/actions/draft.ts` | `draft.test.ts` | Extended; 4 tests for new update path: happy path, student_id scoping, DB error, no count-limit check when updating |
| `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts` | `use-quiz-state.test.ts` | Extended; 2 tests: empty-answers guard sets error, draftId forwarded to saveQuizDraft |
| `apps/web/app/app/quiz/_hooks/use-navigation-guard.ts` | `use-navigation-guard.test.ts` | Extended; 1 test: handler sets e.returnValue = '' and calls preventDefault |
| `apps/web/app/app/quiz/_components/saved-draft-card.tsx` | `saved-draft-card.test.tsx` | Extended; 1 test: delete aborted when window.confirm returns false |

### Suite state after this commit
5 files extended/created, 8 new tests. Overall suite: 70 test files, 681 tests — all passing.

### Zod parse vs safeParse: no catch means ZodError propagates
When a Server Action uses `Input.parse(raw)` (not `safeParse`) AND has no surrounding
`try/catch`, invalid input throws an uncaught `ZodError`. Tests for the invalid-input path
must use `.rejects.toThrow()`, not `expect(result).toEqual({ success: false })`:

```ts
// WRONG — parse() throws; there is no return value to assert on
const result = await fetchExplanation({ questionId: 'not-a-uuid' })
expect(result).toEqual({ success: false })

// CORRECT
await expect(fetchExplanation({ questionId: 'not-a-uuid' })).rejects.toThrow()
```

Contrast with `saveDraft` which wraps everything in `try { ... } catch (err instanceof ZodError)` —
that action safely returns `{ success: false }` on bad input. Always check whether the source
catches ZodError before writing the validation test.

### Testing window.confirm guard in React event handlers
When `handleDelete` was extended with `if (!window.confirm(...)) return`, test the cancellation
path by restoring `window.confirm` to return `false` and asserting the downstream mock was never called:

```ts
it('does not call deleteDraft when the user cancels the confirmation dialog', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<SavedDraftCard drafts={[DRAFT]} />)
  fireEvent.click(screen.getByTestId('delete-draft'))
  await new Promise((r) => setTimeout(r, 0))  // flush microtasks
  expect(mockDeleteDraft).not.toHaveBeenCalled()
})
```

The `setTimeout(r, 0)` is needed because `handleDelete` is async — the early return is
synchronous but the event handler is awaited in the event loop.

### Capturing and invoking a window event handler in tests
To verify the body of a handler registered via `addEventListener`, capture it from the mock
and invoke it directly:

```ts
let capturedHandler: ((e: BeforeUnloadEvent) => void) | undefined
addMock.mockImplementation((_type: string, handler: (e: BeforeUnloadEvent) => void) => {
  capturedHandler = handler
})
renderHook(() => useNavigationGuard(true))
const fakeEvent = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent
capturedHandler?.(fakeEvent)
expect(fakeEvent.preventDefault).toHaveBeenCalled()
expect(fakeEvent.returnValue).toBe('')
```

### Testing the draftId update path in saveDraft (branch with update instead of insert)
The update path uses `.update({...}).eq('id', draftId).eq('student_id', userId)`. To assert
both `eq` calls in sequence, build a dedicated mock per call with a closure:

```ts
const updateEq2 = vi.fn().mockReturnValue({ error: null })
const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })
// from('quiz_drafts') returns { update: updateFn }
```

Then assert `updateEq1.toHaveBeenCalledWith('id', DRAFT_ID)` and `updateEq2.toHaveBeenCalledWith('student_id', USER_ID)`.

---

## Covering new error paths in existing files (count 3, enforced rule — 2026-03-13)

When a commit adds a new query, a new `if (error) return` branch, or a new early-return path
to a file that already has a co-located test file, the test file must be updated in the same
commit to cover the new branch. This is distinct from "new file without tests" (where an
entire file has no test) — here, the test file exists but is incomplete after the change.

### The gap to look for
When reviewing a diff, check every file that is modified (not just created). For each modified
file that has a co-located `.test.ts` / `.test.tsx`:

1. Does the diff add a new `if (error) return` path?
2. Does the diff add a new query (e.g., a second `.from()` call or `.auth.getUser()` call)?
3. Does the diff add a new conditional branch that returns early before reaching existing assertions?

If yes to any of these, write a test for the new branch in the same commit.

### Why this keeps being missed
The pattern is: a function already has a test file that covers the main flow and the first
error path. A second query is added to the function. The test file is not updated because
the existing tests still pass. But the new query's error path is now unreachable by any test.

Example from `draft.ts` (d06c25b): the function already tested the count-query error path.
A `getUser()` call was added above it. The existing count-error test still passed. But the
new auth-error path from `getUser()` had no test — caught post-commit by test-writer.

### Pattern: three occurrences (2026-03-13 to 2026-03-14)
1. `draft.ts` (d06c25b): Count-error path — `getCount()` returned an error, no test for that branch.
2. `draft.ts` (d06c25b): Users-query error path — `getUser()` returned an error, no test for that branch.
3. `batch-submit.ts` (ce35a31): Error message string match changed from `'session not found or already completed'` to `'session not found or not accessible'` — the specific error branch had no test. Caught by test-writer, fixed in 45da072.

All three were caught post-commit by the test-writer gap detection. All required a follow-up
commit to add tests. The correct behaviour is to add the test branch in the same commit
as the production change.

### Test pattern for a new query error path
```ts
it('returns early when [the new query] fails', async () => {
  // set up the new query mock to return an error
  mockFrom.mockImplementationOnce(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ data: null, error: { message: 'DB error' } }),
    }),
  }))
  const result = await theFunction(VALID_INPUT)
  // assert the function returned the expected error shape
  expect(result).toEqual({ success: false })
  // assert that downstream queries were NOT called (early return)
  expect(mockFrom).toHaveBeenCalledTimes(1)
})
```

## Files extended in commit e41807f (use-quiz-config refetchFilteredCount)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/_hooks/use-quiz-config.ts` | `use-quiz-config.test.ts` | Added 3 new scope-change re-fetch tests in commit; test-writer added 2 more for setSubtopicId path. Total: 26 tests. |

### Checking all scope-change handlers when reviewing hook diffs (2026-03-13)
When a hook refactor touches multiple scope-change handlers (`handleSubjectChange`,
`handleTopicChange`, `setSubtopicId`) with the same shared logic, check that ALL handlers
have corresponding tests. It is easy to write tests for subject/topic changes and forget
the subtopic change handler. Verify by reading the hook's return object and listing every
exported handler that calls the changed helper function.

### Auth error path coverage: `authError || !user` pattern (2026-03-14)
When a Server Action is changed from `if (!user)` to `if (authError || !user)`, the existing
`user: null` test does NOT cover the new `authError` branch. Both need separate test cases:
- `user: null, no error` — the original unauthenticated test
- `user: null, error: { message: '...' }` — the new authError test

The two cases produce the same output (`{ success: false, error: 'Not authenticated' }` or
equivalent) but exercise different code paths and should both be present. When reviewing a
diff that adds `error: authError` destructuring alongside a `getUser()` call, grep the test
file for `error:` to confirm both branches are covered.

For `fetchQuestionStats` specifically the error path throws (`throw new Error('Auth error...')`)
instead of returning a result object — the test must use `rejects.toThrow()`.

For `proxy.ts`, when `authError` is present but user is null, the proxy logs the error and
falls through to the normal `!user` redirect guard. Tests should assert:
1. `/app/*` route redirects to `/` even when authError present
2. `/` route falls through (returns session response) when authError present — NOT redirected to dashboard
3. `console.error` called with `'[proxy] getUser error:'` prefix

---

## Files tested in latest commit (in-flight guard + nav-guard condition)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/_hooks/use-session-state.ts` | `use-session-state.test.ts` | **NEW** — 11 tests: initial state, submit happy path, submit throw, submit failure, concurrent double-click guard, advance to next question, complete transition, double-handleNext in-flight guard, onComplete throw, onComplete failure, retry after failure |
| `apps/web/app/app/quiz/session/_hooks/use-quiz-state.ts` | `use-quiz-state.test.ts` | **EXTENDED** — +4 nav-guard tests: guard inactive on empty answers, guard active after new answer, guard inactive with only pre-loaded answers (initialSize), guard active when new answers exceed initialSize |

### handleNext in-flight guard: test pattern
When `handleNext` uses `submittingRef.current` to block re-entrant completion calls,
test with a deferred promise so both calls can be in-flight simultaneously:

```ts
it('does not call onComplete a second time when handleNext is called twice concurrently', async () => {
  let resolveComplete!: (value: CompleteResult) => void
  onComplete.mockImplementationOnce(
    () => new Promise<CompleteResult>((resolve) => { resolveComplete = resolve }),
  )

  await act(async () => result.current.handleSubmit('opt-a'))

  await act(async () => {
    const p1 = result.current.handleNext()
    const p2 = result.current.handleNext()
    resolveComplete(COMPLETE_SUCCESS)
    await Promise.all([p1, p2])
  })

  expect(onComplete).toHaveBeenCalledTimes(1)
  expect(result.current.state).toBe('complete')
  expect(result.current.submitting).toBe(false)
})
```

Key: `submitting` must be `false` after the guard sequence completes — the reset is tested
at each exit path (throw, failure result, success).

### Navigation guard condition: asserting useNavigationGuard call argument
`useNavigationGuard` is a `vi.fn()`. Import the mocked version after the `vi.mock()` call
and cast to `MockInstance` to read `.mock.calls`:

```ts
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { type MockInstance } from 'vitest'
// ...
const navGuardMock = useNavigationGuard as unknown as MockInstance
const lastCall = navGuardMock.mock.calls[navGuardMock.mock.calls.length - 1]
expect(lastCall?.[0]).toBe(false)  // or true
```

The guard condition changed from `answers.size > 0` to `answers.size > initialSize`. Tests:
1. No answers → guard is `false` (unchanged from old behaviour)
2. New answer added → guard is `true` (unchanged from old behaviour)
3. Mounted with pre-loaded answers only → guard is `false` (NEW — was `true` before)
4. Pre-loaded + one new → guard is `true` (NEW — tests the boundary between old and new)

Test (3) is the regression test for the changed condition: mounting with `initialAnswers`
should not activate the guard until the user adds a new answer in the current session.

### Suite state after this commit
2 files (1 new, 1 extended). New: 11 tests. Extended: +4 tests. Running total: ~80 test files, ~762 tests.

## vi.fn Generic Typing — Vitest v4 Syntax (RULE ADDED 2026-03-15)

**Background:** This project uses Vitest 4.x. The old two-argument generic form (`vi.fn<[ArgTypes], ReturnType>()`) was deprecated in Vitest 3 and removed in Vitest 4. Generated test code that uses the old form will fail `pnpm check-types` and block the pre-commit hook.

**Rule:** Always use the single function-type argument form:

```ts
// ❌ WRONG — deprecated two-argument form (Vitest ≤3, removed in v4)
const onSubmit = vi.fn<[SubmitInput], Promise<AnswerResult>>()
const fn = vi.fn<[string, number], void>()

// ✅ CORRECT — single function-type argument (Vitest v4)
const onSubmit = vi.fn<(input: SubmitInput) => Promise<AnswerResult>>()
const fn = vi.fn<(s: string, n: number) => void>()
```

For simple callbacks with no complex typing, plain `vi.fn()` is fine — only add generics when the type must be explicit for assertion correctness:

```ts
// ✅ also fine — no generics needed when the mock's type is inferred
const onSuccess = vi.fn()
```

**When it matters:** When a test passes the mock as a typed parameter (e.g., a Server Action prop typed as `(input: X) => Promise<Y>`) and TypeScript needs to verify the shape. In those cases use the v4 single-arg form above.

**Origin:** Pattern recurred in 9ea234b (2026-03-14, use-session-state.test.ts) and 69273cf (2026-03-15, session-operations.test.ts). Both commits required orchestrator correction before type-check passed. Rule added on second occurrence.

---

## Testing Base UI Dialog.Popup aria-label (2026-03-15)

`@base-ui/react/dialog`'s `Dialog.Popup` renders as `<div role="dialog">` in jsdom. When an `aria-label` prop is added to the popup, assert it with `getByRole('dialog')` + `toHaveAttribute`:

```tsx
// Source: Dialog.Popup aria-label={`Zoomed image: ${alt}`}
it('dialog popup carries an aria-label that includes the image alt text', () => {
  render(<ZoomableImage src="/test.png" alt="Runway diagram" />)
  fireEvent.click(screen.getByAltText('Runway diagram'))
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveAttribute('aria-label', 'Zoomed image: Runway diagram')
})
```

The dialog is only in the DOM when open — always trigger the open action before querying `getByRole('dialog')`. No need to mock `@base-ui/react/dialog`; it renders correctly in jsdom.

**Origin:** Commit b0de349 (2026-03-15) — ARIA accessible names added to ZoomableImage and MobileNav dialogs.

---

## Files created in latest commit (admin syllabus actions + queries)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/admin/syllabus/actions/upsert-subject.ts` | `actions/upsert-subject.test.ts` | 10 tests: Zod validation, insert happy path, insert 23505 duplicate, insert generic error, update happy path, update error, requireAdmin throw propagation |
| `apps/web/app/app/admin/syllabus/actions/upsert-topic.ts` | `actions/upsert-topic.test.ts` | 10 tests: same structure, topic-specific duplicate message |
| `apps/web/app/app/admin/syllabus/actions/upsert-subtopic.ts` | `actions/upsert-subtopic.test.ts` | 10 tests: same structure, subtopic-specific duplicate message |
| `apps/web/app/app/admin/syllabus/actions/delete-item.ts` | `actions/delete-item.test.ts` | 9 tests: Zod validation (missing, bad UUID, disallowed table), delete all 3 tables, FK violation (23503), generic error, requireAdmin throw |
| `apps/web/app/app/admin/syllabus/queries.ts` | `queries.test.ts` | 6 tests: empty DB, full tree with counts, zero counts, topic scoping, empty topics array, null data fallback |

### Mocking requireAdmin in Server Action tests
Admin Server Actions call `requireAdmin()` which wraps both auth and role check. Mock it at
the module level and resolve with `{ supabase: { from: mockFrom }, userId: 'admin-1' }`.
For auth-failure tests, make it reject:

```ts
const mockRequireAdmin = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// Happy path setup helper:
function mockAdminWithResult(leafResult: { error: ... | null }) {
  const chain = buildChain(leafResult)
  mockFrom.mockReturnValue(chain)
  mockRequireAdmin.mockResolvedValue({ supabase: { from: mockFrom }, userId: 'admin-1' })
  return chain
}

// Auth guard test:
it('propagates the error when requireAdmin throws', async () => {
  mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))
  await expect(upsertSubject(validInput)).rejects.toThrow('Forbidden: admin role required')
})
```

This is simpler than mocking Supabase + auth chain separately, because requireAdmin is already tested in isolation.

### Upsert Server Action chain: insert vs update paths
The upsert pattern (no-id → insert, with-id → update) needs separate chain mocks because
`insert()` resolves directly while `update()` returns an object with `eq()` that resolves:

```ts
function buildChain(leafResult: { error: ... | null }) {
  return {
    insert: vi.fn().mockResolvedValue(leafResult),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(leafResult),
    }),
  }
}
```

To test the update path, pass a valid UUID in the `id` field.
To test the insert path, omit `id`.

### queries.ts: parallel Promise.all with mixed chain endings
`getSyllabusTree` runs 4 parallel queries in `Promise.all`. Three end in `.order()`, one
(questions) ends in `.select()` with no `.order()`. Use two distinct helper functions:

```ts
// For .from().select().order() queries
function makeOrderedChain(data: unknown[]) {
  const chain = {
    select: vi.fn(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
  }
  chain.select.mockReturnValue(chain)
  return chain
}

// For .from().select() queries (no .order())
function makeSelectOnlyChain(data: unknown[]) {
  return {
    select: vi.fn().mockResolvedValue({ data, error: null }),
  }
}
```

Sequence via `mockReturnValueOnce` in the same order as the source's `Promise.all` array.
The call order is: easa_subjects (ordered) → easa_topics (ordered) → easa_subtopics (ordered) → questions (select-only).

### Suite state after these files
50 test files, ~490 tests — all passing.

---

## Files extended in latest commit (authError propagation — lookup + use-filtered-count + use-quiz-config)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/quiz/_hooks/use-filtered-count.ts` | `use-filtered-count.test.ts` | +2: `isFilterPending` cleared after auth error (`.finally()` path); stale auth error dropped by generation guard |
| `apps/web/app/app/quiz/_hooks/use-quiz-config.ts` | `use-quiz-config.test.ts` | +3: `authError` is false by default; `authError` is true when fc reports auth error; clears when fc clears |

### Stale auth error: dropped by generation guard (2026-03-20)
When a hook's stale-fetch guard (`gen !== filterGeneration.current`) fires before the
auth error branch, the auth error must be silently ignored. Test with the same deferred-promise
pattern as the normal stale-fetch test, but resolve the stale promise with an auth error result:

```ts
it('does not set authError when a stale fetch returns an auth error', async () => {
  let resolveFirst!: (v: unknown) => void
  const firstFetch = new Promise((res) => { resolveFirst = res })
  mockGetFilteredCount
    .mockReturnValueOnce(firstFetch)
    .mockResolvedValueOnce({ count: 5, byTopic: {}, bySubtopic: {} })

  const { result } = renderHook(() => useFilteredCount())
  act(() => { result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen']) })
  await act(async () => { result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['incorrect']) })
  // Second fetch won — stale first fetch now resolves with auth error
  await act(async () => { resolveFirst({ count: 0, byTopic: {}, bySubtopic: {}, error: 'auth' }) })

  expect(result.current.authError).toBe(false)  // stale result was ignored
  expect(result.current.filteredCount).toBe(5)  // second result preserved
})
```

Key: the generation guard fires BEFORE the `result.error === 'auth'` check in the `.then()` body.
Both conditions live inside the same `then` callback — generation check is first, so a stale
auth error never reaches the `setAuthError(true)` call.

### isFilterPending cleared after auth error (.finally() path)
The `.finally()` block always fires regardless of which branch the `.then()` took. Test this
explicitly — it is observable state that distinguishes "auth error but fetch finished" from
"auth error mid-flight":

```ts
it('clears isFilterPending after an auth error response', async () => {
  mockGetFilteredCount.mockResolvedValue({ count: 0, byTopic: {}, bySubtopic: {}, error: 'auth' })
  const { result } = renderHook(() => useFilteredCount())
  await act(async () => { result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen']) })
  expect(result.current.isFilterPending).toBe(false)  // .finally() fired
  expect(result.current.authError).toBe(true)         // .then() set the error
})
```

### authError passthrough in wrapper hooks
When a hook delegates to another hook and passes through a field (e.g., `authError: fc.authError`),
the passthrough must be tested at the wrapper level even though the delegate has its own tests.
Three cases cover the contract completely:
1. Default: wrapper returns `false` when delegate returns `false`
2. Propagation: wrapper returns `true` when delegate returns `true`

### Mocking Base UI Collapsible + CollapsibleTrigger (2026-03-20)
The shadcn Collapsible uses Base UI under the hood and accepts a `render` prop (not an
`asChild` prop). When mocking, forward the `aria-label` from that render prop to keep
aria assertions working:

```tsx
vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, open }: { children: React.ReactNode; open: boolean; onOpenChange: (v: boolean) => void }) => (
    <div data-testid="collapsible" data-open={open}>{children}</div>
  ),
  CollapsibleTrigger: ({ children, render: renderProp }: { children: React.ReactNode; render?: React.ReactElement }) => {
    const label =
      renderProp && 'props' in renderProp
        ? (renderProp.props as { 'aria-label'?: string })['aria-label']
        : undefined
    return (
      <button type="button" data-testid="collapsible-trigger" aria-label={label}>
        {children}
      </button>
    )
  },
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="collapsible-content">{children}</div>
  ),
}))
```

### Testing Server Action success/error/throw paths in a client component (2026-03-20)
Pattern for components that call Server Actions inside `startTransition`:
1. Mock the action module via `vi.hoisted` + `vi.mock`.
2. Mock `sonner` toast to capture `toast.success` / `toast.error` calls.
3. Trigger the action via a user click; `act()` wrapping is implicit via `userEvent`.
4. Three assertions per action: success toast shown + view updated, error value surfaced, thrown error falls to generic message.

```tsx
const { mockUpsertSubject } = vi.hoisted(() => ({ mockUpsertSubject: vi.fn() }))
vi.mock('../actions/upsert-subject', () => ({ upsertSubject: mockUpsertSubject }))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: mockToastSuccess, error: mockToastError } }))

it('shows a success toast on update', async () => {
  mockUpsertSubject.mockResolvedValue({ success: true })
  // ... render + click
  expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('updated'))
})

it('shows an error toast when the action returns an error', async () => {
  mockUpsertSubject.mockResolvedValue({ success: false, error: 'Code already exists' })
  // ...
  expect(mockToastError).toHaveBeenCalledWith('Code already exists')
})

it('shows a generic error toast when the action throws', async () => {
  mockUpsertSubject.mockRejectedValue(new Error('Network failure'))
  // ...
  expect(mockToastError).toHaveBeenCalledWith('Service error. Please try again.')
})
```
3. Recovery: wrapper returns `false` again when delegate is updated to `false` (via `rerender()`)

---

## Files tested in commit for comments + flag actions (2026-03-20)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/actions/comments.ts` | `actions/comments.test.ts` | **NEW** — 20 tests: `getComments` (empty array when unauthenticated, Zod validation, happy path, DB error); `createComment` (auth error, Zod for empty/too-long body, happy path, DB error); `deleteComment` (auth error, Zod, happy path, DB error) |
| `apps/web/app/app/quiz/actions/flag.ts` | `actions/flag.test.ts` | **NEW** — 29 tests: `toggleFlag` (auth, Zod, flag-on path, flag-off path, soft-delete verification, error on upsert, error on update); `getFlaggedIds` (empty list when unauthenticated/authError, Zod, happy path with subset/none/all, empty array input, table query, DB error) |

### Suite state after this commit
101 test files, 1146 tests — all passing (was 99 files / 1097 tests).

### Sequential from() calls within a single action (flag toggle pattern)
`toggleFlag` calls `from('flagged_questions')` twice: first for a `.maybeSingle()` check,
second for either `.upsert()` (flag-on) or `.update()` (flag-off). Use a per-call counter
to route the two sequential calls to different return values:

```ts
function setupSequentialFromCalls(firstValue: unknown, secondValue: unknown) {
  let callCount = 0
  mockFrom.mockImplementation(() => {
    callCount++
    return callCount === 1 ? buildChain(firstValue) : buildChain(secondValue)
  })
}

// flag-on (not currently flagged): maybeSingle returns null, upsert succeeds
setupSequentialFromCalls({ data: null, error: null }, { error: null })

// flag-off (currently flagged): maybeSingle returns existing row, update succeeds
setupSequentialFromCalls({ data: { student_id: USER_ID }, error: null }, { error: null })
```

This is simpler than the table-name switch pattern when both calls use the SAME table
but represent distinct query phases within one action.

### getComments: empty list on unauthenticated (not an error)
`getComments` returns `{ success: true, comments: [] }` (not a failure) when no user is
signed in. This is unlike `createComment` / `deleteComment` which return `{ success: false }`.
Read the exact production code branch before writing the assertion — do not assume all
auth failures produce `{ success: false }`.

### deleteComment uses hard DELETE (not soft-delete)
`deleteComment` calls `.delete().eq('id', ...)` with no `deleted_at` update.
This is intentional — the `question_comments` table is hard-deleted by design.
The test confirms the `question_comments` table is targeted but does NOT assert
soft-delete behavior (which would be wrong for this table).

---

## Files tested in latest commit (use-comments hook + comments-tab rewrite + explanation-tab LO box)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/session/_hooks/use-comments.ts` | `_hooks/use-comments.test.ts` | **NEW** — 14 tests: initial load (comments, failure, throw, loading state), questionId changes (clears + re-fetches, stale-fetch guard, error cleared), addComment (success appends, failure sets error), removeComment (optimistic remove, returns false + reloads on failure, optimistic visible before server responds) |
| `apps/web/app/app/quiz/_components/comments-tab.tsx` | `_components/comments-tab.test.tsx` | **REWRITTEN** — 18 tests covering rewritten component (was 1 placeholder test) |
| `apps/web/app/app/quiz/_components/explanation-tab.tsx` | `_components/explanation-tab.test.tsx` | **EXTENDED** — +3 tests for `learningObjective` prop (provided, omitted, null) |

### Suite state after this commit
103 test files, 1209 tests (was 103/1209 — no file count change since existing files were extended/rewritten in place).
New tests: 35 (14 in use-comments.test.ts, +17 in comments-tab.test.tsx, +3 in explanation-tab.test.tsx, -1 old placeholder).

### removeComment: setError(result.error) is immediately cleared by loadComments()
`removeComment` calls `setError(result.error)` then immediately calls `loadComments()`.
`loadComments()` begins with `setError(null)` — this synchronous call clears the error
before `act()` flushes state. The transient error is NOT observable after `act()` resolves.

**What IS observable:**
1. `ok` return value is `false`
2. `mockGetComments` was called a second time (the reload)
3. comments are restored from the server

**Do NOT assert `result.current.error` after removeComment failure.** It will be `null`
(cleared by the reload's `setError(null)`) even though an error was set transiently.

This is different from `addComment` failure, where there is no reload — the error persists.

### CommentsTab: mocking useComments as a whole hook
`CommentsTab` calls `useComments(questionId)`. Mock the entire hook to control `comments`,
`isLoading`, `error`, `addComment`, and `removeComment` independently per test:

```ts
const { mockUseComments } = vi.hoisted(() => ({
  mockUseComments: vi.fn(),
}))

vi.mock('../session/_hooks/use-comments', () => ({
  useComments: (...args: unknown[]) => mockUseComments(...args),
}))

// In beforeEach:
mockUseComments.mockReturnValue(defaultHookState())
```

This avoids re-wiring the hook's own action mocks in component tests. Tests that need
specific states (e.g., loading, error, comments list) just call `mockUseComments.mockReturnValue(...)`.

### CommentsTab: full_name null → name falls back to 'Unknown', not '?'
The component does `const name = c.users?.full_name ?? 'Unknown'` BEFORE calling `getInitials(name)`.
So when `full_name` is null, `name` is `'Unknown'` (not null), and `getInitials('Unknown')` returns `'U'`.
The `'?'` sentinel in `getInitials` is only reachable if `null` is passed directly — which never
happens through the component. Do not write a test asserting `'?'` initials.

### CommentsTab: Enter-key submit uses onKeyDown, not form submit
The input uses `onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}`.
Use `userEvent.type(input, 'text{Enter}')` to trigger it — userEvent fires keydown events.
Do NOT use `fireEvent.submit` or rely on form submission (there is no `<form>` element).

### CommentsTab: the Post button is disabled when body is blank
The button has `disabled={!body.trim() || submitting}`. With an empty input,
`mockAddComment` is not called even if the button is clicked via `userEvent.click()`.
Assert `expect(mockAddComment).not.toHaveBeenCalled()` to confirm the guard fires.

---

## Files tested in latest commit (use-flagged-questions + quiz-controls rewrite)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/quiz/session/_hooks/use-flagged-questions.ts` | `use-flagged-questions.test.ts` | New — 12 tests: empty array no-op, populated fetch, failure leaves state empty, same-ref skip, new-ref re-fetch, isFlagged, toggleFlag add/remove/failure/multiple |
| `apps/web/app/app/quiz/session/_components/quiz-controls.tsx` | `quiz-controls.test.tsx` | New — 20 tests: Flag/Unflag label, aria-pressed, active CSS class, callbacks, dialog open/closed, dialog callbacks |

### Stable array references in hooks that use reference-equality guards
When a hook uses `if (prevIdsRef.current === questionIds) return` to skip re-fetching on
the same reference, passing inline array literals in tests (`useFlaggedQuestions([Q1])`)
creates a new reference on every render, causing the effect to fire in an infinite loop.

**Rule:** always declare array fixtures as module-level `const` so the reference is stable
across re-renders:

```ts
// ✅ CORRECT — stable reference
const IDS_Q1 = [Q1]
const IDS_Q1_Q2 = [Q1, Q2]
renderHook(() => useFlaggedQuestions(IDS_Q1))

// ❌ WRONG — new reference every render → infinite re-fetch loop
renderHook(() => useFlaggedQuestions([Q1]))
```

This is not a hook bug — it is the intended behaviour (consumers are expected to pass a
stable memoized array). The test must match the intended usage contract.

### Waiting for "failure path does not update state" in hooks with useTransition
When a hook calls an async action inside `startTransition` and only updates state on
`result.success === true`, there is no observable state change to `waitFor` on the
failure path. Use `waitFor(() => expect(mockAction).toHaveBeenCalledOnce())` as the
synchronisation point — this confirms the async work ran before asserting on state:

```ts
it('leaves state unchanged when action returns failure', async () => {
  mockGetFlaggedIds.mockResolvedValue({ success: false, error: 'Failed' })

  const { result } = renderHook(() => useFlaggedQuestions(IDS_Q1_Q2))

  await waitFor(() => {
    expect(mockGetFlaggedIds).toHaveBeenCalledOnce()
  })

  // Now safe to assert — the async transition settled
  expect(result.current.flaggedIds.size).toBe(0)
})
```

### Mocking FinishQuizDialog in QuizControls tests
`FinishQuizDialog` has its own test file. Mock it with a minimal shim that:
1. Returns `null` when `open === false` (matching the real behaviour)
2. Renders a named `data-testid` + callback buttons when `open === true`
3. Passes through all callbacks so they can be asserted

```tsx
vi.mock('../../_components/finish-quiz-dialog', () => ({
  FinishQuizDialog: ({ open, onSubmit, onCancel, onSave, onDiscard }) =>
    open ? (
      <div data-testid="finish-dialog">
        <button type="button" onClick={onSubmit}>Submit Quiz</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={onSave}>Save for Later</button>
        <button type="button" onClick={onDiscard}>Discard Quiz</button>
      </div>
    ) : null,
}))
```

The mock must NOT be placed inside `vi.hoisted` since it references no hoisted variables.
Declare it at module scope as a plain `vi.mock()` factory.

---

## Files tested in commit 75acdaf (dashboard redesign + heatmap navigation + lookup bail fix)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/dashboard/_components/info-tooltip.tsx` | `info-tooltip.test.tsx` | **NEW FILE** — 9 tests: aria-label, hidden before interaction, shows on click, toggle close, title/description rendering, close on outside click, three align variants |
| `apps/web/app/app/dashboard/_components/activity-heatmap.tsx` | `activity-heatmap.test.tsx` | Extended — 8 navigation tests: prev month header, correct day count for Feb, round-trip navigation, forward button disabled at current month, enabled in past month, no today-ring in past month, activity data shown in navigated month |
| `apps/web/app/app/quiz/_hooks/use-quiz-config.ts` | `use-quiz-config.test.ts` | Extended — 2 tests: `setFilters(['all'])` calls `fc.reset()`; `setFilters(['incorrect'])` does NOT call `fc.reset()` |
| `apps/web/app/app/quiz/actions/lookup.ts` | `lookup.test.ts` | Extended — 3 tests for new AND-bail semantics: `topicIds: []` alone does NOT bail; `subtopicIds: []` alone does NOT bail; both empty bails |

### HeatmapInfo (heatmap-info.tsx) — pure presenter, no tests needed
`HeatmapInfo` is a pure wrapper with no props, no state, no logic — just renders `InfoTooltip`
with fixed strings. Skipped per rule: do not flag missing tests on pure presenter components.

### ActivityHeatmap navigation tests — navigation drives UI via fireEvent.click
Month navigation is driven by clicking the Previous/Next month buttons with `fireEvent.click`.
The header `<h3>` text changes synchronously after the click (state → re-render). Use
`screen.getByText('February 2026')` to assert the new month:
```tsx
fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
expect(screen.getByText('February 2026')).toBeInTheDocument()
```

### lookup.ts bail logic — AND semantics require testing both "one empty" cases
The changed guard `if (!hasTopics && !hasSubtopics)` requires three tests:
1. `topicIds: []`, `subtopicIds: undefined` — `hasSubtopics = true` → no bail, query runs
2. `topicIds: undefined`, `subtopicIds: []` — `hasTopics = true` → no bail, query runs
3. `topicIds: []`, `subtopicIds: []` — both false → bail, returns empty

For cases 1 and 2, mock `mockFrom` to return a chain with data — the test asserts `count > 0`
to prove the query ran. Do not assert `count: 0` for the no-bail cases or the test becomes
fragile (depends on mock data rather than guard logic).

### InfoTooltip close-on-outside-click — use fireEvent with bubbles:true
The `onClickOutside` listener is registered on `document` with capture phase (`addEventListener(..., true)`).
In jsdom, `fireEvent.click(element, { bubbles: true })` correctly propagates through the
capture listener. The container `div` has a ref check (`!ref.current.contains(target)`),
so clicking outside the component's root `div` triggers the close:
```tsx
const trigger = screen.getByRole('button', { name: 'What does this mean?' })
fireEvent.click(trigger)  // opens
fireEvent.click(screen.getByRole('button', { name: 'Outside' }), { bubbles: true })  // closes
```
The outside element must be rendered in the same `render()` call to be in the same document.

### Suite state after commit 75acdaf
112 test files, 1360 tests — all passing.

---

## Files extended in latest commit (quiz session layout + answer-options callback + flag RLS fix)

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/_components/answer-options.tsx` | `answer-options.test.tsx` | +11 tests: `onSelectionChange` callback (fires on click, skipped when disabled/showResult, optional), `showResult` requires BOTH props (correctOptionId null → Submit still shown + no result styling, both set → Submit hidden) |
| `apps/web/app/app/quiz/session/_components/quiz-main-panel.tsx` | `quiz-main-panel.test.tsx` | +2 tests: `onSelectionChange` forwarded to AnswerOptions on question tab; callback absent when non-question tab renders QuizTabContent |
| `apps/web/app/app/quiz/session/_components/quiz-session.tsx` | `quiz-session.test.tsx` | +2 tests: desktop QuizControls always has showSubmit=false; option click triggers checkAnswer |

### Changes with no new tests needed
- `apps/web/app/app/quiz/_components/question-grid.tsx` — existing tests already cover filter row, mobile collapse/expand, and desktop rendering. This commit added ResizeObserver measurement + filter pills (all already tested).
- `apps/web/app/app/quiz/_components/question-tabs.tsx` — label rename "Statistics" → "Stats" already reflected in existing test (`'Stats'`).
- `apps/web/app/app/quiz/session/_components/quiz-controls.tsx` — `showSubmit` prop + `icon` forwarding already tested.
- `apps/web/app/app/quiz/session/_components/quiz-main-panel.tsx` — `onSelectionChange` forwarding now tested.
- `apps/web/app/app/quiz/actions/flag.ts` — only added `.is('deleted_at', null)` (explicit soft-delete filter); all existing test paths exercise the same code branches. No logic change.
- `apps/web/app/app/quiz/session/layout.tsx` — pure layout (className change); no logic.
- `supabase/migrations/20260323000050_fix_flagged_unflag_rls.sql` — DB migration; covered by integration tests.

### onSelectionChange mock pattern in parent component tests
When a child component that accepts `onSelectionChange` is mocked in a parent's test file,
update the mock to both store the forwarded callback AND expose a way to invoke it from tests:

```tsx
const mockAnswerOptionsOnSelectionChange = vi.fn()
vi.mock('@/app/app/_components/answer-options', () => ({
  AnswerOptions: ({
    onSelectionChange,
  }: {
    // ... full type
    onSelectionChange?: (id: string | null) => void
  }) => {
    if (onSelectionChange) {
      mockAnswerOptionsOnSelectionChange.mockImplementation(onSelectionChange)
    }
    return <div data-testid="answer-options" />
  },
}))

// In test:
mockAnswerOptionsOnSelectionChange('opt-x')
expect(onSelectionChange).toHaveBeenCalledWith('opt-x')
```

This confirms identity of the forwarded callback without rendering the real component.

### canSubmitAnswer depends on onSelectionChange — mock must fire both callbacks
When testing a parent component that wires `onSelectionChange` into the `AnswerOptions` mock,
the mock's click handler must fire `onSelectionChange` BEFORE `onSubmit` to simulate real
answer-options behaviour (select → then submit separately). If both fire in the same click,
the `existingAnswer` is set immediately after `onSubmit`, making `canSubmitAnswer` false
before any assertion can observe the `true` state.

For quiz-session tests, the pragmatic approach: test `canSubmitAnswer` indirectly by asserting
what happens downstream (checkAnswer is called) rather than asserting the Submit button appears.
The Submit button's visibility is covered by `QuizControls` unit tests (`showSubmit` prop).

### Suite state after this commit
112 test files, 1360 tests — all passing.

---

## Files tested in commit fix/manual-eval-improvements (2026-03-23)

| Source file | Test file | Status |
|---|---|---|
| `quiz-session.tsx` | `quiz-session.test.tsx` (extended) | 3 new tests for pendingOptionId clearing |
| `topic-tree-helpers.ts` | `topic-tree-helpers.test.ts` (extended) | 11 new tests for `calcFilteredAvailable` |
| `quiz-config-handlers.ts` | `quiz-config-handlers.test.ts` (new) | 11 tests, full coverage |
| `question-grid.tsx` | `question-grid.test.tsx` (extended) | 4 new tests for effectiveFilter fallback |

Suite after: 113 test files, 1389 tests — all passing.

### Separating onSelectionChange from onSubmit in AnswerOptions mock (pendingOptionId tests)

When a parent component has a `pendingOptionId` state driven by `onSelectionChange` alone,
and the existing AnswerOptions mock fires BOTH `onSelectionChange` and `onSubmit` on click
(which immediately sets `existingAnswer`, nullifying `pendingOptionId`'s effect), add
dedicated "select-only" buttons to the mock:

```tsx
// In the AnswerOptions mock, alongside the normal option-{id} buttons:
{options.map((o) => (
  <button
    key={`select-${o.id}`}
    type="button"
    data-testid={`select-btn-${o.id}`}
    onClick={() => onSelectionChange?.(o.id)}
    disabled={disabled}
  >
    Select only {o.text}
  </button>
))}
```

This allows tests to fire `onSelectionChange` without `onSubmit`, making `pendingOptionId`
non-null without setting `existingAnswer`. The test can then:
1. Click `select-btn-{id}` → asserts Submit Answer button appears (showSubmit=true)
2. Navigate → asserts Submit Answer button disappears (pendingOptionId cleared)

Do not change the existing `option-{id}` buttons — they test answer submission. This approach
adds non-breaking capacity to the mock rather than changing existing behavior.

### Testing effectiveFilter fallback via rerender

When a component computes an "effective filter" that falls back when the backing set empties,
test it with `rerender` rather than two separate renders. This avoids filter state being reset
to `'all'` on unmount/remount:

```tsx
// 1. Render with flagged items + select flagged filter
const { rerender } = render(<QuestionGrid flaggedIds={new Set(['q1'])} ... />)
fireEvent.click(screen.getByTestId('filter-flagged'))

// 2. Rerender with empty flaggedIds — effectiveFilter falls back to 'all'
rerender(<QuestionGrid flaggedIds={new Set()} ... />)

// 3. Assert all questions are now visible
expect(desktopBtn(4)).toBeTruthy()
```

Key: the component's internal `filter` state stays `'flagged'` after rerender (because
React preserves state through rerenders), but `effectiveFilter` recomputes to `'all'`
because `flaggedCount === 0`. This correctly tests the guard logic.

### Testing that the collapse toggle is absent when a subset filter is active

`needsCollapse = effectiveFilter === 'all' && totalQuestions > twoRows`. To verify the
toggle does NOT appear when a flagged/pinned filter is active (even with 40 questions):

```tsx
renderGrid({ totalQuestions: 40, questionIds: manyIds, flaggedIds: new Set(['q1']) })
fireEvent.click(screen.getByTestId('filter-flagged'))
expect(screen.queryByTestId('grid-toggle')).not.toBeInTheDocument()
```

---

### Testing multi-state dialog flows (confirm A, confirm B are independent state slices) (2026-03-24)

When a dialog has two independent confirmation flows (e.g. `confirmingSubmit` and
`confirmingDiscard`), verify that:
1. Each flow is entered and exited independently via its own UI.
2. Entering one flow does NOT automatically clear the other (unless the code explicitly
   does so — always verify in source before asserting mutual exclusion).
3. `handleClose` / "Return to Quiz" resets ALL confirmation state at once.

Pattern for testing "submitting" state inside an inline confirmation panel that requires
prior user interaction to reveal:

```tsx
// Step 1 — enter the confirmation flow
const { rerender } = render(<Dialog ... submitting={false} />)
fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }))

// Step 2 — flip submitting to true
rerender(<Dialog ... submitting={true} />)

// Step 3 — assert on the now-visible panel buttons
// Use getAllByRole when multiple elements share the same accessible name
const btns = screen.getAllByRole('button', { name: /submitting\.\.\./i })
expect(btns.length).toBeGreaterThanOrEqual(1)
expect(screen.getByRole('button', { name: /go back/i })).toBeDisabled()
```

Key: `rerender()` preserves component state (including `confirmingSubmit=true`), so the
inline panel stays visible after the `submitting` prop is flipped.

### Testing a never-resolving promise for "in-progress" UI state (2026-03-24)

When you need to assert disabled/loading state while an async operation is in flight:

```ts
let resolveSubmit!: (value: unknown) => void
mockAction.mockImplementation(
  () => new Promise((resolve) => { resolveSubmit = resolve }),
)

// trigger the action, then assert the in-flight UI
fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
await waitFor(() => {
  expect(screen.getByRole('button', { name: 'Finish' })).toBeDisabled()
})

// Always clean up to avoid test teardown warnings
resolveSubmit({ success: true, ... })
```

Always clean up by resolving the promise at the end of the test. Leaving it dangling can
produce act() warnings in subsequent tests.

### Table-switch buildChain for multi-table query functions (2026-03-26)
When a query function calls `supabase.from()` with multiple different table names (e.g.
`users`, `organizations`, `quiz_sessions`, `student_responses`), use a table-name switch
inside `mockFrom.mockImplementation` so each table returns the right shape:

```ts
mockFrom.mockImplementation((table: string) => {
  if (table === 'users')              return buildChain({ data: profileRow, error: null })
  if (table === 'organizations')      return buildChain({ data: orgRow, error: null })
  if (table === 'quiz_sessions')      return buildChain({ data: sessions, error: null })
  if (table === 'student_responses')  return buildChain({ count: 42, data: null })
  return buildChain({ data: null, error: null })
})
```

The Proxy-based `buildChain` (see above) auto-forwards all chaining methods, so this
works regardless of the specific chain the function builds per table.

To test error paths, set the relevant table's `error` field to `{ message: '...' }` and
`data` to `null`. To test the zero-row / missing-data case, set `data: null` with
`error: null` — the production code typically guards `if (error || !data)`.

Used in `lib/queries/profile.test.ts` for `getProfileData()`.

---

## Files tested in consent feature commit (2026-03-27)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/consent/actions.ts` | `actions.test.ts` | Server Action; Zod validation, auth guard, sequential RPC calls (TOS/Privacy/analytics), header forwarding, cookie set, error paths |
| `apps/web/app/consent/_components/consent-form.tsx` | `consent-form.test.tsx` | Client component; checkbox enablement logic, success navigation, server error display, fallback error, error clear on retry |

### Mocking `next/headers` factories that survive `vi.resetAllMocks()` (2026-03-27)

`next/headers` exports two async factory functions: `cookies()` and `headers()`. Each returns
an object with methods (`set`, `get`). The problem: if you mock them with
`vi.fn().mockResolvedValue({ get: mockHeadersGet })`, then `vi.resetAllMocks()` strips
both the factory implementation AND the `mockHeadersGet` return value, leaving
`headers()` returning `undefined` and crashing `headerStore.get(...)`.

**Correct pattern:** hoist ALL mocks (including the factories) via `vi.hoisted`, then
restore each factory's return value inside `beforeEach`:

```ts
const { mockGetUser, mockRpc, mockCookiesSet, mockCookies, mockHeaders } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockCookiesSet: vi.fn(),
  mockCookies: vi.fn(),
  mockHeaders: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}))

// Helper to (re)wire headers() with a fresh get mock after resetAllMocks:
function resetHeadersWithDefaultGet(impl?: (header: string) => string | null) {
  const get = vi.fn().mockImplementation(impl ?? (() => null))
  mockHeaders.mockResolvedValue({ get })
  return get
}

beforeEach(() => {
  vi.resetAllMocks()
  mockCookies.mockResolvedValue({ set: mockCookiesSet })
  resetHeadersWithDefaultGet()
})
```

For tests that need custom header values, call `resetHeadersWithDefaultGet(impl)` inside the test
body — this overwrites the default from `beforeEach` for that test only:

```ts
it('forwards IP and user-agent headers', async () => {
  resetHeadersWithDefaultGet((header) => {
    if (header === 'x-forwarded-for') return '1.2.3.4'
    if (header === 'user-agent') return 'TestAgent/1.0'
    return null
  })
  // ...
})
```

**Key insight:** `vi.mock()` factories capture the hoisted `vi.fn()` reference permanently.
`vi.resetAllMocks()` resets the fn's call history and return value but leaves the reference
intact. Re-calling `mockResolvedValue()` in `beforeEach` restores the implementation for
every test. This is the only way to make `next/headers` mocks survive `resetAllMocks()`.

### Sequential RPC call tests (multiple `mockRpc.mockResolvedValueOnce` calls)

When a Server Action calls the same RPC function multiple times in sequence (e.g., once for
TOS, once for Privacy, once for analytics), use `mockResolvedValueOnce` to control each:

```ts
// TOS succeeds, Privacy fails, analytics never reached:
mockRpc
  .mockResolvedValueOnce({ data: null, error: null })                      // TOS — success
  .mockResolvedValueOnce({ data: null, error: { message: 'db timeout' } }) // Privacy — fail

// Assert cookie was NOT set (execution stopped before cookie write):
expect(mockCookiesSet).not.toHaveBeenCalled()
```

To assert that a specific RPC call type was NOT made, filter `mock.calls` by argument:
```ts
const analyticsCalls = mockRpc.mock.calls.filter(
  (call: [string, Record<string, unknown>]) => call[1]?.p_document_type === 'cookie_analytics',
)
expect(analyticsCalls).toHaveLength(0)
```

### ConsentForm: submit button disabled until BOTH required checkboxes are checked

The `canSubmit = acceptedTos && acceptedPrivacy && !isPending` guard means:
- Only TOS checked → button disabled (test this)
- Only Privacy checked → button disabled (test this)
- Both TOS + Privacy → button enabled
- Analytics is optional; checking/unchecking it does not affect enablement

Testing pattern: render → click one required checkbox → assert disabled; click other → assert enabled.

## Files tested in commit c9caf51 / post-commit for feat/gdpr-consent-gate (2026-03-27)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/consent/_components/consent-checkbox.tsx` | `consent-checkbox.test.tsx` | New file; label htmlFor, link attrs, required indicator, description, checkbox toggle, disabled |
| `apps/web/app/auth/login-complete/route.ts` | `route.test.ts` | Extended: maxAge=31536000 in set-cookie header |
| `apps/web/app/consent/actions.ts` | `actions.test.ts` | Extended: maxAge=31536000 in cookieStore.set call |

## Files tested for CURRENT_ANALYTICS_VERSION / post-commit for feat/gdpr-consent-gate (2026-03-27)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/lib/consent/versions.ts` | `apps/web/app/consent/actions.test.ts` | Extended: asserts `p_document_version: 'v1.0'` passed to analytics RPC call |

### Constant value coverage — ensure named constants flow through to RPC calls

When a named constant (e.g. `CURRENT_ANALYTICS_VERSION`) is added and used as a field value
in an RPC call, add a test that asserts the literal value appears in the RPC payload:

```ts
it('passes the current analytics version constant as p_document_version', async () => {
  // ...setup...
  expect(mockRpc).toHaveBeenCalledWith(
    'record_consent',
    expect.objectContaining({
      p_document_type: 'cookie_analytics',
      p_document_version: 'v1.0',   // CURRENT_ANALYTICS_VERSION
    }),
  )
})
```

This catches partial-constant adoption: the commit that introduced `CURRENT_ANALYTICS_VERSION`
fixed a hardcoded `'v1.0'` literal in `actions.ts` but the existing analytics test only
asserted `p_document_type` and `p_accepted`, leaving `p_document_version` unchecked. A future
version bump would have silently written the wrong version to the audit log with no failing test.

### Asserting set-cookie header Max-Age (route handler cookies)

When a route handler sets a cookie via `response.cookies.set(name, value, { maxAge: N })`, the
header is serialised as `Max-Age=N` (capital M, capital A). Assert with the capitalised form:

```ts
const setCookie = response.headers.get('set-cookie') ?? ''
expect(setCookie).toContain('Max-Age=31536000')
```

Do NOT use lowercase `max-age=...` — the Set-Cookie header uses Pascal-case attribute names.

### Asserting maxAge in Server Action cookie calls (next/headers cookieStore)

When a Server Action calls `cookieStore.set(name, value, options)`, assert the `maxAge` option
using `expect.objectContaining`:

```ts
expect(mockCookiesSet).toHaveBeenCalledWith(
  '__consent',
  'v1.0:v1.0',
  expect.objectContaining({ maxAge: 31_536_000 }),
)
```

### Testing ConsentCheckbox (Base UI checkbox with label association)

`ConsentCheckbox` renders a Base UI `<Checkbox>` (which internally has a hidden `<input>` with
the `id` prop) and a `<label htmlFor={id}>`. Useful assertions:

- `htmlFor` association: `label.closest('label').toHaveAttribute('for', id)`
- Toggle via `getByRole('checkbox')` (Base UI exposes role="checkbox" on the span element)
- Disabled: clicking `getByRole('checkbox')` does not call `onCheckedChange`
- Link placement: `expect(label).toContainElement(link)` to verify structural nesting

The `onClick={e => e.stopPropagation()}` on the link inside the label prevents the label click
from toggling the checkbox in browsers, but this mechanism is NOT accurately modelled in jsdom —
jsdom follows `htmlFor` association regardless of `stopPropagation`. Do NOT write a test
asserting that clicking the link does NOT call `onCheckedChange` — it will be flaky/wrong in jsdom.
Instead, assert structural nesting (`label contains link`) which tests the intent.

### Import production constants — never duplicate literal values (RULE CANDIDATE, 2026-03-27)

When a production module exports a named constant (version string, cookie name, error code, URL
prefix), test files and E2E helpers MUST import the constant rather than duplicating the literal.

```ts
// WRONG — duplicates the literal; test passes even after constant is renamed or value changes
expect(mockRpc).toHaveBeenCalledWith('record_consent',
  expect.objectContaining({ p_document_version: 'v1.0' }))

// CORRECT — imports the constant so any version bump causes the test to assert the new value
import { CURRENT_ANALYTICS_VERSION } from '@/lib/consent/versions'
expect(mockRpc).toHaveBeenCalledWith('record_consent',
  expect.objectContaining({ p_document_version: CURRENT_ANALYTICS_VERSION }))
```

The same rule applies to E2E helpers that seed DB fixtures. Use the exported constant, not
a hardcoded string.

**Why it matters:** duplicated literals are invisible to TypeScript (both are valid strings)
and to Biome. When the constant is bumped, all duplicated literals stay stale. The test
continues to pass, providing false assurance. The production code writes the new value to the
DB; the test is asserting the old value — the regression goes undetected.

**Pattern source:** two occurrences across different commits:
- proxy.test.ts (2026-03-27 consent gate): hardcoded cookie name + value literals
- actions.ts + supabase.ts E2E helper (2026-03-27 PR #385 fix): hardcoded `'v1.0'` version strings

---

### useTransition pending state — second click needs findByRole not getByRole (2026-03-27)

When a component uses `useTransition` and a button label changes during the transition
(e.g. `"Continue"` → `"Saving..."`), after the first submission resolves the transition
may not have fully settled by the time the test asserts. Using `getByRole` on the
button synchronously fails because the button is still labelled `"Saving..."`. Fix by
using `findByRole` (which retries via `waitFor`) to await the button returning to its
idle label before the second interaction:

```tsx
// Fails — transition may not be settled yet
await user.click(screen.getByRole('button', { name: /continue/i }))

// Correct — awaits transition settlement before clicking
const continueButton = await screen.findByRole('button', { name: /continue/i })
await user.click(continueButton)
```

This is specifically needed in "retry after error" test patterns where:
1. First submit triggers a `startTransition` call that sets `isPending = true`
2. The action resolves with an error, `isPending` returns to `false`
3. The button re-enables and re-labels — but `act()` may not have flushed this yet

**Pattern source:** consent-form.test.tsx (2026-03-27 analytics removal commit) — the
"clears a previous error when submitting again" test was broken by this race.

---

## Files tested in GDPR PR3 commit (feat/gdpr-pr3-data-rights)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/lib/gdpr/collect-user-data.ts` | `lib/gdpr/collect-user-data.test.ts` | New — 11 tests: happy path, session answers phase-2, ip_address normalisation, user-not-found error paths |
| `apps/web/app/app/settings/gdpr-actions.ts` | `gdpr-actions.test.ts` | New — 8 tests: auth guard (error + null user), happy path, collectUserData delegation, catch (Error + non-Error thrown) |
| `apps/web/app/app/admin/students/actions/export-student-data.ts` | `actions/export-student-data.test.ts` | New — 10 tests: Zod validation (missing/invalid/non-object), org-scoped lookup (PGRST116/null/generic error), happy path, requireAdmin throw, collectUserData throw |
| `apps/web/app/app/settings/_components/data-export-card.tsx` | `_components/data-export-card.test.tsx` | New — 6 tests: render (heading/button/description), happy path toast, error toast, pending state |
| `apps/web/app/app/admin/students/_components/export-student-dialog.tsx` | `_components/export-student-dialog.test.tsx` | New — 10 tests: render (title/name/email fallback/buttons), happy path (toast + close), error path (toast + no close), cancel, null student guard, pending state |

### Testing functions that accept a Supabase client and fan out Promise.all across 8 tables

When a function runs `Promise.all([supabase.from(t1)..., supabase.from(t2)..., ...])`,
use a Proxy-based chain helper keyed by table name so each awaited chain resolves to the
pre-configured result for that table, without manually chaining `.select()`, `.eq()`, etc.:

```ts
function buildSupabaseClient(tableData: Record<string, { data: unknown; error: unknown }>) {
  function makeChain(result: { data: unknown; error: unknown }) {
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(target, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
        if (prop === 'single') return vi.fn().mockResolvedValue(result)
        return () => new Proxy(target, handler)
      },
    }
    return new Proxy({} as Record<string, unknown>, handler)
  }
  return {
    from: (table: string) => makeChain(tableData[table] ?? { data: [], error: null }),
  } as unknown as SupabaseClient<Database>
}
```

- Cast `as unknown as SupabaseClient<Database>` to satisfy TypeScript without any being used.
- For `.single()` calls (user lookup), the Proxy exposes a dedicated `vi.fn()` mock.
- The Proxy's `then` trap makes the chain itself awaitable, covering `.order()`, `.is()`, `.in()`, etc.
- For the phase-2 query (quiz_session_answers via `.in()`), provide a separate table key.

### Testing the phase-2 "skip when no sessions" branch

`collectUserData` only queries `quiz_session_answers` when sessions exist. Test the skip path
by passing `sessionsData: []` and asserting `result.quiz_answers.length === 0`.

### Mocking anchor element click() to prevent jsdom "navigation" errors

When a component calls `link.click()` on a dynamically created `<a>` to trigger a file download,
jsdom logs "Not implemented: navigation to another Document". Suppress by spying on
`document.createElement` and replacing `.click` on `<a>` elements:

```ts
const originalCreateElement = document.createElement.bind(document)
vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  const el = originalCreateElement(tag)
  if (tag === 'a') {
    Object.defineProperty(el, 'click', { value: vi.fn(), writable: true })
  }
  return el
})
// ...
vi.restoreAllMocks()
```

Call `vi.restoreAllMocks()` after the assertion to clean up for the next test.
Do NOT use `vi.stubGlobal('URL', ...)` pattern alone — the jsdom warning comes from
`link.click()`, not from `URL.createObjectURL`.

### Mocking URL.createObjectURL / revokeObjectURL globally

jsdom does not implement `URL.createObjectURL`. Stub both at module scope:

```ts
vi.stubGlobal('URL', {
  createObjectURL: vi.fn().mockReturnValue('blob:mock'),
  revokeObjectURL: vi.fn(),
})
```

This must be at module scope (not inside `beforeEach`), as `vi.stubGlobal` replaces the
global and stays in place for the entire test file.

### Admin export action: org-scoped lookup chain mock

The `exportStudentData` action chains `.select().eq().eq().single()` for the org-scoped
student lookup. Mock with an explicit nested chain (not a Proxy) since the shape is known:

```ts
function buildStudentLookupChain({ data, error }) {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  })
}
```

The outer `eq` is for `userId`, the inner `eq` is for `organizationId`. PGRST116 is the
"no row returned" error code from PostgREST — test it explicitly since the action has a
dedicated branch for it.

---

## Files tested in commit e38ef8c (heatmap refactor + Daily Progress strip)

| Source file | Test file | Notes |
|---|---|---|
| `apps/web/app/app/dashboard/_components/use-drag-scroll.ts` | `use-drag-scroll.test.ts` | New hook; 11 tests: listener attach/remove, null-ref safety, drag scroll, pointer-up stop, wheel translate, clamp min/max, no-overflow guard |
| `apps/web/app/app/dashboard/_components/heatmap-header.tsx` | `heatmap-header.test.tsx` | New presenter with conditional disable logic; 8 tests: heading, month name (long+short), back/forward callbacks, disabled states at limits, both enabled |
| `apps/web/app/app/dashboard/_components/stat-cards.tsx` | `stat-cards.test.tsx` | Extended: 2 new tests for singular/plural streak ("1 day" vs "0 days") |

### Testing DOM event-listener hooks (useDragScroll pattern)

When a hook attaches/removes raw DOM event listeners via `useEffect`, test it by
creating a real `HTMLDivElement`, appending it to `document.body`, and asserting on
`addEventListener`/`removeEventListener` spy calls:

```ts
let el: HTMLDivElement

beforeEach(() => {
  el = document.createElement('div')
  Object.defineProperties(el, {
    scrollWidth: { value: 500, configurable: true },
    clientWidth: { value: 200, configurable: true },
    offsetLeft: { value: 0, configurable: true },
    scrollLeft: { value: 0, writable: true, configurable: true },
  })
  document.body.appendChild(el)
})

afterEach(() => { document.body.removeChild(el) })
```

Key points:
- `scrollLeft` needs `writable: true` so assertions can read mutations
- `scrollWidth`/`clientWidth` need to differ to simulate scroll overflow; set equal to test the no-overflow guard
- Redefine `scrollWidth` inside the specific test that needs it via another `Object.defineProperty` call (configurable: true enables this)
- Pass the element as `{ current: el }` cast to `RefObject<T>` — do NOT use `createRef()` which starts with `current: null`
- For "null ref" test, use `createRef<HTMLDivElement>()` which starts null — just assert `.not.toThrow()`

### Dispatching PointerEvents in jsdom

jsdom supports `PointerEvent` but requires `pointerId` in the init dict for `setPointerCapture` to not throw:
```ts
el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pageX: 100, pointerId: 1 }))
el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pageX: 80, pointerId: 1 }))
```
The `bubbles: true` flag is needed for events dispatched on a child to reach parent handlers.

### Singular/plural tests for streak-style counters

Always test exactly `1` (singular) and `0` (plural) separately — they are different
code paths: `count === 1 ? 'day' : 'days'`. A test using `currentStreak: 12` only covers
the plural branch; `currentStreak: 1` covers the singular branch.

```ts
it('displays "1 day" (singular) when currentStreak is exactly 1', () => {
  render(<StatCards {...BASE_PROPS} currentStreak={1} />)
  expect(screen.getByText('1 day')).toBeInTheDocument()
})
it('displays "0 days" (plural) when currentStreak is 0', () => {
  render(<StatCards {...BASE_PROPS} currentStreak={0} />)
  expect(screen.getByText('0 days')).toBeInTheDocument()
})
```

---

## Files extended in commit d20f02d (batch pagination + sort cleanup, 2026-04-04)

All commit-touched files already shipped tests. Three gaps identified and filled post-review:

| Source file | Test file | Tests added |
|---|---|---|
| `apps/web/app/app/reports/_components/reports-content.tsx` | `reports-content.test.tsx` | +3 tests: redirect path when page > totalPages; redirect preserves non-default sort/dir params; totalCount forwarded to ReportsList |

### Gaps that were already covered
- `lib/queries/reports.ts` — `getSessionReports` pagination, sort, all error paths: covered
- `lib/queries/quiz-report.ts` — `getQuizReportSummary` summary split, answeredCount from count query: covered
- `lib/queries/quiz-report-questions.ts` — `getQuizReportQuestions` pagination, auth, session ownership, RPC, fallbacks: covered
- `lib/utils/parse-page-param.ts` — all branches including boundary values: covered
- `app/app/_components/pagination-bar.tsx` — `buildPageNumbers`, `buildPageItems`, `PaginationBar` rendering, navigation, entityLabel: covered
- `app/app/reports/_components/reports-list.tsx` — sort toggles, URL-driven sort, reset to page 1 on sort change: covered
- `app/app/quiz/report/_components/question-breakdown.tsx` — server-side pagination props, page-offset global indexing: covered
- `app/app/quiz/report/_components/report-card.tsx` — prop shape change (summary + questions split): covered
- `app/app/quiz/report/_components/result-summary.tsx` — prop rename (report → summary): covered
- `app/app/quiz/actions/filter-helpers.ts` — `active_flagged_questions` view rename: covered
- `app/app/quiz/actions/flag.ts` — `active_flagged_questions` view rename: covered
- `lib/gdpr/collect-user-data.ts` — `active_flagged_questions` view rename: covered

### Testing next/navigation redirect in server components
`redirect()` from `next/navigation` is a Next.js internal that throws a special object
normally. In tests, mock it with `vi.hoisted` and assert it was called:

```ts
const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

// In the test:
await ReportsContent({ page: 5, sort: 'date', dir: 'desc' })
expect(mockRedirect).toHaveBeenCalledWith('/app/reports')
```

The `redirect()` mock must be wired via `vi.hoisted` (not inline `vi.fn()`) so the reference
is capturable for assertions. An inline `vi.mock(() => ({ redirect: vi.fn() }))` creates a
mock you cannot reference outside the factory.

### ReportsContent redirect URL construction
The redirect URL omits `sort` and `dir` when they are the default values (`sort='date'`, `dir='desc'`).
`page` is also omitted when `totalPages <= 1`. Test these omissions explicitly:

- `page=3`, `sort='date'`, `dir='desc'`, `totalCount=5` → redirect to `/app/reports` (no params)
- `page=5`, `sort='score'`, `dir='asc'`, `totalCount=25` → redirect contains `sort=score`, `dir=asc`, `page=3`

### Suite state after this commit
184 tests across 11 commit-touched test files — all passing (+3 new tests).

