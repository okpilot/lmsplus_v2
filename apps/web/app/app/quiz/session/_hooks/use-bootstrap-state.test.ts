import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useBootstrapState } from './use-bootstrap-state'

describe('useBootstrapState', () => {
  it('starts with no session, no questions and no errors', () => {
    const { result } = renderHook(() => useBootstrapState())
    expect(result.current.state).toEqual({
      session: null,
      questions: null,
      flaggedIds: [],
      error: null,
      claimError: null,
    })
  })

  it('reflects a setter call in the matching state field', () => {
    const { result } = renderHook(() => useBootstrapState())
    act(() => result.current.setters.setError('boom'))
    act(() => result.current.setters.setClaimError('claim failed'))
    expect(result.current.state.error).toBe('boom')
    expect(result.current.state.claimError).toBe('claim failed')
  })
})
