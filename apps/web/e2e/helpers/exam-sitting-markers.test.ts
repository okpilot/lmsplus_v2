import { describe, expect, it } from 'vitest'
import { EXAM_SITTING_E2E_PREFIX, makeSittingE2eMaterials } from './exam-sitting-markers'

describe('makeSittingE2eMaterials', () => {
  it('returns a unique E2E-SIT- prefixed value within 1000 chars', () => {
    const a = makeSittingE2eMaterials()
    expect(EXAM_SITTING_E2E_PREFIX).toBe('E2E-SIT-')
    expect(a.startsWith('E2E-SIT-')).toBe(true)
    expect(a.length).toBeLessThanOrEqual(1000)
    expect(a).not.toBe(makeSittingE2eMaterials())
  })
})
