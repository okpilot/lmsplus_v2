import type { StudentDialogsState } from '../_hooks/use-student-dialogs'
import type { CourseOption } from '../types'
import { ExportStudentDialog } from './export-student-dialog'
import { StudentFormDialog } from './student-form-dialog'
import { ToggleStatusDialog } from './toggle-status-dialog'

type Props = {
  courses: CourseOption[]
  dialogs: StudentDialogsState
}

export function StudentDialogs({ courses, dialogs }: Readonly<Props>) {
  const { editStudent, setEditStudent, toggleStudent, setToggleStudent } = dialogs
  const { exportStudent, setExportStudent } = dialogs
  return (
    <>
      <StudentFormDialog
        student={editStudent ?? undefined}
        courses={courses}
        open={editStudent !== null}
        onOpenChange={(v) => {
          if (!v) setEditStudent(null)
        }}
      />

      <ToggleStatusDialog
        student={toggleStudent}
        open={toggleStudent !== null}
        onOpenChange={(v) => {
          if (!v) setToggleStudent(null)
        }}
      />

      <ExportStudentDialog
        student={exportStudent}
        open={exportStudent !== null}
        onOpenChange={(v) => {
          if (!v) setExportStudent(null)
        }}
      />
    </>
  )
}
