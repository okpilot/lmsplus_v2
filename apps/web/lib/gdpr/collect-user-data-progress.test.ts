import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectUserData } from './collect-user-data'

const USER = {
  id: 'user-1',
  email: 's@example.com',
  full_name: 'Jane',
  role: 'student',
  created_at: '2026-01-01T00:00:00Z',
  last_active_at: null,
}

const PROGRESS = {
  session_id: 'sess-1',
  question_id: 'q-1',
  answer: { selected_option_id: 'a' },
  time_spent_ms: 1200,
  answered_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:01Z',
}

type Mode = { kind: 'rows'; rows: unknown[] } | { kind: 'pageError'; message: string }

/** Proxy chain: count (head) selects resolve a count, page selects resolve rows or an error. */
function makeChain(mode: Mode) {
  const state = { head: false, from: 0, to: Number.MAX_SAFE_INTEGER }
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => {
          if (mode.kind === 'pageError') {
            return resolve(
              state.head
                ? { count: 3, error: null }
                : { data: null, error: { message: mode.message } },
            )
          }
          return resolve(
            state.head
              ? { count: mode.rows.length, error: null }
              : { data: mode.rows.slice(state.from, state.to + 1), error: null },
          )
        }
      }
      if (prop === 'single') return () => Promise.resolve({ data: USER, error: null })
      if (prop === 'select') {
        return (_c: unknown, opts?: { head?: boolean }) => {
          state.head = Boolean(opts?.head)
          return new Proxy(target, handler)
        }
      }
      if (prop === 'range') {
        return (from: number, to: number) => {
          state.from = from
          state.to = to
          return new Proxy(target, handler)
        }
      }
      return () => new Proxy(target, handler)
    },
  }
  return new Proxy({} as Record<string, unknown>, handler)
}

function makeClient(progress: Mode) {
  return {
    from: (table: string) =>
      makeChain(table === 'quiz_session_progress' ? progress : { kind: 'rows', rows: [] }),
  } as unknown as SupabaseClient<Database>
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('collectUserData — quiz progress section', () => {
  it('includes the student in-progress answers and timings in the export', async () => {
    const payload = await collectUserData(makeClient({ kind: 'rows', rows: [PROGRESS] }), 'user-1')

    expect(payload.quiz_progress).toEqual([PROGRESS])
    expect(payload.warnings).toEqual([])
  })

  it('warns and exports an empty progress section when a page read fails after a successful count', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const payload = await collectUserData(
      makeClient({ kind: 'pageError', message: 'boom' }),
      'user-1',
    )

    expect(payload.quiz_progress).toEqual([])
    expect(payload.warnings.map((w) => w.section)).toEqual(['quiz_progress'])
    expect(errSpy).toHaveBeenCalledWith('[collectUserData] quiz_progress query failed:', 'boom')
  })
})
