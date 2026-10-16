import { describe, expect, it } from 'vitest'
import { reportUrl } from './report-paths'

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
