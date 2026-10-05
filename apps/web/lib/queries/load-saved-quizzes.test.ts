import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockRpc, calls } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  calls: [] as [string, unknown[]][],
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom }),
}))
vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
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

beforeEach(() => {
  vi.resetAllMocks()
  calls.length = 0
  mockFrom.mockReturnValue(chain({ data: [ROW], error: null }))
  mockRpc.mockResolvedValue({ data: { answers: [{}, {}] }, error: null })
})

describe('loadSavedQuizzes', () => {
  it("reads only the caller's saved sessions", async () => {
    await loadSavedQuizzes('user-1')

    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
    expect(calls).toContainEqual(['eq', ['student_id', 'user-1']])
    expect(calls).toContainEqual(['not', ['saved_at', 'is', null]])
  })

  it('maps the row to the saved-quiz view model with the answered count from the server', async () => {
    const result = await loadSavedQuizzes('user-1')

    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_quiz_progress', {
      p_session_id: 's-1',
    })
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

  it('returns an empty list without calling the progress RPC when nothing is saved', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))
    expect(await loadSavedQuizzes('user-1')).toEqual([])
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('throws when the sessions query fails', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    await expect(loadSavedQuizzes('user-1')).rejects.toThrow('Failed to fetch saved quizzes: boom')
  })

  it('throws when the progress RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_not_found' } })
    await expect(loadSavedQuizzes('user-1')).rejects.toThrow(
      'Failed to fetch saved quiz progress: session_not_found',
    )
  })

  it('throws when the progress payload has an unknown shape', async () => {
    mockRpc.mockResolvedValue({ data: { answers: 'nope' }, error: null })
    await expect(loadSavedQuizzes('user-1')).rejects.toThrow(/unexpected progress payload/i)
  })

  it('falls back to a placeholder subject when the embed is missing', async () => {
    mockFrom.mockReturnValue(chain({ data: [{ ...ROW, easa_subjects: null }], error: null }))
    const [session] = await loadSavedQuizzes('user-1')
    expect(session?.subjectName).toBe('Unknown subject')
    expect(session?.subjectCode).toBe('')
  })
})
