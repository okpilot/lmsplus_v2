import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClaim, mockSave, mockRoom, mockDeviceId } = vi.hoisted(() => ({
  mockClaim: vi.fn(),
  mockSave: vi.fn(),
  mockRoom: vi.fn(),
  mockDeviceId: vi.fn(),
}))

vi.mock('../actions/quiz-progress', () => ({
  claimQuizSession: (...args: unknown[]) => mockClaim(...args),
}))
vi.mock('../actions/saved-quiz', () => ({
  saveQuizForLater: (...args: unknown[]) => mockSave(...args),
  checkSavedQuizRoom: (...args: unknown[]) => mockRoom(...args),
}))
vi.mock('../session/_utils/quiz-device-id', () => ({
  getQuizDeviceId: () => mockDeviceId(),
}))

import { freeActiveSlot } from './free-active-slot'

const DEVICE = 'device-1'
const GENERIC = 'Something went wrong. Please try again.'
const KEY = 'quiz-active-session:u1'

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mockDeviceId.mockReturnValue(DEVICE)
  mockClaim.mockResolvedValue({ success: true })
  mockSave.mockResolvedValue({ success: true })
  mockRoom.mockResolvedValue({ success: true })
})

describe('freeActiveSlot', () => {
  it('claims then saves the quiz and drops its local copy, resolving null', async () => {
    localStorage.setItem(KEY, JSON.stringify({ sessionId: 'blocker-1' }))

    await expect(freeActiveSlot('blocker-1')).resolves.toBeNull()

    expect(mockClaim).toHaveBeenCalledWith({ sessionId: 'blocker-1', deviceId: DEVICE })
    expect(mockSave).toHaveBeenCalledWith({ sessionId: 'blocker-1', deviceId: DEVICE })
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('keeps the local copy of another session when freeing this one', async () => {
    localStorage.setItem(KEY, JSON.stringify({ sessionId: 'other-session' }))

    await freeActiveSlot('blocker-1')

    expect(localStorage.getItem(KEY)).not.toBeNull()
  })

  it('returns the limit error and neither claims nor saves when the saved quizzes are full', async () => {
    mockRoom.mockResolvedValue({ success: false, error: 'You can keep up to 20 saved quizzes.' })

    await expect(freeActiveSlot('blocker-1')).resolves.toBe('You can keep up to 20 saved quizzes.')

    expect(mockClaim).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('returns the claim error and does not save when the takeover fails', async () => {
    mockClaim.mockResolvedValue({ success: false, error: 'Could not take over' })

    await expect(freeActiveSlot('blocker-1')).resolves.toBe('Could not take over')

    expect(mockSave).not.toHaveBeenCalled()
  })

  it('returns the save error and keeps the local copy when saving fails', async () => {
    mockSave.mockResolvedValue({ success: false, error: 'Too many saved quizzes' })
    localStorage.setItem(KEY, JSON.stringify({ sessionId: 'blocker-1' }))

    await expect(freeActiveSlot('blocker-1')).resolves.toBe('Too many saved quizzes')

    expect(localStorage.getItem(KEY)).not.toBeNull()
  })

  it('resolves the generic error instead of rejecting when the room check throws', async () => {
    mockRoom.mockRejectedValueOnce(new Error('network'))

    await expect(freeActiveSlot('blocker-1')).resolves.toBe(GENERIC)

    expect(mockClaim).not.toHaveBeenCalled()
  })

  it('resolves the generic error instead of rejecting when the claim throws', async () => {
    mockClaim.mockRejectedValueOnce(new Error('network'))

    await expect(freeActiveSlot('blocker-1')).resolves.toBe(GENERIC)

    expect(mockSave).not.toHaveBeenCalled()
  })
})
