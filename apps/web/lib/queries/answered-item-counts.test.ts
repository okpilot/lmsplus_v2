import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerCountClient } from './answered-item-counts'
import { fetchAnsweredItemCounts } from './answered-item-counts'

// ---- Chain mock helpers -------------------------------------------------------

// Mirrors admin-report-helpers.test.ts's buildChain/mockFromSequence pattern —
// captures per-call method args so a test can assert on the exact filter/order a
// specific `.from()` call issued, not just the fixture it was handed back.
type CapturedCall = {
  select: unknown[][]
  in: unknown[][]
  order: unknown[][]
  range: unknown[][]
}
const CAPTURED_METHODS = ['select', 'in', 'order', 'range'] as const

function emptyCapture(): CapturedCall {
  return { select: [], in: [], order: [], range: [] }
}

function buildChain(returnValue: unknown, captured: CapturedCall) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const proxy = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      if (typeof prop === 'string' && (CAPTURED_METHODS as readonly string[]).includes(prop)) {
        return (...args: unknown[]) => {
          captured[prop as keyof CapturedCall].push(args)
          return proxy
        }
      }
      return (..._args: unknown[]) => proxy
    },
  })
  return proxy
}

/**
 * Builds a fake `AnswerCountClient` whose `.from()` is a fresh `vi.fn()` — the
 * caller-supplied client `fetchAnsweredItemCounts` is now parameterized by
 * (`client: AnswerCountClient`), so each test constructs its own instead of
 * relying on a module-level mock of `@repo/db/admin`. That module dependency
 * is gone from the helper entirely.
 */
function mockFromSequence(...responses: unknown[]): {
  client: AnswerCountClient
  mockFrom: ReturnType<typeof vi.fn>
  capturedByCall: CapturedCall[]
  tablesByCall: string[]
} {
  let call = 0
  const capturedByCall: CapturedCall[] = []
  const tablesByCall: string[] = []
  const mockFrom = vi.fn().mockImplementation((table: string) => {
    const idx = call++
    const captured = emptyCapture()
    capturedByCall[idx] = captured
    tablesByCall[idx] = table
    return buildChain(responses[idx] ?? { data: null }, captured)
  })
  return { client: { from: mockFrom } as AnswerCountClient, mockFrom, capturedByCall, tablesByCall }
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// fetchAnsweredItemCounts
// ---------------------------------------------------------------------------

describe('fetchAnsweredItemCounts', () => {
  it('resolves an empty map with no query when sessionIds is empty', async () => {
    const { client, mockFrom } = mockFromSequence()
    const result = await fetchAnsweredItemCounts([], client)
    expect(result).toEqual({ data: new Map(), error: null })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('pages the session filter and counts answer rows per session', async () => {
    const { client, capturedByCall, tablesByCall } = mockFromSequence(
      { count: 4, error: null }, // count query
      {
        data: [
          { session_id: 'sess-1' },
          { session_id: 'sess-1' },
          { session_id: 'sess-1' },
          { session_id: 'sess-2' },
        ],
        error: null,
      }, // page query
    )
    const result = await fetchAnsweredItemCounts(['sess-1', 'sess-2'], client)
    expect(tablesByCall).toEqual(['quiz_session_answers', 'quiz_session_answers'])

    const countCapture = capturedByCall[0]
    if (!countCapture) throw new Error('expected a count query call at index 0')
    expect(countCapture.in[0]).toEqual(['session_id', ['sess-1', 'sess-2']])

    const pageCapture = capturedByCall[1]
    if (!pageCapture) throw new Error('expected a page query call at index 1')
    expect(pageCapture.select[0]).toEqual(['session_id'])
    expect(pageCapture.in[0]).toEqual(['session_id', ['sess-1', 'sess-2']])
    expect(pageCapture.order).toEqual([['id', { ascending: true }]])
    expect(pageCapture.range[0]).toEqual([0, 3])

    expect(result.error).toBeNull()
    expect(result.data.get('sess-1')).toBe(3)
    expect(result.data.get('sess-2')).toBe(1)
  })

  it('leaves a session with zero answer rows absent from the map', async () => {
    const { client } = mockFromSequence(
      { count: 1, error: null },
      { data: [{ session_id: 'sess-1' }], error: null },
    )
    const result = await fetchAnsweredItemCounts(['sess-1', 'sess-empty'], client)
    expect(result.error).toBeNull()
    expect(result.data.get('sess-1')).toBe(1)
    expect(result.data.has('sess-empty')).toBe(false)
    expect(result.data.size).toBe(1)
  })

  it('discards a partial count and surfaces the error when a page fetch fails after a successful count', async () => {
    // The count already reported 4 rows, so a page-fetch failure after it must not be
    // masked as a partial/short result — code-style.md §7 "Paginated Fetch Needs a
    // Caller-Level Page-Error Test": a truncated count must never look complete.
    const { client } = mockFromSequence(
      { count: 4, error: null },
      { data: null, error: { message: 'page fetch failed' } },
    )
    const result = await fetchAnsweredItemCounts(['sess-1', 'sess-2'], client)
    expect(result).toEqual({ data: new Map(), error: { message: 'page fetch failed' } })
  })

  it('queries through the client the caller passed in, not a shared default', async () => {
    // Two independent clients — only the one actually passed to fetchAnsweredItemCounts
    // may be queried. Proves there is no hidden module-level default client (e.g. a
    // leftover import of adminClient) still backing the helper.
    const used = mockFromSequence(
      { count: 1, error: null },
      { data: [{ session_id: 'sess-1' }], error: null },
    )
    const unused = mockFromSequence()

    await fetchAnsweredItemCounts(['sess-1'], used.client)

    expect(used.mockFrom).toHaveBeenCalled()
    expect(unused.mockFrom).not.toHaveBeenCalled()
  })
})
