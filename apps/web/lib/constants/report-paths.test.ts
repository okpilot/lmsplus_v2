import { describe, expect, it } from 'vitest'
import { isVfrRtPracticeReport, isVfrRtReport, reportUrl } from './report-paths'

describe('reportUrl', () => {
  it.each([
    ['quick_quiz', '/app/quiz/report?session=s1'],
    ['smart_review', '/app/quiz/report?session=s1'],
    ['mock_exam', '/app/quiz/report?session=s1'],
    ['internal_exam', '/app/internal-exam/report?session=s1'],
    ['vfr_rt_exam', '/app/vfr-rt/report?session=s1'],
    ['custom_mode', '/app/quiz/report?session=s1'],
    ['constructor', '/app/quiz/report?session=s1'],
  ])('builds the report URL of a finished %s session', (mode, url) => {
    expect(reportUrl(mode, 's1')).toBe(url)
  })

  it('falls back to the quiz report when no mode is given', () => {
    expect(reportUrl(undefined, 's1')).toBe('/app/quiz/report?session=s1')
  })
})

describe('reportUrl by subject', () => {
  it.each([
    ['quick_quiz', 'RT', '/app/vfr-rt/report?session=s1'],
    ['quick_quiz', '010', '/app/quiz/report?session=s1'],
    ['quick_quiz', null, '/app/quiz/report?session=s1'],
    ['smart_review', 'RT', '/app/quiz/report?session=s1'],
    ['vfr_rt_exam', undefined, '/app/vfr-rt/report?session=s1'],
    ['vfr_rt_exam', '010', '/app/vfr-rt/report?session=s1'],
    ['internal_exam', 'RT', '/app/internal-exam/report?session=s1'],
  ])('builds the report URL of a %s session on subject %s', (mode, subjectCode, url) => {
    expect(reportUrl(mode, 's1', subjectCode)).toBe(url)
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

describe('isVfrRtReport', () => {
  it('is true for RT practice and for a vfr_rt_exam session', () => {
    expect(isVfrRtReport('quick_quiz', 'RT')).toBe(true)
    expect(isVfrRtReport('vfr_rt_exam', 'RT')).toBe(true)
  })

  it('is false for other modes and non-RT quick quizzes', () => {
    expect(isVfrRtReport('mock_exam', 'RT')).toBe(false)
    expect(isVfrRtReport('quick_quiz', 'MET')).toBe(false)
  })
})
