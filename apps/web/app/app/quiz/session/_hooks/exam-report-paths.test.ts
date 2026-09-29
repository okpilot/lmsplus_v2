import { describe, expect, it } from 'vitest'
import { EXAM_REPORT_PATHS } from './exam-report-paths'
import { examReportUrl } from './quiz-submit'

describe('EXAM_REPORT_PATHS', () => {
  it('sends a finished internal exam to the internal-exam report', () => {
    expect(EXAM_REPORT_PATHS.internal_exam).toBe('/app/internal-exam/report')
  })

  it('sends a finished VFR RT mock exam to the VFR RT report', () => {
    expect(EXAM_REPORT_PATHS.vfr_rt_exam).toBe('/app/vfr-rt/report')
  })
})

describe('examReportUrl', () => {
  it('builds the VFR RT report URL for a vfr_rt_exam session', () => {
    expect(examReportUrl('vfr_rt_exam', 's1')).toBe('/app/vfr-rt/report?session=s1')
  })

  it('falls back to the quiz report for a mode without its own route', () => {
    expect(examReportUrl(undefined, 's1')).toBe('/app/quiz/report?session=s1')
  })
})
