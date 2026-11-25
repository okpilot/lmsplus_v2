import { describe, expect, it } from 'vitest'
import { sittingCodeVoidable } from './_void-policy'

const base = { consumed: false, sessionEndedAt: null, sessionVisible: true }

describe('sittingCodeVoidable', () => {
  it('always allows a legacy code', () => {
    expect(sittingCodeVoidable({ ...base, sittingEntryId: null })).toBe(true)
  })

  it('allows a sitting code whose attempt is still running', () => {
    expect(sittingCodeVoidable({ ...base, sittingEntryId: 'e1', consumed: true })).toBe(true)
  })

  it('refuses a sitting code whose attempt has ended', () => {
    expect(
      sittingCodeVoidable({
        ...base,
        sittingEntryId: 'e1',
        consumed: true,
        sessionEndedAt: '2026-11-25T10:00:00Z',
      }),
    ).toBe(false)
  })

  it('refuses an unconsumed sitting code', () => {
    expect(sittingCodeVoidable({ ...base, sittingEntryId: 'e1' })).toBe(false)
  })

  it('refuses a consumed sitting code whose session is not visible', () => {
    expect(
      sittingCodeVoidable({ ...base, sittingEntryId: 'e1', consumed: true, sessionVisible: false }),
    ).toBe(false)
  })
})
