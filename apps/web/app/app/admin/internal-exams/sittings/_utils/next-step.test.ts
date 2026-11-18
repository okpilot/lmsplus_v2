import { describe, expect, it } from 'vitest'
import { examActions, nextStep } from './next-step'

const entry = (status: string, sessionId: string | null = null) =>
  ({ entryId: 'e1', status, sessionId }) as never

describe('nextStep', () => {
  it.each([
    ['no_code', 'Issue code'],
    ['expired', 'Re-issue'],
    ['voided', 'Issue new code'],
  ])('offers %s -> %s when editable', (status, label) => {
    expect(nextStep(entry(status), { editable: true, deactivated: false })?.label).toBe(label)
  })

  it.each(['running', 'finished', 'voided_attempt'])(
    'links %s with a session to View attempt',
    (status) => {
      const s = nextStep(entry(status, 'sess-1'), { editable: true, deactivated: false })
      expect(s?.label).toBe('View attempt')
      expect(s?.href).toBe('/app/admin/internal-exams/report?session=sess-1')
    },
  )

  it('hides Issue-type steps for a deactivated person', () => {
    for (const status of ['no_code', 'expired', 'voided'])
      expect(nextStep(entry(status), { editable: true, deactivated: true })).toBeNull()
  })

  it('keeps View attempt for a deactivated person', () => {
    expect(
      nextStep(entry('finished', 'sess-1'), { editable: true, deactivated: true })?.label,
    ).toBe('View attempt')
  })

  it('offers only View attempt when the sitting is not editable', () => {
    expect(nextStep(entry('no_code'), { editable: false, deactivated: false })).toBeNull()
    expect(
      nextStep(entry('finished', 'sess-1'), { editable: false, deactivated: false })?.label,
    ).toBe('View attempt')
  })

  it.each(['waiting', 'ready', 'absent', 'discarded'])('has no next step for %s', (status) => {
    expect(nextStep(entry(status), { editable: true, deactivated: false })).toBeNull()
  })

  it('has no View attempt without a session', () => {
    expect(nextStep(entry('running'), { editable: true, deactivated: false })).toBeNull()
  })
})

describe('examActions', () => {
  const withCode = (status: string) => ({ ...(entry(status) as object), codeId: 'k1' }) as never

  it.each([
    ['no_code', null, true],
    ['waiting', 'k1', true],
    ['ready', 'k1', true],
    ['expired', null, true],
    ['voided', null, true],
    ['running', null, false],
    ['finished', null, false],
    ['voided_attempt', null, false],
    ['absent', null, false],
    ['discarded', null, false],
  ])(
    'for a %s exam offers void %s and remove %s when editable',
    (status, voidCodeId, canRemove) => {
      expect(examActions(withCode(status), { editable: true })).toEqual({ voidCodeId, canRemove })
    },
  )

  it('offers nothing when the sitting is not editable', () => {
    for (const status of ['waiting', 'ready', 'no_code'])
      expect(examActions(withCode(status), { editable: false })).toEqual({
        voidCodeId: null,
        canRemove: false,
      })
  })
})
