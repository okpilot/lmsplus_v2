import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchUserProgress } from './collect-user-progress-query'

const { mockFetchAllRows } = vi.hoisted(() => ({ mockFetchAllRows: vi.fn() }))

vi.mock('@/lib/supabase-paginate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase-paginate')>()),
  fetchAllRows: mockFetchAllRows,
}))

const ROW = {
  session_id: 'sess-1',
  question_id: 'q-1',
  answer: { selected_option_id: 'a' },
  time_spent_ms: 1200,
  answered_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:01Z',
}

/** Chain recorder: every builder method returns the chain; awaiting resolves a count/page result. */
function makeClient() {
  const calls: Array<[string, unknown[]]> = []
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (prop === 'then') return undefined
      return (...args: unknown[]) => {
        calls.push([String(prop), args])
        return new Proxy(target, handler)
      }
    },
  }
  const client = {
    from: (table: string) => {
      calls.push(['from', [table]])
      return new Proxy({} as Record<string, unknown>, handler)
    },
  } as unknown as SupabaseClient<Database>
  return { client, calls }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('fetchUserProgress', () => {
  it('returns the progress rows of the given sessions', async () => {
    mockFetchAllRows.mockResolvedValueOnce({ data: [ROW], error: null })
    const { client } = makeClient()

    const result = await fetchUserProgress(client, ['sess-1'])

    expect(result).toEqual({ data: [ROW], error: null })
  })

  it('propagates a read error with an empty section', async () => {
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: { message: 'boom' } })
    const { client } = makeClient()

    const result = await fetchUserProgress(client, ['sess-1'])

    expect(result.data).toEqual([])
    expect(result.error).toEqual({ message: 'boom' })
  })

  it('issues no query and returns an empty section when there are no sessions', async () => {
    const { client, calls } = makeClient()

    const result = await fetchUserProgress(client, [])

    expect(result).toEqual({ data: [], error: null })
    expect(mockFetchAllRows).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('discards earlier chunks when a later chunk fails', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `sess-${i}`)
    mockFetchAllRows
      .mockResolvedValueOnce({ data: [ROW], error: null })
      .mockResolvedValueOnce({ data: [], error: { message: 'late' } })
    const { client } = makeClient()

    const result = await fetchUserProgress(client, ids)

    expect(result).toEqual({ data: [], error: { message: 'late' } })
  })

  it('reads sessions in chunks of 1000 and concatenates the rows', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `sess-${i}`)
    mockFetchAllRows
      .mockResolvedValueOnce({ data: [ROW], error: null })
      .mockResolvedValueOnce({ data: [{ ...ROW, session_id: 'sess-1000' }], error: null })
    const { client } = makeClient()

    const result = await fetchUserProgress(client, ids)

    expect(mockFetchAllRows).toHaveBeenCalledTimes(2)
    expect(result.data.map((r) => r.session_id)).toEqual(['sess-1', 'sess-1000'])
  })

  it('scopes both the count and the page read to the given sessions in a stable order', async () => {
    const { client, calls } = makeClient()
    mockFetchAllRows.mockImplementationOnce(
      async (count: () => unknown, page: (a: number, b: number) => unknown) => {
        count()
        page(0, 999)
        return { data: [], error: null }
      },
    )

    await fetchUserProgress(client, ['sess-1', 'sess-2'])

    expect(calls.filter(([m]) => m === 'from').map(([, a]) => a[0])).toEqual([
      'quiz_session_progress',
      'quiz_session_progress',
    ])
    expect(calls.filter(([m]) => m === 'in').map(([, a]) => a)).toEqual([
      ['session_id', ['sess-1', 'sess-2']],
      ['session_id', ['sess-1', 'sess-2']],
    ])
    expect(calls.filter(([m]) => m === 'order').map(([, a]) => a[0])).toEqual([
      'session_id',
      'question_id',
    ])
  })
})
