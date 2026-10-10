import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockResume, mockDiscard, mockPush, mockRefresh, mockClearPin } = vi.hoisted(() => ({
  mockClearPin: vi.fn(),
  mockResume: vi.fn(),
  mockDiscard: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }))
vi.mock('../actions/saved-quiz', () => ({
  resumeSavedQuiz: (...a: unknown[]) => mockResume(...a),
  discardSavedQuiz: (...a: unknown[]) => mockDiscard(...a),
}))
vi.mock('../actions/clear-deployment-pin', () => ({
  clearDeploymentPin: (...a: unknown[]) => mockClearPin(...a),
}))
vi.mock('../session/_utils/quiz-device-id', () => ({ getQuizDeviceId: () => 'device-1' }))

import { PROGRESS_ERROR_MESSAGES } from '../actions/progress-error-messages'
import { useSavedCardActions } from './use-saved-card-actions'

beforeEach(() => {
  vi.resetAllMocks()
  mockResume.mockResolvedValue({ success: true })
  mockDiscard.mockResolvedValue({ success: true })
  mockClearPin.mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('useSavedCardActions', () => {
  it('opens the saved session after a successful resume', async () => {
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.resume())

    expect(mockResume).toHaveBeenCalledWith({ sessionId: 's1', deviceId: 'device-1' })
    expect(mockPush).toHaveBeenCalledWith('/app/quiz/session/s1')
  })

  it('expires the quiz deployment pin before opening a resumed saved session', async () => {
    const order: string[] = []
    mockClearPin.mockImplementation(async () => void order.push('clear'))
    mockPush.mockImplementation(() => void order.push('push'))
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.resume())

    expect(mockClearPin).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['clear', 'push'])
  })

  it('still opens the resumed session when expiring the pin fails', async () => {
    mockClearPin.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.resume())

    expect(mockPush).toHaveBeenCalledWith('/app/quiz/session/s1')
  })

  it('keeps the quiz deployment pin when the saved session fails to resume', async () => {
    mockResume.mockResolvedValueOnce({ success: false, error: 'x' })
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.resume())

    expect(mockClearPin).not.toHaveBeenCalled()
  })

  it('resumes only once when resume is triggered twice in the same tick', async () => {
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(async () => {
      void result.current.resume()
      void result.current.resume()
    })

    expect(mockResume).toHaveBeenCalledTimes(1)
  })

  it('shows the error and allows a retry when resume fails', async () => {
    mockResume.mockResolvedValueOnce({
      success: false,
      error: PROGRESS_ERROR_MESSAGES.another_session_active,
    })
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.resume())
    await waitFor(() =>
      expect(result.current.error).toBe(PROGRESS_ERROR_MESSAGES.another_session_active),
    )
    expect(mockPush).not.toHaveBeenCalled()

    await act(() => result.current.resume())
    expect(mockPush).toHaveBeenCalledWith('/app/quiz/session/s1')
  })

  it('shows generic resume copy instead of an unmapped server error', async () => {
    mockResume.mockResolvedValueOnce({ success: false, error: 'Could not save progress' })
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.resume())

    await waitFor(() =>
      expect(result.current.error).toBe('Unable to resume right now. Please try again.'),
    )
  })

  it('shows the sign-in copy as-is when resume fails because the sign-in expired', async () => {
    const signIn = PROGRESS_ERROR_MESSAGES.not_authenticated
    mockResume.mockResolvedValueOnce({ success: false, error: signIn })
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.resume())

    await waitFor(() => expect(result.current.error).toBe(signIn))
  })

  it('shows generic delete copy instead of an unmapped server error', async () => {
    mockDiscard.mockResolvedValueOnce({ success: false, error: 'Could not save progress' })
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.remove())

    await waitFor(() => expect(result.current.error).toBe('Failed to delete. Please try again.'))
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('shows mapped delete copy as-is', async () => {
    const mapped = PROGRESS_ERROR_MESSAGES.session_not_saved
    mockDiscard.mockResolvedValueOnce({ success: false, error: mapped })
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.remove())

    await waitFor(() => expect(result.current.error).toBe(mapped))
  })

  it('refreshes the list after a confirmed delete', async () => {
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.remove())

    expect(mockDiscard).toHaveBeenCalledWith({ sessionId: 's1' })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('does nothing when the delete is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = renderHook(() => useSavedCardActions('s1'))

    await act(() => result.current.remove())

    expect(mockDiscard).not.toHaveBeenCalled()
  })
})
