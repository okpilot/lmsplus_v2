import type { StudentRow } from '../types'

/** Bulk group actions only apply to active students. */
export function isSelectableStudent(s: StudentRow): boolean {
  return s.role === 'student' && s.deleted_at === null
}

/** Header checkbox state: how many rows can be selected, and whether all of them are. */
export function selectionSummary(students: StudentRow[], selectedIds: string[]) {
  const selectableCount = students.filter(isSelectableStudent).length
  return {
    selectableCount,
    allSelected: selectableCount > 0 && selectedIds.length === selectableCount,
  }
}
