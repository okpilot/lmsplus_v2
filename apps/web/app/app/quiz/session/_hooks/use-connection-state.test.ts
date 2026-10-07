import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetConnectionState,
  adjustPending,
  setConnectionStatus,
} from '../_utils/connection-state'
import { useConnectionBlocked, useConnectionState } from './use-connection-state'

beforeEach(() => {
  vi.resetAllMocks()
  _resetConnectionState()
})

describe('useConnectionState', () => {
  it('re-renders with the new status and pending count when the store changes', () => {
    const { result } = renderHook(() => useConnectionState())
    expect(result.current).toEqual({ status: 'ok', pending: 0 })
    act(() => {
      setConnectionStatus('offline')
      adjustPending(2)
    })
    expect(result.current).toEqual({ status: 'offline', pending: 2 })
  })
})

describe('useConnectionBlocked', () => {
  it('is true only while offline, slow, signed out or an answer save is held', () => {
    const { result } = renderHook(() => useConnectionBlocked())
    expect(result.current).toBe(false)
    act(() => setConnectionStatus('offline'))
    expect(result.current).toBe(true)
    act(() => setConnectionStatus('slow'))
    expect(result.current).toBe(true)
    act(() => setConnectionStatus('signed-out'))
    expect(result.current).toBe(true)
    act(() => setConnectionStatus('save-failed'))
    expect(result.current).toBe(true)
    act(() => setConnectionStatus('saved'))
    expect(result.current).toBe(false)
  })
})
