import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoadVfrRt, mockLoadSession, mockGetFlagged } = vi.hoisted(() => ({
  mockLoadVfrRt: vi.fn(),
  mockLoadSession: vi.fn(),
  mockGetFlagged: vi.fn(),
}))

vi.mock('@/lib/queries/load-vfr-rt-exam-questions', () => ({
  loadVfrRtExamQuestions: mockLoadVfrRt,
}))
vi.mock('@/lib/queries/load-session-questions', () => ({ loadSessionQuestions: mockLoadSession }))
vi.mock('../../actions/flag', () => ({ getFlaggedIds: mockGetFlagged }))

import { loadSessionData } from './session-bootstrap-load'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const question = { id: 'q1' }

beforeEach(() => {
  vi.resetAllMocks()
  mockLoadVfrRt.mockResolvedValue({ success: true, questions: [question] })
  mockGetFlagged.mockResolvedValue({ success: true, flaggedIds: [] })
})

describe('loadSessionData for a VFR RT exam', () => {
  it('loads through the VFR RT exam loader keyed by session id', async () => {
    const result = await loadSessionData(['q1'], { sessionId: SESSION_ID, examMode: 'vfr_rt_exam' })
    expect(mockLoadVfrRt).toHaveBeenCalledWith({ sessionId: SESSION_ID })
    expect(mockLoadSession).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: true, questions: [question] })
  })

  it('loads other exam modes through the generic loader', async () => {
    mockLoadSession.mockResolvedValue({ success: true, questions: [question] })
    await loadSessionData(['q1'], { sessionId: SESSION_ID, examMode: 'mock_exam' })
    expect(mockLoadSession).toHaveBeenCalledWith(['q1'])
    expect(mockLoadVfrRt).not.toHaveBeenCalled()
  })
})
