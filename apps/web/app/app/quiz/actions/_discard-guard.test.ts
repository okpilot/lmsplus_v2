import { describe, expect, it } from 'vitest'
import { discardBlockedError } from './_discard-guard'

// ---- discardBlockedError ---------------------------------------------------

describe('discardBlockedError', () => {
  it('returns null for discardable modes (quick_quiz, mock_exam)', () => {
    expect(discardBlockedError('quick_quiz')).toBeNull()
    expect(discardBlockedError('mock_exam')).toBeNull()
  })

  it('returns the internal_exam error token for internal_exam sessions', () => {
    expect(discardBlockedError('internal_exam')).toBe('cannot_discard_internal_exam')
  })

  it('returns the vfr_rt_exam error token for vfr_rt_exam sessions', () => {
    expect(discardBlockedError('vfr_rt_exam')).toBe('cannot_discard_vfr_rt_exam')
  })

  it('returns null for an unknown mode (fail-open for new modes not yet guarded)', () => {
    expect(discardBlockedError('smart_review')).toBeNull()
  })

  it('returns null for an empty mode string', () => {
    expect(discardBlockedError('')).toBeNull()
  })
})
