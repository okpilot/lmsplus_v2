import { describe, expect, it } from 'vitest'
import { getReportContext, isVfrRtPracticeReport } from './report-context'

describe('getReportContext', () => {
  it('reads as a practice session for an RT subject in quick_quiz mode', () => {
    const ctx = getReportContext('quick_quiz', 'RT')
    expect(ctx.noun).toBe('VFR RT Practice')
    expect(ctx.backHref).toBe('/app/vfr-rt')
    expect(ctx.backLabel).toBe('Start Another Practice')
  })

  it('reads as a quiz for an RT subject in discovery mode', () => {
    const ctx = getReportContext('discovery', 'RT')
    expect(ctx.noun).toBe('Quiz')
    expect(ctx.backHref).toBe('/app/quiz')
    expect(ctx.backLabel).toBe('Start Another Quiz')
  })

  it('reads as a quiz for a non-RT subject', () => {
    const ctx = getReportContext('quick_quiz', 'MET')
    expect(ctx.noun).toBe('Quiz')
    expect(ctx.backHref).toBe('/app/quiz')
    expect(ctx.backLabel).toBe('Start Another Quiz')
  })

  it('reads as a quiz when the subject code is null', () => {
    const ctx = getReportContext('quick_quiz', null)
    expect(ctx.noun).toBe('Quiz')
    expect(ctx.backHref).toBe('/app/quiz')
    expect(ctx.backLabel).toBe('Start Another Quiz')
  })

  it('falls through to a quiz for an RT subject in an exam mode', () => {
    const ctx = getReportContext('vfr_rt_exam', 'RT')
    expect(ctx.noun).toBe('Quiz')
    expect(ctx.backHref).toBe('/app/quiz')
    expect(ctx.backLabel).toBe('Start Another Quiz')
  })
})

describe('isVfrRtPracticeReport', () => {
  it('is true for an RT subject in quick_quiz mode', () => {
    expect(isVfrRtPracticeReport('quick_quiz', 'RT')).toBe(true)
  })

  it('is false for an RT subject in an exam mode', () => {
    expect(isVfrRtPracticeReport('vfr_rt_exam', 'RT')).toBe(false)
  })

  it('is false for an RT subject in a non-quick_quiz practice mode', () => {
    expect(isVfrRtPracticeReport('discovery', 'RT')).toBe(false)
  })

  it('is false for a non-RT subject', () => {
    expect(isVfrRtPracticeReport('quick_quiz', 'MET')).toBe(false)
  })

  it('is false when the subject code is null', () => {
    expect(isVfrRtPracticeReport('quick_quiz', null)).toBe(false)
  })
})
