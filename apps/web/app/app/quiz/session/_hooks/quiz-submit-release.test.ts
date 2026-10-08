import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFinish, mockSave, mockDiscard, mockPush, mockRelease, mockPin, order } = vi.hoisted(
  () => ({
    mockFinish: vi.fn(),
    mockSave: vi.fn(),
    mockDiscard: vi.fn(),
    mockPush: vi.fn(),
    mockRelease: vi.fn(),
    mockPin: vi.fn(),
    order: [] as string[],
  }),
)

vi.mock('../../actions/finish', () => ({ finishQuizSession: mockFinish }))
vi.mock('../../actions/saved-quiz', () => ({ saveQuizForLater: mockSave }))
vi.mock('../../actions/discard', () => ({ discardQuiz: mockDiscard }))
vi.mock('../../actions/clear-deployment-pin', () => ({ clearDeploymentPin: mockPin }))
vi.mock('../_utils/quiz-device-id', () => ({ getQuizDeviceId: () => 'device-1' }))
vi.mock('../_utils/quiz-session-storage', () => ({ clearActiveSessionIfCurrent: vi.fn() }))
vi.mock('./use-back-guard', () => ({ releaseBackGuard: () => mockRelease() }))

import { handleDiscardSession, handleSaveSession, handleSubmitSession } from './quiz-submit'

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const router = { push: (url: string) => mockPush(url) } as never
const base = {
  userId: 'user-1',
  sessionId: SESSION_ID,
  router,
  setSubmitting: vi.fn(),
  setError: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
  order.length = 0
  mockPin.mockResolvedValue(undefined)
  mockRelease.mockImplementation(async () => {
    order.push('release')
  })
  mockPush.mockImplementation(() => order.push('push'))
})

describe('leaving the runner pops the back-guard entry first', () => {
  it('pops the entry before navigating to the quiz list after Save for later', async () => {
    mockSave.mockResolvedValue({ success: true })
    await handleSaveSession(base)
    expect(order).toEqual(['release', 'push'])
    expect(mockPush).toHaveBeenCalledWith('/app/quiz')
  })

  it('pops the entry before navigating to the quiz list after Discard', async () => {
    mockDiscard.mockResolvedValue({ success: true })
    await handleDiscardSession(base)
    expect(order).toEqual(['release', 'push'])
    expect(mockPush).toHaveBeenCalledWith('/app/quiz')
  })

  it('pops the entry, then disarms, then navigates to the report after Submit', async () => {
    mockFinish.mockResolvedValue({ success: true })
    await handleSubmitSession({
      ...base,
      answers: new Map([['q1', { selectedOptionId: 'a', responseTimeMs: 1 }]]),
      onSuccess: () => order.push('onSuccess'),
    })
    expect(order).toEqual(['release', 'onSuccess', 'push'])
    expect(mockPush).toHaveBeenCalledWith(`/app/quiz/report?session=${SESSION_ID}`)
  })

  it('keeps the entry when Save for later is refused', async () => {
    mockSave.mockResolvedValue({ success: false, error: 'nope' })
    await handleSaveSession(base)
    expect(mockRelease).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('keeps the entry when Discard fails', async () => {
    mockDiscard.mockResolvedValue({ success: false, error: 'nope' })
    await handleDiscardSession(base)
    expect(mockRelease).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('keeps the entry when Submit fails', async () => {
    mockFinish.mockResolvedValue({ success: false, error: 'nope' })
    await handleSubmitSession({
      ...base,
      answers: new Map([['q1', { selectedOptionId: 'a', responseTimeMs: 1 }]]),
      onSuccess: vi.fn(),
    })
    expect(mockRelease).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
