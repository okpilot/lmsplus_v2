import { describe, expect, it } from 'vitest'
import { getDismissTarget } from './dismiss-target'

describe('getDismissTarget', () => {
  it('sends a dismissed VFR RT exam to the VFR RT page', () => {
    expect(getDismissTarget('vfr_rt_exam')).toBe('/app/vfr-rt')
  })

  it('sends a dismissed internal exam to the internal exam page', () => {
    expect(getDismissTarget('internal_exam')).toBe('/app/internal-exam')
  })

  it.each(['mock_exam', 'quick_quiz', undefined] as const)(
    'offers no dismiss target for discardable mode %s',
    (mode) => {
      expect(getDismissTarget(mode)).toBeNull()
    },
  )
})
