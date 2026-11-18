import { describe, expect, it } from 'vitest'
import { isIssuable } from './issuable'

describe('isIssuable', () => {
  it.each(['no_code', 'expired', 'voided'])(
    'is true for a %s exam of an active person',
    (status) => {
      expect(isIssuable({ status } as never, false)).toBe(true)
    },
  )

  it.each(['waiting', 'ready', 'voided_attempt', 'running', 'finished', 'absent', 'discarded'])(
    'is false for a %s exam',
    (status) => {
      expect(isIssuable({ status } as never, false)).toBe(false)
    },
  )

  it('is false for a deactivated person', () => {
    expect(isIssuable({ status: 'no_code' } as never, true)).toBe(false)
  })
})
