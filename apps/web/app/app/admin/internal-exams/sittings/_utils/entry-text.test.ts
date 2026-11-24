import { describe, expect, it } from 'vitest'
import { ENTRY_STATUS_LABEL, entryFacts, entryStatusText, showsCode } from './entry-text'

const base = {
  entryId: 'e1',
  attemptNumber: null,
  passed: null,
  score: null,
  code: null,
  codeExpiresAt: null,
  codeEmailedAt: null,
  voidReason: null,
  sessionId: null,
  sessionStartedAt: null,
}
const entry = (over: Record<string, unknown>) => ({ ...base, ...over }) as never

describe('ENTRY_STATUS_LABEL', () => {
  it('labels every exam status', () => {
    expect(ENTRY_STATUS_LABEL).toMatchObject({
      no_code: 'No code',
      waiting: 'Waiting for start',
      ready: 'Ready',
      expired: 'Expired',
      voided: 'Voided',
      voided_attempt: 'Attempt voided',
      running: 'Running',
      finished: 'Finished',
      absent: 'Absent',
      discarded: 'Attempt discarded',
    })
  })
})

describe('entryStatusText', () => {
  it('shows Passed (success) for a graded passed attempt', () => {
    expect(entryStatusText(entry({ status: 'finished', passed: true }))).toEqual({
      label: 'Passed',
      tone: 'success',
    })
  })

  it('shows Failed (danger) for a graded failed attempt', () => {
    expect(entryStatusText(entry({ status: 'finished', passed: false }))).toEqual({
      label: 'Failed',
      tone: 'danger',
    })
  })

  it('shows Finished (neutral) when not graded', () => {
    expect(entryStatusText(entry({ status: 'finished' }))).toEqual({
      label: 'Finished',
      tone: 'neutral',
    })
  })

  it('shows Attempt discarded with a neutral tone', () => {
    expect(entryStatusText(entry({ status: 'discarded' }))).toEqual({
      label: 'Attempt discarded',
      tone: 'neutral',
    })
  })
})

describe('showsCode', () => {
  it.each(['waiting', 'ready', 'running', 'finished'])('shows the code for %s', (status) => {
    expect(showsCode(entry({ status, code: 'ABCD1234' }))).toBe(true)
  })

  it.each(['no_code', 'expired', 'voided', 'voided_attempt', 'absent', 'discarded'])(
    'hides the code for %s',
    (status) => {
      expect(showsCode(entry({ status, code: 'ABCD1234' }))).toBe(false)
    },
  )

  it('hides the code when none is present', () => {
    expect(showsCode(entry({ status: 'ready', code: null }))).toBe(false)
  })
})

describe('entryFacts', () => {
  it('joins the attempt number and score with " · "', () => {
    expect(
      entryFacts(entry({ status: 'finished', attemptNumber: 2, score: 80, passed: true }), {
        sharedExpiry: false,
      }),
    ).toBe('Attempt 2 · 80%')
  })

  it('states the start of a running attempt', () => {
    expect(
      entryFacts(
        entry({
          status: 'running',
          attemptNumber: 1,
          sessionStartedAt: '2026-11-18T09:30:00Z',
        }),
        { sharedExpiry: false },
      ),
    ).toMatch(/^Attempt 1 · Started /)
  })

  it('states the validity of a live code, omitted when the header states a shared expiry', () => {
    const e = entry({ status: 'ready', code: 'A', codeExpiresAt: '2026-11-18T23:59:00Z' })
    expect(entryFacts(e, { sharedExpiry: false })).toMatch(/Valid until /)
    expect(entryFacts(e, { sharedExpiry: true })).not.toMatch(/Valid until/)
  })

  it('states the void reason of a voided code', () => {
    expect(
      entryFacts(entry({ status: 'voided', voidReason: 'sitting closed' }), {
        sharedExpiry: false,
      }),
    ).toContain('Voided: sitting closed')
  })

  it('shows a free-text reason that collides with an Object prototype key verbatim', () => {
    expect(
      entryFacts(entry({ status: 'voided', voidReason: 'toString' }), { sharedExpiry: false }),
    ).toContain('Voided: toString')
  })

  it('says Did not start for an absent exam', () => {
    expect(entryFacts(entry({ status: 'absent' }), { sharedExpiry: false })).toContain(
      'Did not start',
    )
  })

  it('carries no email text until 2c', () => {
    const e = entry({ status: 'ready', code: 'A', codeExpiresAt: '2026-11-18T23:59:00Z' })
    expect(entryFacts(e, { sharedExpiry: false })).not.toMatch(/mailed/i)
    const emailed = entry({
      status: 'ready',
      code: 'A',
      codeExpiresAt: '2026-11-18T23:59:00Z',
      codeEmailedAt: '2026-11-18T08:00:00Z',
    })
    expect(entryFacts(emailed, { sharedExpiry: false })).not.toMatch(/mailed/i)
  })
})

describe('entryFacts voided_attempt', () => {
  it('has no caption: list_exam_sitting_roster returns a null attempt number for this status', () => {
    expect(
      entryFacts(entry({ status: 'voided_attempt', attemptNumber: null }), { sharedExpiry: false }),
    ).toBe('')
  })
})
