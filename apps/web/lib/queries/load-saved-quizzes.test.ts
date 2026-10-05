import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, calls } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  calls: [] as [string, unknown[]][],
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom }),
}))

import { loadSavedQuizzes } from './load-saved-quizzes'

function chain(result: unknown) {
  const target = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return new Proxy(target as Record<string, unknown>, {
    get(t, prop) {
      if (prop === 'then') return t.then
      return (...args: unknown[]) => {
        calls.push([String(prop), args])
        return chain(result)
      }
    },
  })
}

const ROW = {
  id: 's-1',
  mode: 'quick_quiz',
  saved_at: '2026-10-04T09:00:00Z',
  config: { question_ids: ['q1', 'q2', 'q3', 'q4'] },
  easa_subjects: { name: 'Air Law', short: 'ALW' },
}

type ProgressMock = {
  rows?: { session_id: string }[]
  count?: number | null
  countError?: { message: string }
  pageError?: { message: string }
}

function progressChain(opts: ProgressMock) {
  const rows = opts.rows ?? []
  let isCount = false
  const target: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      const result = isCount
        ? {
            count: opts.count === undefined ? rows.length : opts.count,
            error: opts.countError ?? null,
          }
        : { data: opts.pageError ? null : rows, error: opts.pageError ?? null }
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'then') return t.then
      return (...args: unknown[]) => {
        calls.push([`progress.${String(prop)}`, args])
        if (prop === 'select' && (args[1] as { head?: boolean } | undefined)?.head) isCount = true
        return new Proxy(target, this)
      }
    },
  })
}

function setup(sessions: unknown, progress: ProgressMock = {}) {
  mockFrom.mockImplementation((table: string) =>
    table === 'quiz_session_progress' ? progressChain(progress) : chain(sessions),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  calls.length = 0
  setup({ data: [ROW], error: null }, { rows: [{ session_id: 's-1' }, { session_id: 's-1' }] })
})

describe('loadSavedQuizzes', () => {
  it("reads only the caller's saved sessions", async () => {
    await loadSavedQuizzes('user-1')

    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
    expect(calls).toContainEqual(['eq', ['student_id', 'user-1']])
    expect(calls).toContainEqual(['not', ['saved_at', 'is', null]])
  })

  it('maps the row to the saved-quiz view model with the answered count', async () => {
    const result = await loadSavedQuizzes('user-1')

    expect(result).toEqual([
      {
        sessionId: 's-1',
        mode: 'quick_quiz',
        savedAt: '2026-10-04T09:00:00Z',
        subjectName: 'Air Law',
        subjectCode: 'ALW',
        totalCount: 4,
        answeredCount: 2,
      },
    ])
  })

  it('counts only progress rows that hold an answer', async () => {
    await loadSavedQuizzes('user-1')

    expect(calls).toContainEqual(['progress.not', ['answer', 'is', null]])
    expect(calls).toContainEqual(['progress.eq', ['student_id', 'user-1']])
  })

  it('reads progress once for all saved sessions and splits the counts per session', async () => {
    const second = { ...ROW, id: 's-2' }
    setup(
      { data: [ROW, second], error: null },
      { rows: [{ session_id: 's-1' }, { session_id: 's-2' }, { session_id: 's-2' }] },
    )

    const result = await loadSavedQuizzes('user-1')

    expect(result.map((r) => r.answeredCount)).toEqual([1, 2])
    expect(mockFrom.mock.calls.filter(([t]) => t === 'quiz_session_progress')).toHaveLength(2)
    expect(calls.filter(([k, a]) => k === 'progress.in' && Array.isArray(a[1]))).toHaveLength(2)
  })

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['a non-array question list', { question_ids: 'x' }],
  ])('counts no questions when the stored config is %s', async (_label, config) => {
    setup({ data: [{ ...ROW, config }], error: null })

    const result = await loadSavedQuizzes('user-1')

    expect(result.map((r) => r.totalCount)).toEqual([0])
  })

  it('skips the progress read when nothing is saved', async () => {
    setup({ data: [], error: null })
    expect(await loadSavedQuizzes('user-1')).toEqual([])
    expect(mockFrom).not.toHaveBeenCalledWith('quiz_session_progress')
  })

  it('throws when the sessions query fails', async () => {
    setup({ data: null, error: { message: 'boom' } })
    await expect(loadSavedQuizzes('user-1')).rejects.toThrow('Failed to fetch saved quizzes: boom')
  })

  it('throws when a progress page fails after a successful count', async () => {
    setup({ data: [ROW], error: null }, { count: 2, pageError: { message: 'page boom' } })
    await expect(loadSavedQuizzes('user-1')).rejects.toThrow(
      'Failed to fetch saved quiz progress: page boom',
    )
  })

  it('throws when the progress count fails', async () => {
    setup({ data: [ROW], error: null }, { countError: { message: 'count boom' } })
    await expect(loadSavedQuizzes('user-1')).rejects.toThrow(
      'Failed to fetch saved quiz progress: count boom',
    )
  })

  it('falls back to a placeholder subject when the embed is missing', async () => {
    setup({ data: [{ ...ROW, easa_subjects: null }], error: null })
    const [session] = await loadSavedQuizzes('user-1')
    expect(session?.subjectName).toBe('Unknown subject')
    expect(session?.subjectCode).toBe('')
  })
})
