'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { PaginationBar } from '../../../_components/pagination-bar'
import { useScopedSelection } from '../../../_hooks/use-scoped-selection'
import type { CourseOption, GroupOption, StudentFilters, StudentRow } from '../types'
import { ExportStudentDialog } from './export-student-dialog'
import { isSelectableStudent } from './is-selectable-student'
import { StudentFiltersBar } from './student-filters'
import { StudentFormDialog } from './student-form-dialog'
import { StudentTable } from './student-table'
import { StudentsBulkBar } from './students-bulk-bar'
import { ToggleStatusDialog } from './toggle-status-dialog'

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
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null)
  const [toggleStudent, setToggleStudent] = useState<StudentRow | null>(null)
  const [exportStudent, setExportStudent] = useState<StudentRow | null>(null)
  const { selectedIds, toggle, toggleAll, clear } = useScopedSelection(
    JSON.stringify({ ...filters, page }),
    students.filter(isSelectableStudent).map((s) => s.id),
  )

  return (
    <div className="space-y-section">
      <StudentFiltersBar filters={filters} groups={groups} />

      <div className="flex items-center justify-between">
        <p className="text-caption text-muted-foreground">
          {totalCount} user{totalCount === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/app/admin/students/groups"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Groups
          </Link>
          <StudentFormDialog
            courses={courses}
            trigger={
              <Button size="sm">
                <Plus className="mr-1.5 size-icon" />
                New Student
              </Button>
            }
          />
        </div>
      </div>

      {students.length === 0 ? (
        <Empty>
          <EmptyDescription>
            No students found. Adjust filters or create a new student.
          </EmptyDescription>
        </Empty>
      ) : (
        <StudentTable
          students={students}
          courses={courses}
          groups={groups}
          selectedIds={selectedIds}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onEdit={setEditStudent}
          onToggleStatus={setToggleStudent}
          onExport={setExportStudent}
        />
      )}

      <StudentsBulkBar selectedIds={selectedIds} groups={groups} onClear={clear} />

      <PaginationBar page={page} totalCount={totalCount} pageSize={pageSize} entityLabel="users" />

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
    </div>
  )
}
