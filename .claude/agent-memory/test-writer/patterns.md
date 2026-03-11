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
