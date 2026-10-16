import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockFetchAllRows, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetchAllRows: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase-paginate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase-paginate')>()),
  fetchAllRows: mockFetchAllRows,
}))

vi.mock('@/lib/auth/get-session-user', () => ({
  getSessionUser: async () => ({ id: 'user-1' }),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom, rpc: mockRpc }),
}))

import { getQuizReportQuestions } from './quiz-report-questions'

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const proxy: Record<string, unknown> = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return () => proxy
    },
  })
  return proxy
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const SESSION = { data: { id: 'sess-1', ended_at: '2026-03-12T10:05:00Z' } }
const ANSWERS = {
  data: [{ question_id: 'q1', selected_option_id: 'opt-a', is_correct: true, response_time_ms: 1 }],
}
const QUESTIONS = {
  data: [
    {
      id: 'q1',
      question_text: 'What is lift?',
      question_number: '050-01-001',
      question_type: 'multiple_choice',
      options: [{ id: 'opt-a', text: 'Upward force' }],
      explanation_text: null,
      question_image_url: null,
    },
  ],
}

function fromSequence(...responses: unknown[]) {
  let call = 0
  mockFrom.mockImplementation(() => buildChain(responses[call++] ?? { data: null }))
}

function rpcNames() {
  return mockRpc.mock.calls.map((c) => c[0])
}

const settle = () => new Promise((r) => setTimeout(r, 10))

beforeEach(() => {
  vi.resetAllMocks()
  mockFetchAllRows.mockResolvedValue({ data: [{ question_id: 'q1' }], error: null })
})

describe('getQuizReportQuestions parallel reads', () => {
  it('starts the questions read while the answers read is still pending', async () => {
    const answers = deferred<unknown>()
    fromSequence(SESSION, answers.promise, QUESTIONS)
    mockRpc.mockResolvedValue({ data: [] })

    const result = getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    await vi.waitFor(() => expect(mockFrom.mock.calls.length).toBeGreaterThanOrEqual(2))
    await settle()
    expect(mockFrom).toHaveBeenCalledTimes(3)

    answers.resolve(ANSWERS)
    expect((await result).ok).toBe(true)
  })

  it('starts the answer-keys RPC while the correct-options RPC is still pending', async () => {
    const correct = deferred<unknown>()
    fromSequence(SESSION, ANSWERS, QUESTIONS)
    mockRpc.mockImplementation((name: string) =>
      name === 'get_report_correct_options' ? correct.promise : Promise.resolve({ data: [] }),
    )

    const result = getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    await vi.waitFor(() => expect(rpcNames()).toContain('get_report_correct_options'))
    await settle()
    expect(rpcNames()).toContain('get_report_answer_keys')

    correct.resolve({ data: [{ question_id: 'q1', correct_option_id: 'opt-a' }] })
    expect((await result).ok).toBe(true)
  })

  it('skips both report RPCs when the page has no answers', async () => {
    fromSequence(SESSION, { data: [] }, QUESTIONS)

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })

    expect(result).toEqual({ ok: true, questions: [], totalCount: 1 })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
