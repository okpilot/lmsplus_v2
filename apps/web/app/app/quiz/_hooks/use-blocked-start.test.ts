import { act, renderHook } from '@testing-library/react'
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

import { useBlockedStart } from './use-blocked-start'

const OFFER = { sessionId: 'blocker-1', subjectName: 'Air Law' }
const DEVICE = 'device-1'

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mockDeviceId.mockReturnValue(DEVICE)
  mockFree.mockResolvedValue({ success: true })
})

function renderWithOffer() {
  const hook = renderHook(() => useBlockedStart())
  act(() => hook.result.current.setOffer(OFFER))
  return hook
}

describe('useBlockedStart', () => {
  it('saves the blocking quiz for later, then re-runs the start, in that order', async () => {
    const order: string[] = []
    mockFree.mockImplementation(async () => {
      order.push('free')
      return { success: true }
    })
    const start = vi.fn(async () => {
      order.push('start')
    })
    const { result } = renderWithOffer()

    await act(async () => result.current.accept(start))

    expect(order).toEqual(['free', 'start'])
    expect(mockFree).toHaveBeenCalledWith({ sessionId: 'blocker-1', deviceId: DEVICE })
    expect(result.current.offer).toBeNull()
  })

  it("shows the action's error, keeps the offer and does not start when freeing the slot fails", async () => {
    mockFree.mockResolvedValue({ success: false, error: 'You can keep up to 20 saved quizzes.' })
    const start = vi.fn()
    const { result } = renderWithOffer()

    await act(async () => result.current.accept(start))

    expect(result.current.error).toBe('You can keep up to 20 saved quizzes.')
    expect(start).not.toHaveBeenCalled()
    expect(result.current.offer).toEqual(OFFER)
  })

  it('shows a generic error and stays retryable when an action throws', async () => {
    mockFree.mockRejectedValueOnce(new Error('network'))
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

    expect(mockFree).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is no offer', async () => {
    const start = vi.fn()
    const { result } = renderHook(() => useBlockedStart())

    await act(async () => result.current.accept(start))

    expect(mockFree).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('clears an earlier error when a new offer is shown or the offer is hidden', async () => {
    mockFree.mockResolvedValue({ success: false, error: 'You can keep up to 20 saved quizzes.' })
    const { result } = renderWithOffer()
    await act(async () => result.current.accept(vi.fn()))
    expect(result.current.error).toBe('You can keep up to 20 saved quizzes.')

    act(() => result.current.setOffer(OFFER))
    expect(result.current.error).toBeNull()

    await act(async () => result.current.accept(vi.fn()))
    expect(result.current.error).toBe('You can keep up to 20 saved quizzes.')
    act(() => result.current.setOffer(null))
    expect(result.current.error).toBeNull()
  })

  it('logs a rejected start without showing the generic error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const start = vi.fn().mockRejectedValue(new Error('start boom'))
    const { result } = renderWithOffer()

    await act(async () => result.current.accept(start))

    expect(log).toHaveBeenCalled()
    expect(result.current.error).toBeNull()
    expect(result.current.offer).toBeNull()
    expect(result.current.saving).toBe(false)
  })
})
