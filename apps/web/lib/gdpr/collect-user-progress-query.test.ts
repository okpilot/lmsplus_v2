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
  it('returns the student progress rows', async () => {
    mockFetchAllRows.mockResolvedValueOnce({ data: [ROW], error: null })
    const { client } = makeClient()

    const result = await fetchUserProgress(client, 'user-1')

    expect(result).toEqual({ data: [ROW], error: null })
  })

  it('propagates a read error with an empty section', async () => {
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: { message: 'boom' } })
    const { client } = makeClient()

    const result = await fetchUserProgress(client, 'user-1')

    expect(result.data).toEqual([])
    expect(result.error).toEqual({ message: 'boom' })
  })

  it('scopes both the count and the page read to the student in a stable order', async () => {
    const { client, calls } = makeClient()
    mockFetchAllRows.mockImplementationOnce(
      async (count: () => unknown, page: (a: number, b: number) => unknown) => {
        count()
        page(0, 999)
        return { data: [], error: null }
      },
    )

    await fetchUserProgress(client, 'user-1')

    expect(calls.filter(([m]) => m === 'from').map(([, a]) => a[0])).toEqual([
      'quiz_session_progress',
      'quiz_session_progress',
    ])
    expect(calls.filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([
      ['student_id', 'user-1'],
      ['student_id', 'user-1'],
    ])
    expect(calls.filter(([m]) => m === 'order').map(([, a]) => a[0])).toEqual([
      'session_id',
      'question_id',
    ])
  })
})
