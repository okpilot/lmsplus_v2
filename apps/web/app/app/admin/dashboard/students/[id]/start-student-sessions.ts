import type { StudentSessionFilters } from '../../types'
import { getStudentSessions, type StudentSessionsResult } from './queries'

/** Starts the sessions read before the page awaits the student; the child awaits it. */
export function startStudentSessions(
  studentId: string,
  filters: StudentSessionFilters,
): Promise<StudentSessionsResult> {
  const promise = getStudentSessions(studentId, filters)
  // The page can throw (notFound(), detail error) before the child awaits; this keeps that rejection handled.
  promise.catch(() => {})
  return promise
}
