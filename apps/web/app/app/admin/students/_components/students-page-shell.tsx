'use client'

import { PaginationBar } from '../../../_components/pagination-bar'
import { useScopedSelection } from '../../../_hooks/use-scoped-selection'
import { useStudentDialogs } from '../_hooks/use-student-dialogs'
import type { CourseOption, GroupOption, StudentFilters, StudentRow } from '../types'
import { isSelectableStudent } from './is-selectable-student'
import { StudentDialogs } from './student-dialogs'
import { StudentFiltersBar } from './student-filters'
import { StudentListBody } from './student-list-body'
import { StudentsBulkBar } from './students-bulk-bar'
import { StudentsToolbar } from './students-toolbar'

type Props = {
  students: StudentRow[]
  courses: CourseOption[]
  groups: GroupOption[]
  filters: StudentFilters
  page: number
  totalCount: number
  pageSize: number
}

export function StudentsPageShell({
  students,
  courses,
  groups,
  filters,
  page,
  totalCount,
  pageSize,
}: Readonly<Props>) {
  const dialogs = useStudentDialogs()
  const { selectedIds, toggle, toggleAll, clear, deselect } = useScopedSelection(
    JSON.stringify({ ...filters, page }),
    students.filter(isSelectableStudent).map((s) => s.id),
  )

  return (
    <div className="space-y-section">
      <StudentFiltersBar filters={filters} groups={groups} />
      <StudentsToolbar totalCount={totalCount} courses={courses} />
      <StudentListBody
        students={students}
        courses={courses}
        groups={groups}
        selectedIds={selectedIds}
        onToggle={toggle}
        onToggleAll={toggleAll}
        dialogs={dialogs}
      />
      <StudentsBulkBar
        selectedIds={selectedIds}
        groups={groups}
        onClear={clear}
        onDone={deselect}
      />
      <PaginationBar page={page} totalCount={totalCount} pageSize={pageSize} entityLabel="users" />
      <StudentDialogs courses={courses} dialogs={dialogs} />
    </div>
  )
}
