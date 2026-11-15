import { Empty, EmptyDescription } from '@/components/ui/empty'
import type { StudentDialogsState } from '../_hooks/use-student-dialogs'
import type { CourseOption, GroupOption, StudentRow } from '../types'
import { StudentTable } from './student-table'

type Props = {
  students: StudentRow[]
  courses: CourseOption[]
  groups: GroupOption[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onToggleAll: () => void
  dialogs: StudentDialogsState
}

export function StudentListBody({
  students,
  courses,
  groups,
  selectedIds,
  onToggle,
  onToggleAll,
  dialogs,
}: Readonly<Props>) {
  if (students.length === 0) {
    return (
      <Empty>
        <EmptyDescription>
          No students found. Adjust filters or create a new student.
        </EmptyDescription>
      </Empty>
    )
  }
  return (
    <StudentTable
      students={students}
      courses={courses}
      groups={groups}
      selectedIds={selectedIds}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      onEdit={dialogs.setEditStudent}
      onToggleStatus={dialogs.setToggleStudent}
      onExport={dialogs.setExportStudent}
    />
  )
}
