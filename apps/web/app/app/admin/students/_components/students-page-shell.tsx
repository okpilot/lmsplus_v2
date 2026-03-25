'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { StudentFilters, StudentRow } from '../types'
import { ResetPasswordDialog } from './reset-password-dialog'
import { StudentFiltersBar } from './student-filters'
import { StudentFormDialog } from './student-form-dialog'
import { StudentTable } from './student-table'
import { ToggleStatusDialog } from './toggle-status-dialog'

type Props = {
  students: StudentRow[]
  filters: StudentFilters
}

export function StudentsPageShell({ students, filters }: Readonly<Props>) {
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null)
  const [resetStudent, setResetStudent] = useState<StudentRow | null>(null)
  const [toggleStudent, setToggleStudent] = useState<StudentRow | null>(null)

  return (
    <div className="space-y-4">
      <StudentFiltersBar filters={filters} />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {students.length} user{students.length === 1 ? '' : 's'}
        </p>
        <StudentFormDialog
          trigger={
            <Button size="sm">
              <Plus className="mr-1.5 size-4" />
              New Student
            </Button>
          }
        />
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No students found. Adjust filters or create a new student.
          </p>
        </div>
      ) : (
        <StudentTable
          students={students}
          onEdit={setEditStudent}
          onToggleStatus={setToggleStudent}
          onResetPassword={setResetStudent}
        />
      )}

      <StudentFormDialog
        student={editStudent ?? undefined}
        trigger={<span aria-hidden />}
        open={editStudent !== null}
        onOpenChange={(v) => {
          if (!v) setEditStudent(null)
        }}
      />

      <ResetPasswordDialog
        student={resetStudent}
        open={resetStudent !== null}
        onOpenChange={(v) => {
          if (!v) setResetStudent(null)
        }}
      />

      <ToggleStatusDialog
        student={toggleStudent}
        open={toggleStudent !== null}
        onOpenChange={(v) => {
          if (!v) setToggleStudent(null)
        }}
      />
    </div>
  )
}
