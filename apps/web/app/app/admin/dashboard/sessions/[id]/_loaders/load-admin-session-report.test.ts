import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSummary, mockQuestions } = vi.hoisted(() => ({
  mockSummary: vi.fn(),
  mockQuestions: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

vi.mock('@/lib/queries/admin-quiz-report', () => ({
  getAdminQuizReportSummary: mockSummary,
  getAdminQuizReportQuestions: mockQuestions,
}))

import { loadAdminSessionReport } from './load-admin-session-report'

const SESSION_ID = '11111111-2222-3333-4444-555555555555'
const DASHBOARD = '/app/admin/dashboard'

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

describe('loadAdminSessionReport', () => {
  it('shows not-found and reads nothing when the session id is not a UUID', async () => {
    await expect(loadAdminSessionReport({ sessionId: 'nope' })).rejects.toThrow('NOT_FOUND')
    expect(mockSummary).not.toHaveBeenCalled()
    expect(mockQuestions).not.toHaveBeenCalled()
  })

  it('redirects to the admin dashboard when the summary is missing', async () => {
    mockSummary.mockResolvedValue(null)
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 0 })
    await expect(loadAdminSessionReport({ sessionId: SESSION_ID })).rejects.toThrow(
      `REDIRECT:${DASHBOARD}`,
    )
  })

  it('redirects to the admin dashboard when the questions read fails', async () => {
    mockSummary.mockResolvedValue({ mode: 'quick_quiz' })
    mockQuestions.mockResolvedValue({ ok: false })
    await expect(loadAdminSessionReport({ sessionId: SESSION_ID })).rejects.toThrow(
      `REDIRECT:${DASHBOARD}`,
    )
  })

  it('redirects to the last page when the requested page overflows', async () => {
    mockSummary.mockResolvedValue({ mode: 'quick_quiz' })
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 25 })
    await expect(loadAdminSessionReport({ sessionId: SESSION_ID, pageParam: '9' })).rejects.toThrow(
      `REDIRECT:${DASHBOARD}/sessions/${SESSION_ID}?page=3`,
    )
  })

  it('starts the summary and questions reads before either resolves', async () => {
    const summary = deferred<unknown>()
    mockSummary.mockReturnValue(summary.promise)
    mockQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 1 })

    const result = loadAdminSessionReport({ sessionId: SESSION_ID })
    await vi.waitFor(() => expect(mockQuestions).toHaveBeenCalledTimes(1))
    expect(mockSummary).toHaveBeenCalledTimes(1)

    summary.resolve({ mode: 'quick_quiz' })
    await expect(result).resolves.toMatchObject({ page: 1 })
  })

  it('returns the summary, questions, total count and page', async () => {
    const summary = { mode: 'quick_quiz' }
    const questions = [{ id: 'q1' }]
    mockSummary.mockResolvedValue(summary)
    mockQuestions.mockResolvedValue({ ok: true, questions, totalCount: 25 })

    const result = await loadAdminSessionReport({ sessionId: SESSION_ID, pageParam: '2' })

    expect(result).toEqual({ summary, questions, totalCount: 25, page: 2 })
    expect(mockQuestions).toHaveBeenCalledWith({ sessionId: SESSION_ID, page: 2 })
  })
})
