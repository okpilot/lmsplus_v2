import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveSession } from '../_utils/quiz-session-storage'

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

import { buildRecoveryResume, loadSessionData } from './session-bootstrap-load'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const question = { id: 'q1' }

const recovery = {
  sessionId: SESSION_ID,
  questionIds: ['q1'],
  answers: { q1: { selectedOptionId: 'a', responseTimeMs: 10 } },
  examMode: 'vfr_rt_exam',
  mode: 'exam',
} as unknown as ActiveSession

beforeEach(() => {
  vi.resetAllMocks()
  mockLoadVfrRt.mockResolvedValue({ success: true, questions: [question] })
  mockGetFlagged.mockResolvedValue({ success: true, flaggedIds: [] })
})

function makeSetters() {
  return {
    setSession: vi.fn(),
    setQuestions: vi.fn(),
    setFlaggedIds: vi.fn(),
    setRecovery: vi.fn(),
    setResumeLoading: vi.fn(),
    setResumeError: vi.fn(),
  }
}

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

describe('resuming an active VFR RT exam session', () => {
  it('reloads through the VFR RT loader and keeps the restored session answers', async () => {
    const set = makeSetters()
    const inFlight = { current: false }
    buildRecoveryResume(recovery, set, inFlight)()
    await vi.waitFor(() => expect(set.setRecovery).toHaveBeenCalledWith(null))

    expect(mockLoadVfrRt).toHaveBeenCalledWith({ sessionId: SESSION_ID })
    expect(mockLoadSession).not.toHaveBeenCalled()
    expect(set.setQuestions).toHaveBeenCalledWith([question])
    const restored = set.setSession.mock.calls[0]?.[0]
    expect(restored.sessionId).toBe(SESSION_ID)
    expect(restored.examMode).toBe('vfr_rt_exam')
    expect(restored.draftAnswers).toEqual(recovery.answers)
  })

  it('surfaces the loader error and releases the resume lock', async () => {
    mockLoadVfrRt.mockResolvedValue({ success: false, error: 'boom' })
    const set = makeSetters()
    const inFlight = { current: false }
    buildRecoveryResume(recovery, set, inFlight)()
    await vi.waitFor(() => expect(set.setResumeError).toHaveBeenCalledWith('boom'))
    expect(inFlight.current).toBe(false)
  })
})
