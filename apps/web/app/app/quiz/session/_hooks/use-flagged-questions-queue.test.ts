import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockToggleFlag, mockWithReconnect } = vi.hoisted(() => ({
  mockToggleFlag: vi.fn(),
  mockWithReconnect: vi.fn(),
}))

vi.mock('../../actions/flag', () => ({
  toggleFlag: (...args: unknown[]) => mockToggleFlag(...args),
}))
vi.mock('../_utils/with-reconnect', () => ({
  withReconnect: (...args: unknown[]) => mockWithReconnect(...args),
}))

import { useFlaggedQuestions } from './use-flagged-questions'

const Q1 = '00000000-0000-0000-0000-000000000001'

beforeEach(() => {
  vi.resetAllMocks()
  mockWithReconnect.mockImplementation((fn: () => Promise<unknown>) => fn())
})

describe('useFlaggedQuestions reconnect queue', () => {
  it('sends the flag through the reconnect queue', async () => {
    mockToggleFlag.mockResolvedValue({ success: true, flagged: true })
    const { result } = renderHook(() => useFlaggedQuestions([]))
    await act(async () => {
      await result.current.toggleFlag(Q1)
    })
    expect(mockWithReconnect).toHaveBeenCalledTimes(1)
  })

  it('does not call the action before the queue runs it', async () => {
    mockWithReconnect.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useFlaggedQuestions([]))
    act(() => {
      void result.current.toggleFlag(Q1)
    })
    expect(mockToggleFlag).not.toHaveBeenCalled()
  })

  it('asks for flagged: true when the question is not flagged', async () => {
    mockToggleFlag.mockResolvedValue({ success: true, flagged: true })
    const { result } = renderHook(() => useFlaggedQuestions([]))
    await act(async () => {
      await result.current.toggleFlag(Q1)
    })
    expect(mockToggleFlag).toHaveBeenCalledWith({ questionId: Q1, flagged: true })
  })

  it('asks for flagged: false when the question is flagged', async () => {
    mockToggleFlag.mockResolvedValue({ success: true, flagged: false })
    const { result } = renderHook(() => useFlaggedQuestions([Q1]))
    await act(async () => {
      await result.current.toggleFlag(Q1)
    })
    expect(mockToggleFlag).toHaveBeenCalledWith({ questionId: Q1, flagged: false })
  })

  it('asks for the opposite state on a second press after the first lands', async () => {
    mockToggleFlag.mockResolvedValueOnce({ success: true, flagged: true })
    mockToggleFlag.mockResolvedValueOnce({ success: true, flagged: false })
    const { result } = renderHook(() => useFlaggedQuestions([]))
    await act(async () => {
      await result.current.toggleFlag(Q1)
    })
    await act(async () => {
      await result.current.toggleFlag(Q1)
    })
    expect(mockToggleFlag).toHaveBeenLastCalledWith({ questionId: Q1, flagged: false })
  })

  it('returns false and leaves the flag unchanged when the queue reports signed out', async () => {
    mockWithReconnect.mockResolvedValue({ success: false, error: 'Your sign-in has expired.' })
    const { result } = renderHook(() => useFlaggedQuestions([]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.toggleFlag(Q1)
    })
    expect(ok).toBe(false)
    expect(result.current.isFlagged(Q1)).toBe(false)
  })
})
