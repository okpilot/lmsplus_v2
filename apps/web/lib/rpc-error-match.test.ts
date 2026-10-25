import { describe, expect, it } from 'vitest'
import { matchRpcError } from './rpc-error-match'

const MAP = { another_session_active: 'A', session_saved: 'B' }

describe('matchRpcError', () => {
  it('returns the mapped value for an exact message', () => {
    expect(matchRpcError('another_session_active', MAP)).toBe('A')
  })

  it('returns undefined when the message merely contains a key', () => {
    expect(matchRpcError('xx another_session_active', MAP)).toBeUndefined()
    expect(matchRpcError('another_session_active (P0001)', MAP)).toBeUndefined()
  })

  it('returns undefined for prototype keys', () => {
    expect(matchRpcError('toString', MAP)).toBeUndefined()
    expect(matchRpcError('constructor', MAP)).toBeUndefined()
    expect(matchRpcError('__proto__', MAP)).toBeUndefined()
  })

  it('returns undefined for a missing message', () => {
    expect(matchRpcError(undefined, MAP)).toBeUndefined()
  })
})
