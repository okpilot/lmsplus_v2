import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoadReportSession } = vi.hoisted(() => ({ mockLoadReportSession: vi.fn() }))

vi.mock('./quiz-report-session', () => ({ loadReportSession: mockLoadReportSession }))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    from: () => {
      throw new Error('report queries must read the session through loadReportSession')
    },
    rpc: () => {
      throw new Error('no RPC expected')
    },
  }),
}))

import { getQuizReportSummary } from './quiz-report'
import { getQuizReportQuestions } from './quiz-report-questions'

beforeEach(() => {
  vi.resetAllMocks()
  mockLoadReportSession.mockResolvedValue({ ok: false })
})

describe('report session sharing', () => {
  it('loads the summary session through loadReportSession', async () => {
    expect(await getQuizReportSummary('sess-1')).toBeNull()
    expect(mockLoadReportSession).toHaveBeenCalledWith('sess-1')
  })

  it('loads the question-page session through loadReportSession', async () => {
    expect(await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })).toEqual({
      ok: false,
      error: 'Failed to load questions',
    })
    expect(mockLoadReportSession).toHaveBeenCalledWith('sess-1')
  })

  it('passes the same session id to loadReportSession from the summary and the questions of a render', async () => {
    await Promise.all([
      getQuizReportSummary('sess-1'),
      getQuizReportQuestions({ sessionId: 'sess-1', page: 1 }),
    ])
    expect(mockLoadReportSession.mock.calls).toEqual([['sess-1'], ['sess-1']])
  })
})
