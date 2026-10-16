import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSummary, mockQuestions } = vi.hoisted(() => ({
  mockSummary: vi.fn(),
  mockQuestions: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

vi.mock('@/lib/queries/quiz-report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/quiz-report')>()),
  getQuizReportSummary: mockSummary,
}))

vi.mock('@/lib/queries/quiz-report-questions', () => ({
  getQuizReportQuestions: mockQuestions,
}))

import { loadInternalExamReport } from './load-internal-exam-report'

const SESSION_ID = '11111111-2222-3333-4444-555555555555'
const LIST_URL = '/app/internal-exam?tab=reports'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('loadInternalExamReport', () => {
  it('redirects to the reports list when the session id is missing', async () => {
    await expect(loadInternalExamReport({})).rejects.toThrow(`REDIRECT:${LIST_URL}`)
    expect(mockSummary).not.toHaveBeenCalled()
  })

  it('redirects to the reports list when the session id is not a UUID', async () => {
    await expect(loadInternalExamReport({ sessionId: 'nope' })).rejects.toThrow(
      `REDIRECT:${LIST_URL}`,
    )
    expect(mockSummary).not.toHaveBeenCalled()
  })

  it('redirects to the reports list when the summary is missing', async () => {
    mockSummary.mockResolvedValue(null)
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 0 })
    await expect(loadInternalExamReport({ sessionId: SESSION_ID })).rejects.toThrow(
      `REDIRECT:${LIST_URL}`,
    )
  })

  it('redirects a non internal-exam session to the quiz report', async () => {
    mockSummary.mockResolvedValue({ mode: 'quick_quiz' })
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 0 })
    await expect(loadInternalExamReport({ sessionId: SESSION_ID })).rejects.toThrow(
      `REDIRECT:/app/quiz/report?session=${SESSION_ID}`,
    )
  })

  it('redirects a VFR RT exam session straight to the RT report', async () => {
    mockSummary.mockResolvedValue({ mode: 'vfr_rt_exam' })
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 0 })
    await expect(loadInternalExamReport({ sessionId: SESSION_ID })).rejects.toThrow(
      `REDIRECT:/app/vfr-rt/report?session=${SESSION_ID}`,
    )
  })

  it('redirects to the reports list when the questions read fails', async () => {
    mockSummary.mockResolvedValue({ mode: 'internal_exam' })
    mockQuestions.mockResolvedValue({ ok: false })
    await expect(loadInternalExamReport({ sessionId: SESSION_ID })).rejects.toThrow(
      `REDIRECT:${LIST_URL}`,
    )
  })

  it('redirects to the last page when the requested page overflows', async () => {
    mockSummary.mockResolvedValue({ mode: 'internal_exam' })
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 25 })
    await expect(loadInternalExamReport({ sessionId: SESSION_ID, pageParam: '9' })).rejects.toThrow(
      `REDIRECT:/app/internal-exam/report?session=${SESSION_ID}&page=3`,
    )
  })

  it('starts the summary and questions reads before either resolves', async () => {
    const summary = deferred<unknown>()
    mockSummary.mockReturnValue(summary.promise)
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 1 })

    const result = loadInternalExamReport({ sessionId: SESSION_ID })
    await vi.waitFor(() => expect(mockQuestions).toHaveBeenCalledTimes(1))
    expect(mockSummary).toHaveBeenCalledTimes(1)

    summary.resolve({ mode: 'internal_exam' })
    await expect(result).resolves.toMatchObject({ page: 1 })
  })

  it('returns the summary, questions, total count and page', async () => {
    const summary = { mode: 'internal_exam' }
    const questions = [{ id: 'q1' }]
    mockSummary.mockResolvedValue(summary)
    mockQuestions.mockResolvedValue({ ok: true, questions, totalCount: 25 })

    const result = await loadInternalExamReport({ sessionId: SESSION_ID, pageParam: '2' })

    expect(result).toEqual({ summary, questions, totalCount: 25, page: 2 })
    expect(mockQuestions).toHaveBeenCalledWith({ sessionId: SESSION_ID, page: 2 })
  })
})
