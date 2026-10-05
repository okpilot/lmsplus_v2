import { describe, expect, it } from 'vitest'
import { ANOTHER_SESSION_ACTIVE, blockedFlag } from './_blocked-start'

describe('blockedFlag', () => {
  it('flags the result as blocked when the RPC raised another_session_active', () => {
    expect(blockedFlag('another_session_active')).toEqual({ blocked: true })
  })

  it('flags blocked when the token is embedded in a longer message', () => {
    expect(blockedFlag(`error: ${ANOTHER_SESSION_ACTIVE} (P0001)`)).toEqual({ blocked: true })
  })

  it('returns an empty object for an unrelated RPC error', () => {
    expect(blockedFlag('user not found or inactive')).toEqual({})
  })

  it('returns an empty object when there is no message', () => {
    expect(blockedFlag(undefined)).toEqual({})
  })
})
