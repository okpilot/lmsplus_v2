import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFree, mockDeviceId } = vi.hoisted(() => ({
  mockFree: vi.fn(),
  mockDeviceId: vi.fn(),
}))

vi.mock('../actions/save-blocking-quiz', () => ({
  saveBlockingQuizForLater: (...args: unknown[]) => mockFree(...args),
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
  mockFree.mockResolvedValue({ success: true })
})

describe('freeActiveSlot', () => {
  it('saves the quiz for this device and drops its local copy, resolving null', async () => {
    localStorage.setItem(KEY, JSON.stringify({ sessionId: 'blocker-1' }))

    await expect(freeActiveSlot('blocker-1')).resolves.toBeNull()

    expect(mockFree).toHaveBeenCalledWith({ sessionId: 'blocker-1', deviceId: DEVICE })
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('keeps the local copy of another session when freeing this one', async () => {
    localStorage.setItem(KEY, JSON.stringify({ sessionId: 'other-session' }))

    await freeActiveSlot('blocker-1')

    expect(localStorage.getItem(KEY)).not.toBeNull()
  })

  it('returns the action error and keeps the local copy when freeing fails', async () => {
    mockFree.mockResolvedValue({ success: false, error: 'You can keep up to 20 saved quizzes.' })
    localStorage.setItem(KEY, JSON.stringify({ sessionId: 'blocker-1' }))

    await expect(freeActiveSlot('blocker-1')).resolves.toBe('You can keep up to 20 saved quizzes.')

    expect(localStorage.getItem(KEY)).not.toBeNull()
  })

  it('resolves the generic error instead of rejecting when the action throws', async () => {
    mockFree.mockRejectedValueOnce(new Error('network'))

    await expect(freeActiveSlot('blocker-1')).resolves.toBe(GENERIC)
  })
})
