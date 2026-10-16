/** Report route per exam mode; every other mode uses `/app/quiz/report`. */
export const EXAM_REPORT_PATHS = new Map<string, string>([
  ['internal_exam', '/app/internal-exam/report'],
  ['vfr_rt_exam', '/app/vfr-rt/report'],
])

/** Report URL of a finished session, whatever its mode. */
export function reportUrl(mode: string | undefined, sessionId: string): string {
  return `${(mode && EXAM_REPORT_PATHS.get(mode)) ?? '/app/quiz/report'}?session=${sessionId}`
}
