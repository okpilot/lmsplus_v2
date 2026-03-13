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

const { rerender } = render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
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
