import { useState } from 'react'
import type { StudentRow } from '../types'

/** Open-state of the edit, toggle-status and export dialogs: the student a dialog targets, or null when closed. */
export function useStudentDialogs() {
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null)
  const [toggleStudent, setToggleStudent] = useState<StudentRow | null>(null)
  const [exportStudent, setExportStudent] = useState<StudentRow | null>(null)
  return {
    editStudent,
    setEditStudent,
    toggleStudent,
    setToggleStudent,
    exportStudent,
    setExportStudent,
  }
}

export type StudentDialogsState = ReturnType<typeof useStudentDialogs>
