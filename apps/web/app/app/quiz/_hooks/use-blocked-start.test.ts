import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClaim, mockSave, mockDeviceId } = vi.hoisted(() => ({
  mockClaim: vi.fn(),
  mockSave: vi.fn(),
  mockDeviceId: vi.fn(),
}))

vi.mock('../actions/quiz-progress', () => ({
  claimQuizSession: (...args: unknown[]) => mockClaim(...args),
}))
vi.mock('../actions/saved-quiz', () => ({
  saveQuizForLater: (...args: unknown[]) => mockSave(...args),
}))
vi.mock('../session/_utils/quiz-device-id', () => ({
  getQuizDeviceId: () => mockDeviceId(),
}))

import { useBlockedStart } from './use-blocked-start'

const OFFER = { sessionId: 'blocker-1', subjectName: 'Air Law' }
const DEVICE = 'device-1'

beforeEach(() => {
  vi.resetAllMocks()
  mockDeviceId.mockReturnValue(DEVICE)
  mockClaim.mockResolvedValue({ success: true })
  mockSave.mockResolvedValue({ success: true })
})

function renderWithOffer() {
  const hook = renderHook(() => useBlockedStart())
  act(() => hook.result.current.setOffer(OFFER))
  return hook
}

describe('useBlockedStart', () => {
  it('takes the blocking quiz over, saves it for later, then re-runs the start, in that order', async () => {
    const order: string[] = []
    mockClaim.mockImplementation(async () => {
      order.push('claim')
      return { success: true }
    })
    mockSave.mockImplementation(async () => {
      order.push('save')
      return { success: true }
    })
    const start = vi.fn(async () => {
      order.push('start')
    })
    const { result } = renderWithOffer()

    await act(async () => result.current.accept(start))

    expect(order).toEqual(['claim', 'save', 'start'])
    expect(mockClaim).toHaveBeenCalledWith({ sessionId: 'blocker-1', deviceId: DEVICE })
    expect(mockSave).toHaveBeenCalledWith({ sessionId: 'blocker-1', deviceId: DEVICE })
    expect(result.current.offer).toBeNull()
  })

  it('shows the claim error and does not save or start when the takeover fails', async () => {
    mockClaim.mockResolvedValue({ success: false, error: 'Could not take over' })
    const start = vi.fn()
    const { result } = renderWithOffer()

    await act(async () => result.current.accept(start))

    expect(result.current.error).toBe('Could not take over')
    expect(mockSave).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
    expect(result.current.offer).toEqual(OFFER)
  })

  it('shows the save error and does not start when saving fails', async () => {
    mockSave.mockResolvedValue({ success: false, error: 'Too many saved quizzes' })
    const start = vi.fn()
    const { result } = renderWithOffer()

    await act(async () => result.current.accept(start))

    expect(result.current.error).toBe('Too many saved quizzes')
    expect(start).not.toHaveBeenCalled()
  })

  it('shows a generic error and stays retryable when an action throws', async () => {
    mockClaim.mockRejectedValueOnce(new Error('network'))
    const start = vi.fn()
    const { result } = renderWithOffer()

    await act(async () => result.current.accept(start))
    expect(result.current.error).toBe('Something went wrong. Please try again.')
    expect(start).not.toHaveBeenCalled()

    await act(async () => result.current.accept(start))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('runs the takeover once when accepted twice in the same tick', async () => {
    const start = vi.fn()
    const { result } = renderWithOffer()

    await act(async () => {
      await Promise.all([result.current.accept(start), result.current.accept(start)])
    })

    expect(mockClaim).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is no offer', async () => {
    const start = vi.fn()
    const { result } = renderHook(() => useBlockedStart())

    await act(async () => result.current.accept(start))

    expect(mockClaim).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })
})
