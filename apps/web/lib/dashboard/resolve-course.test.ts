import { describe, expect, it } from 'vitest'
import { resolveDashboardCourse } from './resolve-course'

const PPL = { id: 'c1', code: 'PPL_A', short: 'PPL', name: 'PPL(A)' }
const RT = { id: 'c2', code: 'VFR_RT', short: 'RT', name: 'VFR RT' }

describe('resolveDashboardCourse', () => {
  it('returns the cookie course when the student is enrolled in it', () => {
    expect(resolveDashboardCourse([PPL, RT], 'VFR_RT')).toEqual(RT)
  })

  it('falls back to the first course when the cookie names a course not enrolled', () => {
    expect(resolveDashboardCourse([PPL, RT], 'GONE')).toEqual(PPL)
  })

  it('falls back to the first course when there is no cookie', () => {
    expect(resolveDashboardCourse([PPL, RT], undefined)).toEqual(PPL)
  })

  it('returns null when the student has no courses', () => {
    expect(resolveDashboardCourse([], 'PPL_A')).toBeNull()
  })
})
