import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSessionUser, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/auth/get-session-user', () => ({ getSessionUser: () => mockGetSessionUser() }))
vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom, rpc: mockRpc }),
}))

import { getDashboardData } from './dashboard'

type Row = Record<string, unknown>

/** Applies .eq() filters to rows, so a SQL-side or JS-side course filter both show. */
function subjectsChain(rows: Row[]) {
  const filters: [string, unknown][] = []
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
            Promise.resolve({
              data: rows.filter((r) => filters.every(([k, v]) => r[k] === v)),
              error: null,
            }).then(res, rej)
        }
        return (...args: unknown[]) => {
          if (prop === 'eq') filters.push([String(args[0]), args[1]])
          return proxy
        }
      },
    },
  )
  return proxy
}

function countChain(count: number) {
  const result = { count, data: null, error: null }
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
            Promise.resolve(result).then(res, rej)
        }
        return () => proxy
      },
    },
  )
  return proxy
}

const SUBJECTS = [
  { id: 's-ppl', course_id: 'c-ppl', code: 'AGK', name: 'AGK', short: 'AGK', sort_order: 1 },
  { id: 's-rt', course_id: 'c-rt', code: 'RT', name: 'RT', short: 'RT', sort_order: 2 },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockGetSessionUser.mockResolvedValue({ id: 'u1' })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'easa_subjects') return subjectsChain(SUBJECTS)
    if (table === 'student_responses') return countChain(7)
    throw new Error(`Unexpected table: ${table}`)
  })
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'get_student_mastery_stats')
      return Promise.resolve({
        data: [
          { subject_id: 's-ppl', topic_id: null, total: 10, correct: 9 },
          { subject_id: 's-rt', topic_id: null, total: 4, correct: 1 },
        ],
        error: null,
      })
    if (fn === 'get_student_streak')
      return Promise.resolve({ data: [{ current_streak: 3, best_streak: 5 }], error: null })
    if (fn === 'get_student_last_practiced') return Promise.resolve({ data: [], error: null })
    throw new Error(`Unexpected RPC: ${fn}`)
  })
})

describe('getDashboardData course filter', () => {
  it('returns only the selected course subjects and their question total', async () => {
    const rt = await getDashboardData('c-rt')
    expect(rt.subjects.map((s) => s.id)).toEqual(['s-rt'])
    expect(rt.totalQuestions).toBe(4)
    const ppl = await getDashboardData('c-ppl')
    expect(ppl.subjects.map((s) => s.id)).toEqual(['s-ppl'])
  })

  it('counts exam readiness over the selected course subjects only', async () => {
    const rt = await getDashboardData('c-rt')
    expect(rt.examReadiness.totalCount).toBe(1)
    const ppl = await getDashboardData('c-ppl')
    expect(ppl.examReadiness.totalCount).toBe(1)
  })

  it('returns all subjects when no course is selected', async () => {
    const all = await getDashboardData(null)
    expect(all.subjects.map((s) => s.id)).toEqual(['s-ppl', 's-rt'])
    expect(all.examReadiness.totalCount).toBe(2)
  })

  it('leaves questions today and streak unchanged by the pick', async () => {
    const rt = await getDashboardData('c-rt')
    const ppl = await getDashboardData('c-ppl')
    expect(rt.questionsToday).toBe(7)
    expect(ppl.questionsToday).toBe(7)
    expect([rt.currentStreak, rt.bestStreak]).toEqual([3, 5])
    expect([ppl.currentStreak, ppl.bestStreak]).toEqual([3, 5])
  })
})
