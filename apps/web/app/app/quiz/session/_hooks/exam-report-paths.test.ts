import { describe, expect, it } from 'vitest'
import { EXAM_REPORT_PATHS, reportUrl } from './exam-report-paths'

describe('EXAM_REPORT_PATHS', () => {
  it('sends a finished internal exam to the internal-exam report', () => {
    expect(EXAM_REPORT_PATHS.internal_exam).toBe('/app/internal-exam/report')
  })

  it('sends a finished VFR RT mock exam to the VFR RT report', () => {
    expect(EXAM_REPORT_PATHS.vfr_rt_exam).toBe('/app/vfr-rt/report')
  })
})

describe('reportUrl', () => {
  it.each([
    ['quick_quiz', '/app/quiz/report?session=s1'],
    ['smart_review', '/app/quiz/report?session=s1'],
    ['mock_exam', '/app/quiz/report?session=s1'],
    ['internal_exam', '/app/internal-exam/report?session=s1'],
    ['vfr_rt_exam', '/app/vfr-rt/report?session=s1'],
  ] as const)('builds the report URL of a finished %s session', (mode, url) => {
    expect(reportUrl(mode, 's1')).toBe(url)
  })

  it('falls back to the quiz report when no mode is given', () => {
    expect(reportUrl(undefined, 's1')).toBe('/app/quiz/report?session=s1')
  })
})
