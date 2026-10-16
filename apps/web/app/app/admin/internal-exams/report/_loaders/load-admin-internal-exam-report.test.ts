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

vi.mock('@/lib/queries/admin-quiz-report', () => ({
  getAdminQuizReportSummary: mockSummary,
  getAdminQuizReportQuestions: mockQuestions,
}))

import { loadAdminInternalExamReport } from './load-admin-internal-exam-report'

const SESSION_ID = '11111111-2222-3333-4444-555555555555'
const LIST_URL = '/app/admin/internal-exams?tab=attempts'

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

describe('loadAdminInternalExamReport', () => {
  it('redirects to the attempts list when the session id is missing', async () => {
    await expect(loadAdminInternalExamReport({})).rejects.toThrow(`REDIRECT:${LIST_URL}`)
    expect(mockSummary).not.toHaveBeenCalled()
  })

  it('redirects to the attempts list when the session id is not a UUID', async () => {
    await expect(loadAdminInternalExamReport({ sessionId: 'nope' })).rejects.toThrow(
      `REDIRECT:${LIST_URL}`,
    )
    expect(mockSummary).not.toHaveBeenCalled()
  })

  it('redirects to the attempts list when the summary is missing', async () => {
    mockSummary.mockResolvedValue(null)
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 0 })
    await expect(loadAdminInternalExamReport({ sessionId: SESSION_ID })).rejects.toThrow(
      `REDIRECT:${LIST_URL}`,
    )
  })

  it('redirects a non internal-exam session to the admin session report', async () => {
    mockSummary.mockResolvedValue({ mode: 'quick_quiz' })
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 0 })
    await expect(loadAdminInternalExamReport({ sessionId: SESSION_ID })).rejects.toThrow(
      `REDIRECT:/app/admin/dashboard/sessions/${SESSION_ID}`,
    )
  })

  it('redirects to the attempts list when the questions read fails', async () => {
    mockSummary.mockResolvedValue({ mode: 'internal_exam' })
    mockQuestions.mockResolvedValue({ ok: false })
    await expect(loadAdminInternalExamReport({ sessionId: SESSION_ID })).rejects.toThrow(
      `REDIRECT:${LIST_URL}`,
    )
  })

  it('redirects to the last page when the requested page overflows', async () => {
    mockSummary.mockResolvedValue({ mode: 'internal_exam' })
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 25 })
    await expect(
      loadAdminInternalExamReport({ sessionId: SESSION_ID, pageParam: '9' }),
    ).rejects.toThrow(`REDIRECT:/app/admin/internal-exams/report?session=${SESSION_ID}&page=3`)
  })

  it('starts the summary and questions reads before either resolves', async () => {
    const summary = deferred<unknown>()
    mockSummary.mockReturnValue(summary.promise)
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 1 })

    const result = loadAdminInternalExamReport({ sessionId: SESSION_ID })
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

    const result = await loadAdminInternalExamReport({ sessionId: SESSION_ID, pageParam: '2' })

    expect(result).toEqual({ summary, questions, totalCount: 25, page: 2 })
    expect(mockQuestions).toHaveBeenCalledWith({ sessionId: SESSION_ID, page: 2 })
  })
})
