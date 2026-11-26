import { describe, expect, it } from 'vitest'
import { codeDisplayStatus, codeRowVoidable, sittingCodeVoidable } from './_void-policy'

const base = { consumed: false, sessionEndedAt: null, sessionVisible: true }

describe('codeRowVoidable', () => {
  const row = {
    sittingEntryId: 'e1',
    consumedAt: '2026-11-25T09:00:00Z',
    sessionEndedAt: null,
    sessionDeletedAt: null,
  }

  // Derived from `consumedAt`, not the badge status: `deriveStatus` ranks `voided_at` above
  // `consumed_at`, so a status-derived `consumed` would disagree with `checkSittingCode`, which
  // reads the timestamp.
  it('calls a consumed-then-voided sitting code consumed, as the server guard does', () => {
    expect(codeRowVoidable(row)).toBe(true)
  })

  it('refuses an unconsumed sitting code', () => {
    expect(codeRowVoidable({ ...row, consumedAt: null })).toBe(false)
  })
})

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

describe('codeDisplayStatus', () => {
  const row = { sessionEndedAt: null, sessionDeletedAt: null }

  it('passes an unconsumed status through', () => {
    expect(codeDisplayStatus({ ...row, status: 'waiting' })).toBe('waiting')
    expect(codeDisplayStatus({ ...row, status: 'voided' })).toBe('voided')
  })

  it('reads a live attempt as consumed', () => {
    expect(codeDisplayStatus({ ...row, status: 'consumed' })).toBe('consumed')
  })

  it('reads an ended attempt as finished', () => {
    expect(
      codeDisplayStatus({ ...row, status: 'consumed', sessionEndedAt: '2026-11-25T10:00:00Z' }),
    ).toBe('finished')
  })

  it('reads a discarded attempt as discarded', () => {
    expect(
      codeDisplayStatus({ ...row, status: 'consumed', sessionDeletedAt: '2026-11-25T10:00:00Z' }),
    ).toBe('discarded')
  })

  // `list_exam_sitting_roster` joins the session on `deleted_at IS NULL`, so it calls this
  // 'discarded'; the codes tab must not call the same attempt 'Finished'.
  it('reads an ended-then-deleted attempt as discarded, not finished', () => {
    expect(
      codeDisplayStatus({
        status: 'consumed',
        sessionEndedAt: '2026-11-25T10:00:00Z',
        sessionDeletedAt: '2026-11-25T11:00:00Z',
      }),
    ).toBe('discarded')
  })
})
