import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'

export type OralReportView = 'graded' | 'incomplete' | 'failed' | 'grading'

/**
 * Derives which state the oral-exam report page should render for a session.
 *
 * - 'graded'     — session.status is 'graded'; the report is ready to fetch.
 * - 'incomplete' — fewer sections have been submitted than the session's plan
 *                  requires (e.g. 2 of 5 mock sections) — the runner, not the
 *                  report page, is the correct place for the student to be.
 *                  Checking `responses.length === 0` alone would miss this: a
 *                  partially-submitted mock exam would otherwise fall through
 *                  to a permanent "grading" state that never resolves.
 * - 'failed'     — every planned section has been submitted, and at least one
 *                  response failed scoring.
 * - 'grading'    — every planned section has been submitted, none have
 *                  failed, and scoring is still in progress.
 */
export function deriveOralReportView(session: OralSessionDetail): OralReportView {
  if (session.status === 'graded') return 'graded'
  if (session.responses.length < session.sections.length) return 'incomplete'
  if (session.responses.some((r) => r.status === 'failed')) return 'failed'
  return 'grading'
}
