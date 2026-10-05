import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockResume, mockDiscard, mockRefresh, mockPush, mockClearPin } = vi.hoisted(() => ({
  mockResume: vi.fn(),
  mockClearPin: vi.fn(),
  mockDiscard: vi.fn(),
  mockRefresh: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh, push: mockPush }) }))
vi.mock('../../actions/saved-quiz', () => ({
  resumeSavedQuiz: (...a: unknown[]) => mockResume(...a),
  discardSavedQuiz: (...a: unknown[]) => mockDiscard(...a),
}))
vi.mock('../../actions/clear-deployment-pin', () => ({
  clearDeploymentPin: () => mockClearPin(),
}))
vi.mock('../_utils/quiz-device-id', () => ({ getQuizDeviceId: () => 'device-1' }))

import { useSavedSessionResume } from './use-saved-session-resume'

beforeEach(() => {
  vi.resetAllMocks()
  mockResume.mockResolvedValue({ success: true })
  mockDiscard.mockResolvedValue({ success: true })
  mockClearPin.mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('useSavedSessionResume', () => {
  it('resumes the saved quiz on this device and reloads the page into it', async () => {
    const { result } = renderHook(() => useSavedSessionResume('s1'))

    await act(async () => {
      await result.current.resume()
    })

    expect(mockResume).toHaveBeenCalledWith({ sessionId: 's1', deviceId: 'device-1' })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(mockClearPin).not.toHaveBeenCalled()
  })

  it('shows the mapped error and stays put when the resume is refused', async () => {
    mockResume.mockResolvedValue({ success: false, error: 'Finish your open quiz first.' })
    const { result } = renderHook(() => useSavedSessionResume('s1'))

    await act(async () => {
      await result.current.resume()
    })

    expect(result.current.error).toBe('Finish your open quiz first.')
    expect(mockRefresh).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('lets the student retry after a failed resume', async () => {
    mockResume.mockResolvedValueOnce({ success: false, error: 'x' })
    const { result } = renderHook(() => useSavedSessionResume('s1'))

    await act(async () => {
      await result.current.resume()
    })
    await act(async () => {
      await result.current.resume()
    })

    expect(mockResume).toHaveBeenCalledTimes(2)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('runs a double click only once', async () => {
    const { result } = renderHook(() => useSavedSessionResume('s1'))

    await act(async () => {
      await Promise.all([result.current.resume(), result.current.resume()])
    })

    expect(mockResume).toHaveBeenCalledTimes(1)
  })

  it('deletes the saved quiz and returns to the quiz page', async () => {
    const { result } = renderHook(() => useSavedSessionResume('s1'))

    await act(async () => {
      await result.current.discard()
    })

    expect(mockDiscard).toHaveBeenCalledWith({ sessionId: 's1' })
    expect(mockPush).toHaveBeenCalledWith('/app/quiz')
  })

  it('unpins the deployment before leaving for the quiz page after a delete', async () => {
    const { result } = renderHook(() => useSavedSessionResume('s1'))

    await act(async () => {
      await result.current.discard()
    })

    expect(mockClearPin).toHaveBeenCalledTimes(1)
    expect(mockClearPin.mock.invocationCallOrder[0]).toBeLessThan(
      mockPush.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('still returns to the quiz page when unpinning the deployment fails', async () => {
    mockClearPin.mockRejectedValue(new Error('cookie'))
    const { result } = renderHook(() => useSavedSessionResume('s1'))

    await act(async () => {
      await result.current.discard()
    })

    expect(mockPush).toHaveBeenCalledWith('/app/quiz')
  })

  it('keeps the saved quiz when the student cancels the delete', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    const { result } = renderHook(() => useSavedSessionResume('s1'))

    await act(async () => {
      await result.current.discard()
    })

    expect(mockDiscard).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows the error and stays when the delete is refused', async () => {
    mockDiscard.mockResolvedValue({ success: false, error: 'Could not delete' })
    const { result } = renderHook(() => useSavedSessionResume('s1'))

    await act(async () => {
      await result.current.discard()
    })

    expect(result.current.error).toBe('Could not delete')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows a generic error when the action throws', async () => {
    mockResume.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useSavedSessionResume('s1'))

    await act(async () => {
      await result.current.resume()
    })

    expect(result.current.error).toMatch(/try again/i)
    expect(result.current.loading).toBe(false)
  })
})
