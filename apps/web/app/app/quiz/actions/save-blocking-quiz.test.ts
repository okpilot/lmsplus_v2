import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from './progress-error-messages'

const { mockRoom, mockClaim, mockSave } = vi.hoisted(() => ({
  mockRoom: vi.fn(),
  mockClaim: vi.fn(),
  mockSave: vi.fn(),
}))

vi.mock('./saved-quiz', () => ({
  checkSavedQuizRoom: (...args: unknown[]) => mockRoom(...args),
  saveQuizForLater: (...args: unknown[]) => mockSave(...args),
}))
vi.mock('./quiz-progress', () => ({
  claimQuizSession: (...args: unknown[]) => mockClaim(...args),
}))

import { saveBlockingQuizForLater } from './save-blocking-quiz'

const INPUT = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  deviceId: '22222222-2222-4222-8222-222222222222',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRoom.mockResolvedValue({ success: true })
  mockClaim.mockResolvedValue({ success: true })
  mockSave.mockResolvedValue({ success: true })
})

describe('saveBlockingQuizForLater', () => {
  it('checks room, takes the quiz over, then saves it, in that order', async () => {
    const order: string[] = []
    mockRoom.mockImplementation(async () => {
      order.push('room')
      return { success: true }
    })
    mockClaim.mockImplementation(async () => {
      order.push('claim')
      return { success: true }
    })
    mockSave.mockImplementation(async () => {
      order.push('save')
      return { success: true }
    })

    await expect(saveBlockingQuizForLater(INPUT)).resolves.toEqual({ success: true })

    expect(order).toEqual(['room', 'claim', 'save'])
    expect(mockClaim).toHaveBeenCalledWith(INPUT)
    expect(mockSave).toHaveBeenCalledWith(INPUT)
  })

  it('returns the limit error and neither takes over nor saves when saved quizzes are full', async () => {
    mockRoom.mockResolvedValue({ success: false, error: 'You can keep up to 20 saved quizzes.' })

    await expect(saveBlockingQuizForLater(INPUT)).resolves.toEqual({
      success: false,
      error: 'You can keep up to 20 saved quizzes.',
    })

    expect(mockClaim).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('returns the takeover error and does not save when the takeover fails', async () => {
    mockClaim.mockResolvedValue({ success: false, error: 'Could not take over' })

    await expect(saveBlockingQuizForLater(INPUT)).resolves.toEqual({
      success: false,
      error: 'Could not take over',
    })

    expect(mockSave).not.toHaveBeenCalled()
  })

  it('returns the save error when saving fails', async () => {
    mockSave.mockResolvedValue({ success: false, error: 'Too many saved quizzes' })

    await expect(saveBlockingQuizForLater(INPUT)).resolves.toEqual({
      success: false,
      error: 'Too many saved quizzes',
    })
  })

  it('does not take over when the room check throws', async () => {
    mockRoom.mockRejectedValue(new Error('network'))

    await expect(saveBlockingQuizForLater(INPUT)).rejects.toThrow('network')

    expect(mockClaim).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('does not save when the takeover throws', async () => {
    mockClaim.mockRejectedValue(new Error('network'))

    await expect(saveBlockingQuizForLater(INPUT)).rejects.toThrow('network')

    expect(mockSave).not.toHaveBeenCalled()
  })

  it('rejects malformed input without touching any step', async () => {
    await expect(saveBlockingQuizForLater({ sessionId: 'not-a-uuid' })).resolves.toEqual({
      success: false,
      error: INVALID_INPUT,
    })

    expect(mockRoom).not.toHaveBeenCalled()
    expect(mockClaim).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })
})
