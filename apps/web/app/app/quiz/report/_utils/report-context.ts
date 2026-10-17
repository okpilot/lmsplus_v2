import { isVfrRtPracticeReport } from '@/lib/constants/report-paths'

export type ReportContext = { noun: string; backHref: string; backLabel: string }

export function getReportContext(mode: string, subjectCode: string | null): ReportContext {
  if (mode === 'vfr_rt_exam') {
    return { noun: 'VFR RT Mock Exam', backHref: '/app/vfr-rt', backLabel: 'Back to VFR RT' }
  }
  if (isVfrRtPracticeReport(mode, subjectCode)) {
    return {
      noun: 'VFR RT Practice',
      backHref: '/app/vfr-rt',
      backLabel: 'Start Another Practice',
    }
  }
  return { noun: 'Quiz', backHref: '/app/quiz', backLabel: 'Start Another Quiz' }
}
