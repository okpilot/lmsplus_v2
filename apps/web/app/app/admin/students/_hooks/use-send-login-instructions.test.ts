import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockToastSuccess = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())
const mockSendLoginInstructions = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

vi.mock('../actions/send-login-instructions', () => ({
  sendLoginInstructions: mockSendLoginInstructions,
}))

import { useSendLoginInstructions } from './use-send-login-instructions'

const STUDENT_ID = 'student-001'
const EMAIL = 'alice@example.com'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useSendLoginInstructions', () => {
  it('shows a success toast naming the recipient email after a successful send', async () => {
    mockSendLoginInstructions.mockResolvedValue({ success: true })
    const { result } = renderHook(() =>
      useSendLoginInstructions({ studentId: STUDENT_ID, email: EMAIL }),
    )

    act(() => {
      result.current.handleSend()
    })

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Login instructions sent to alice@example.com'),
    )
    expect(mockSendLoginInstructions).toHaveBeenCalledWith({ id: STUDENT_ID })
  })

  it('shows the returned error message when the send fails', async () => {
    mockSendLoginInstructions.mockResolvedValue({ success: false, error: 'User not found' })
    const { result } = renderHook(() =>
      useSendLoginInstructions({ studentId: STUDENT_ID, email: EMAIL }),
    )

    act(() => {
      result.current.handleSend()
    })

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('User not found'))
  })

  it('shows a generic error toast on an unexpected rejection', async () => {
    mockSendLoginInstructions.mockRejectedValue(new Error('network failure'))
    const { result } = renderHook(() =>
      useSendLoginInstructions({ studentId: STUDENT_ID, email: EMAIL }),
    )

    act(() => {
      result.current.handleSend()
    })

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Failed to send login instructions'),
    )
  })

  it('ignores a second call fired before the first send settles', async () => {
    let resolveSend: (v: { success: true }) => void = () => {}
    mockSendLoginInstructions.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve
      }),
    )
    const { result } = renderHook(() =>
      useSendLoginInstructions({ studentId: STUDENT_ID, email: EMAIL }),
    )

    act(() => {
      result.current.handleSend()
      result.current.handleSend()
    })

    await act(async () => {
      resolveSend({ success: true })
    })

    expect(mockSendLoginInstructions).toHaveBeenCalledTimes(1)
  })

  it('allows sending again after a previous send has settled', async () => {
    mockSendLoginInstructions.mockResolvedValue({ success: true })
    const { result } = renderHook(() =>
      useSendLoginInstructions({ studentId: STUDENT_ID, email: EMAIL }),
    )

    act(() => {
      result.current.handleSend()
    })
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.handleSend()
    })
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(2))

    expect(mockSendLoginInstructions).toHaveBeenCalledTimes(2)
  })

  it('notifies the caller once the send settles', async () => {
    mockSendLoginInstructions.mockResolvedValue({ success: false, error: 'User not found' })
    const onSettled = vi.fn()
    const { result } = renderHook(() =>
      useSendLoginInstructions({ studentId: STUDENT_ID, email: EMAIL, onSettled }),
    )

    act(() => {
      result.current.handleSend()
    })

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1))
  })
})
