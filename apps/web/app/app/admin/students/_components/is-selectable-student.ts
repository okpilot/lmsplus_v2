import type { StudentRow } from '../types'

/** Bulk group actions only apply to active students. */
export function isSelectableStudent(s: StudentRow): boolean {
  return s.role === 'student' && s.deleted_at === null
}
