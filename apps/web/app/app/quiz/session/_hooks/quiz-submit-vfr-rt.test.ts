import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionQuestion } from '@/app/app/_types/session'
import { createMockRouter } from '@/lib/test-support/mock-router'
import type { DraftAnswer } from '../../types'

const {
  mockSubmitVfrRtExam,
  mockSubmitEmptyExamSession,
  mockDiscardQuiz,
  mockClearDeploymentPin,
  mockClearActiveSession,
} = vi.hoisted(() => ({
  mockSubmitVfrRtExam: vi.fn(),
  mockSubmitEmptyExamSession: vi.fn(),
  mockDiscardQuiz: vi.fn(),
  mockClearDeploymentPin: vi.fn(),
  mockClearActiveSession: vi.fn(),
}))

vi.mock('@/app/app/vfr-rt-exam/actions/submit', () => ({
  submitVfrRtExam: (...a: unknown[]) => mockSubmitVfrRtExam(...a),
}))
vi.mock('../../actions/submit-empty-exam', () => ({
  submitEmptyExamSession: (...a: unknown[]) => mockSubmitEmptyExamSession(...a),
}))
vi.mock('../../actions/discard', () => ({
  discardQuiz: (...a: unknown[]) => mockDiscardQuiz(...a),
}))
vi.mock('../../actions/clear-deployment-pin', () => ({
  clearDeploymentPin: (...a: unknown[]) => mockClearDeploymentPin(...a),
}))
vi.mock('../_utils/quiz-session-storage', () => ({
  clearActiveSessionIfCurrent: (...a: unknown[]) => mockClearActiveSession(...a),
}))

import { handleSubmitVfrRtExamSession } from './quiz-submit-vfr-rt'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const Q_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = 'user-1'

const question = {
  id: Q_ID,
  question_type: 'multiple_choice',
  options: [{ id: 'a', text: 'A' }],
} as unknown as SessionQuestion

function makeOpts(answers: Map<string, DraftAnswer>) {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    answers,
    questions: [question],
    router: createMockRouter(),
    setSubmitting: vi.fn(),
    setError: vi.fn(),
    onSuccess: vi.fn(),
  }
}

const answered = () =>
  new Map<string, DraftAnswer>([[Q_ID, { selectedOptionId: 'a', responseTimeMs: 5 }]])

beforeEach(() => {
  vi.resetAllMocks()
  mockClearDeploymentPin.mockResolvedValue(undefined)
})

describe('handleSubmitVfrRtExamSession', () => {
  it('submits the sanitised answers and lands on the VFR RT report', async () => {
    mockSubmitVfrRtExam.mockResolvedValue({ success: true })
    const opts = makeOpts(answered())
    await handleSubmitVfrRtExamSession(opts)
    expect(mockSubmitVfrRtExam).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: [{ questionId: Q_ID, selectedOptionId: 'a', responseTimeMs: 5 }],
    })
    expect(opts.onSuccess).toHaveBeenCalled()
    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(opts.router.push).toHaveBeenCalledWith(`/app/vfr-rt/report?session=${SESSION_ID}`)
  })

  it('completes the session as empty and lands on the report when no answer survives', async () => {
    mockSubmitEmptyExamSession.mockResolvedValue({ success: true })
    const opts = makeOpts(new Map())
    await handleSubmitVfrRtExamSession(opts)
    expect(mockSubmitEmptyExamSession).toHaveBeenCalledWith({ sessionId: SESSION_ID })
    expect(mockSubmitVfrRtExam).not.toHaveBeenCalled()
    expect(opts.router.push).toHaveBeenCalledWith(`/app/vfr-rt/report?session=${SESSION_ID}`)
  })

  it('keeps the local session, allows retry and never discards when the submit fails', async () => {
    mockSubmitVfrRtExam.mockResolvedValue({ success: false, error: 'Failed to submit exam' })
    const opts = makeOpts(answered())
    await handleSubmitVfrRtExamSession(opts)
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    expect(mockDiscardQuiz).not.toHaveBeenCalled()
    expect(opts.router.push).not.toHaveBeenCalled()
    expect(opts.onSuccess).not.toHaveBeenCalled()
    expect(opts.setError).toHaveBeenLastCalledWith('Something went wrong. Please try again.')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
  })

  it('keeps the local session when the empty-exam completion fails', async () => {
    mockSubmitEmptyExamSession.mockResolvedValue({ success: false, error: 'x' })
    const opts = makeOpts(new Map())
    await handleSubmitVfrRtExamSession(opts)
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    expect(mockDiscardQuiz).not.toHaveBeenCalled()
    expect(opts.router.push).not.toHaveBeenCalled()
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
  })

  it('handles a thrown submit like a failure', async () => {
    mockSubmitVfrRtExam.mockRejectedValue(new Error('network'))
    const opts = makeOpts(answered())
    await handleSubmitVfrRtExamSession(opts)
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    expect(mockDiscardQuiz).not.toHaveBeenCalled()
    expect(opts.router.push).not.toHaveBeenCalled()
    expect(opts.setError).toHaveBeenLastCalledWith('Something went wrong. Please try again.')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
  })
})
