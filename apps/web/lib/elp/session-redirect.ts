import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'

/** Determines where the §1 Interview session page should redirect, if anywhere.
 * A missing session sends the student back to ELP home; a session that has moved
 * past in_progress (graded, still grading, or a section failed) has nothing left
 * for the recorder to do, so it goes to the report/pending view instead of
 * re-rendering a fresh, unusable runner. Returns null when no redirect is needed. */
export function getSessionRedirectPath(
  session: OralSessionDetail | null,
  id: string,
): string | null {
  if (!session) return '/app/elp'
  if (session.status !== 'in_progress') return `/app/elp/report/${id}`
  return null
}
