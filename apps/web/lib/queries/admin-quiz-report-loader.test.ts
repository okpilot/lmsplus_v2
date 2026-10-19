import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockLoad,
  mockRequireAdmin,
  mockFrom,
  mockPageAnswers,
  mockPageQuestions,
  mockCorrectMap,
  mockAnswerKeyMap,
} = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockFrom: vi.fn(),
  mockPageAnswers: vi.fn(),
  mockPageQuestions: vi.fn(),
  mockCorrectMap: vi.fn(),
  mockAnswerKeyMap: vi.fn(),
}))

vi.mock('./admin-report-helpers', () => ({
  fetchPageAnswerRows: mockPageAnswers,
  fetchPageQuestions: mockPageQuestions,
  fetchAdminReportCorrectOptionsMap: mockCorrectMap,
  fetchAdminReportAnswerKeyMap: mockAnswerKeyMap,
}))

vi.mock('./admin-report-session', () => ({ loadAdminReportSession: mockLoad }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

import { getAdminQuizReportQuestions, getAdminQuizReportSummary } from './admin-quiz-report'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function chainResolving(result: unknown) {
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (res: (v: unknown) => void) => Promise.resolve(result).then(res)
        return () => proxy
      },
    },
  )
  return proxy
}

function usersChain(fullName: string | null) {
  return chainResolving({ data: { full_name: fullName }, error: null })
}

const session = {
  id: 'sess-1',
  mode: 'quick_quiz',
  subject_id: null,
  started_at: '2026-03-12T10:00:00Z',
  ended_at: '2026-03-12T10:15:00Z',
  total_questions: 3,
  correct_count: 2,
  score_percentage: 60,
  student_id: 'stu-1',
  passed: null,
  time_limit_seconds: null,
}

// dialog_fill: q1 has two blank rows, q2 one.
const answerRows = [
  { question_id: 'q1', answered_at: '2026-03-12T10:01:00Z' },
  { question_id: 'q1', answered_at: '2026-03-12T10:01:00Z' },
  { question_id: 'q2', answered_at: '2026-03-12T10:02:00Z' },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'a', organizationId: 'org-1' })
  mockFrom.mockImplementation(() => usersChain('Alice'))
})

describe('admin report reads', () => {
  it('summary and questions of one render read through the loader with the same session id', async () => {
    mockLoad.mockResolvedValue({ ok: true, session, answerRows: [] })
    await getAdminQuizReportSummary('sess-1')
    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(mockLoad).toHaveBeenCalledTimes(2)
    expect(mockLoad.mock.calls.map((c) => c[0])).toEqual(['sess-1', 'sess-1'])
  })

  it('summary counts every answer row as an item and distinct question ids as answered questions', async () => {
    mockLoad.mockResolvedValue({ ok: true, session, answerRows })
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result?.answeredItems).toBe(3)
    expect(result?.answeredQuestions).toBe(2)
    expect(result?.studentName).toBe('Alice')
  })

  it('summary is null and reads no user when the loader is not ok', async () => {
    mockLoad.mockResolvedValue({ ok: false })
    expect(await getAdminQuizReportSummary('sess-1')).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('questions fail with the generic message and read nothing else when the loader is not ok', async () => {
    mockLoad.mockResolvedValue({ ok: false })
    expect(await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })).toEqual({
      ok: false,
      error: 'Failed to load questions',
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('questions report the distinct question count from the loader rows when the page is out of range', async () => {
    mockLoad.mockResolvedValue({ ok: true, session, answerRows })
    expect(await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 99 })).toEqual({
      ok: true,
      questions: [],
      totalCount: 2,
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('starts the student-name lookup while the subject lookup is still pending', async () => {
    const subject = deferred<unknown>()
    mockLoad.mockResolvedValue({
      ok: true,
      session: { ...session, subject_id: 'subj-1' },
      answerRows,
    })
    mockFrom.mockImplementation((table: string) =>
      table === 'easa_subjects' ? chainResolving(subject.promise) : usersChain('Alice'),
    )

    const result = getAdminQuizReportSummary('sess-1')
    await vi.waitFor(() => expect(mockFrom).toHaveBeenCalledWith('easa_subjects'))
    await new Promise((r) => setTimeout(r, 0))
    expect(mockFrom).toHaveBeenCalledWith('users')

    subject.resolve({ data: { name: 'Air Law', code: 'AL' }, error: null })
    expect((await result)?.studentName).toBe('Alice')
  })

  describe('questions page reads', () => {
    const questionRow = { id: 'q1', question_text: 'Q', options: [] }
    const answerRow = { question_id: 'q1', selected_option_id: 'o1', is_correct: true }

    beforeEach(() => {
      mockLoad.mockResolvedValue({ ok: true, session, answerRows })
      mockPageAnswers.mockResolvedValue({ data: [answerRow], error: null })
      mockPageQuestions.mockResolvedValue({ data: [questionRow], error: null })
      mockCorrectMap.mockResolvedValue({ data: new Map(), error: null })
      mockAnswerKeyMap.mockResolvedValue({ data: new Map(), error: null })
    })

    it('returns an empty page and ignores a key-read failure when the page has no answers', async () => {
      mockPageAnswers.mockResolvedValue({ data: [], error: null })
      mockCorrectMap.mockResolvedValue({ data: null, error: { message: 'x' } })

      expect(await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })).toEqual({
        ok: true,
        questions: [],
        totalCount: 2,
      })
    })

    it('starts the page questions read while the page answers read is still pending', async () => {
      const answers = deferred<unknown>()
      mockPageAnswers.mockReturnValue(answers.promise)

      const result = getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
      await vi.waitFor(() => expect(mockPageAnswers).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 0))
      expect(mockPageQuestions).toHaveBeenCalled()

      answers.resolve({ data: [answerRow], error: null })
      expect((await result).ok).toBe(true)
    })

    it('starts the answer-key reads while the page answers read is still pending', async () => {
      const answers = deferred<unknown>()
      mockPageAnswers.mockReturnValue(answers.promise)

      const result = getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
      await vi.waitFor(() => expect(mockPageAnswers).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 0))
      expect(mockCorrectMap).toHaveBeenCalled()
      expect(mockAnswerKeyMap).toHaveBeenCalled()

      answers.resolve({ data: [answerRow], error: null })
      expect((await result).ok).toBe(true)
    })

    it('starts the answer-keys RPC while the correct-options RPC is still pending', async () => {
      const correct = deferred<unknown>()
      mockCorrectMap.mockReturnValue(correct.promise)

      const result = getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
      await vi.waitFor(() => expect(mockCorrectMap).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 0))
      expect(mockAnswerKeyMap).toHaveBeenCalled()

      correct.resolve({ data: new Map(), error: null })
      expect((await result).ok).toBe(true)
    })
  })
})
