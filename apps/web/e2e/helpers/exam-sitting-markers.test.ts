import { describe, expect, it } from 'vitest'
import {
  EXAM_SITTING_E2E_PREFIX,
  EXAM_SITTING_SEED_PREFIX,
  makeSittingE2eMaterials,
} from './exam-sitting-markers'

describe('makeSittingE2eMaterials', () => {
  it('returns a unique E2E-SIT- prefixed value within 1000 chars', () => {
    const a = makeSittingE2eMaterials()
    expect(EXAM_SITTING_E2E_PREFIX).toBe('E2E-SIT-')
    expect(a.startsWith('E2E-SIT-')).toBe(true)
    expect(a.length).toBeLessThanOrEqual(1000)
    expect(a).not.toBe(makeSittingE2eMaterials())
  })
})

describe('EXAM_SITTING_SEED_PREFIX', () => {
  it('extends the E2E-SIT- marker so the generic cleanup still finds seeded sittings', () => {
    expect(EXAM_SITTING_SEED_PREFIX).toBe('E2E-SIT-SEED-')
    expect(EXAM_SITTING_SEED_PREFIX.startsWith(EXAM_SITTING_E2E_PREFIX)).toBe(true)
  })
})
