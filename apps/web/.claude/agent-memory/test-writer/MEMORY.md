# test-writer MEMORY

## Durable conventions

- **`vi.hoisted` + `vi.mock` pattern** — always hoist mock factories before the `vi.mock()` call; import the module under test AFTER all `vi.mock()` calls. See `study-queries.test.ts` or `reports.test.ts` for the standard shape.
- **`buildChain` proxy helper** — use for Supabase fluent-chain mocking (queue/shift pattern) when a helper makes multiple sequential chained calls on the same table. See `quiz-report-questions.test.ts`.
- **`vi.resetAllMocks()` in `beforeEach`** — mandatory in every test file. `restoreMocks: true` is set globally in both vitest configs; do NOT add `afterEach(vi.restoreAllMocks())` nets.
- **No `afterEach(vi.restoreAllMocks())`** — `restoreMocks: true` in `vitest.config.ts` + `vitest.integration.config.ts` covers all `vi.spyOn` spies. Only keep `spy.mockRestore()` for global/prototype spies where intent communication matters.
- **React button clicks need `act()`** — `.click()` (native DOM) does NOT trigger React state updates; use `act(() => { fireEvent.click(element) })` for clicks that cause state transitions. `fireEvent.click()` alone (without `act`) can miss updates in some scenarios; wrapping in `act` is the safe pattern.
- **Keyboard events work with `fireEvent.keyDown(window, ...)`** — dispatches to the global listener; React's synthetic event system picks it up cleanly without needing `act()`.
- **Integration tier: `signInAs` inside each test** — the cookie jar resets per-test in `vitest.integration.setup.ts`; never call `signInAs` in `beforeAll`.
- **Non-vacuous negative assertions** — before asserting a cross-org/cross-tenant result is empty, confirm the target rows exist via the service-role admin client first.
- **Per-step error accumulator in `afterAll`** — use `const errors: string[] = []` + per-step `try/catch`, then `if (errors.length > 0) throw new Error(errors.join('; '))` at the end (throws only when a step actually failed). Dependent steps (FK ordering) additionally gate on `errors.length === 0`.
- **Composition hooks (e.g. `useStudyConfig`)** — mock sub-hooks (useTopicTree, useFilteredCount, etc.) but let the top-level state hook (`useQuizConfigState`) run for real; this tests the integration without mocking state management internals.
- **Component tests: mock heavy deps, keep observable DOM real** — mock components with complex deps (MarkdownText, ZoomableImage via next/image); leave `AnswerOptions` un-mocked when the test needs to observe DOM output like `border-green-500` on the correct option.
- **Runner mock pattern for sub-components** — mock child components with a lightweight stand-in that includes the `data-testid` props the runner test needs (e.g. `data-testid={\`flashcard-${question.id}\`}`) to test orchestration without the child's deps.
- **Config-form component tests need an `onExit` wrapper on runner mocks** — when the form conditionally renders a runner component and passes `onExit`, expose that callback in the mock (e.g. a visible Exit button) so tests can assert `reset` is called. Pattern: `StudyRunner: ({ onExit }) => <div data-testid="study-runner"><button onClick={onExit}>Exit</button></div>`.
- **Tab-count changes need two coverage additions** — when adding a 3rd tab: (1) a test that asserts the new tab renders, (2) a test that asserts clicking it shows the correct content. The existing `renders both tabs` name becomes stale — do NOT rename it, just add the new tests alongside.
- **New optional RPC param needs two tests** — when a function grows an optional param defaulting to null: (1) assert omitting it sends `null` to the RPC, (2) assert providing it passes the value through. Pattern mirrored by `p_question_type` tests in `quiz-session-queries.test.ts`.
- **RPC integration test migration note** — integration test file header must name the migration number and explain any prerequisites (local db reset + grant-fix + re-seed).

## Topic pointers

- [test-recipes](topics/test-recipes.md) — scaffolding for the vi.hoisted+buildChain pattern, integration test shape, and composition hook mock setup
