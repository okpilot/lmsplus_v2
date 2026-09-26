'use client'

import type { ReactElement } from 'react'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LoadingButton } from '@/components/ui/loading-button'
import { createStudent } from '../actions/create-student'
import { updateStudent } from '../actions/update-student'
import type { StudentRow } from '../types'
import { CreatedStudentPanel } from './created-student-panel'
import { StudentFormFields } from './student-form-fields'

type Props = {
  student?: StudentRow
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type CreatedStudent = { id: string; email: string; fullName: string }

export function StudentFormDialog({
  student,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: Readonly<Props>) {
  const isEdit = !!student
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [isPending, startTransition] = useTransition()

  const [email, setEmail] = useState(student?.email ?? '')
  const [fullName, setFullName] = useState(student?.full_name ?? '')
  const [role, setRole] = useState<string>(student?.role ?? 'student')
  const [createdStudent, setCreatedStudent] = useState<CreatedStudent | null>(null)

  useEffect(() => {
    if (open) {
      setEmail(student?.email ?? '')
      setFullName(student?.full_name ?? '')
      setRole(student?.role ?? 'student')
      setCreatedStudent(null)
    }
  }, [open, student])

  function handleSubmit() {
    startTransition(async () => {
      try {
        if (isEdit) {
          const result = await updateStudent({ id: student.id, full_name: fullName, role })
          if (result.success) {
            toast.success('Student updated')
            setOpen(false)
          } else {
            toast.error(result.error)
          }
          return
        }
        const result = await createStudent({ email, full_name: fullName, role })
        if (result.success) {
          setCreatedStudent({ id: result.id, email, fullName })
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Service error. Please try again.')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // Block only closing: the post-create panel closes through its own Close, disabled mid-send.
        if (!v && (isPending || createdStudent)) return
        setOpen(v)
      }}
    >
      {controlledOpen === undefined && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-md" showCloseButton={!createdStudent}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Student' : 'New Student'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the student details below.'
              : 'Fill in the details to create a new student account.'}
          </DialogDescription>
        </DialogHeader>

        {createdStudent ? (
          <CreatedStudentPanel
            studentId={createdStudent.id}
            email={createdStudent.email}
            fullName={createdStudent.fullName}
            onClose={() => setOpen(false)}
          />
        ) : (
          <>
            <StudentFormFields
              isEdit={isEdit}
              isPending={isPending}
              email={email}
              fullName={fullName}
              role={role}
              onEmailChange={setEmail}
              onFullNameChange={setFullName}
              onRoleChange={setRole}
            />

            <DialogFooter showCloseButton>
              <LoadingButton onClick={handleSubmit} loading={isPending} loadingText="Saving...">
                {isEdit ? 'Save Changes' : 'Create Student'}
              </LoadingButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
