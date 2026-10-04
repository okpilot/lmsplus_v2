import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetConnectionState,
  adjustPending,
  setConnectionStatus,
} from '../_utils/connection-state'
import { useConnectionState } from './use-connection-state'

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
