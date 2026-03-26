'use client'

import type { ReactElement } from 'react'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createStudent } from '../actions/create-student'
import { updateStudent } from '../actions/update-student'
import type { StudentRow } from '../types'
import { StudentFormFields } from './student-form-fields'

type Props = {
  student?: StudentRow
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

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
  const [tempPassword, setTempPassword] = useState('')

  useEffect(() => {
    if (open) {
      setEmail(student?.email ?? '')
      setFullName(student?.full_name ?? '')
      setRole(student?.role ?? 'student')
      setTempPassword('')
    }
  }, [open, student])

  function handleSubmit() {
    startTransition(async () => {
      try {
        const result = isEdit
          ? await updateStudent({ id: student.id, full_name: fullName, role })
          : await createStudent({
              email,
              full_name: fullName,
              role,
              temporary_password: tempPassword,
            })

        if (result.success) {
          toast.success(isEdit ? 'Student updated' : 'Student created')
          setOpen(false)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Service error. Please try again.')
      }
    })
  }

  const submitLabel = isEdit ? 'Save Changes' : 'Create Student'

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isPending) setOpen(v)
      }}
    >
      {controlledOpen === undefined && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Student' : 'New Student'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the student details below.'
              : 'Fill in the details to create a new student account.'}
          </DialogDescription>
        </DialogHeader>

        <StudentFormFields
          isEdit={isEdit}
          isPending={isPending}
          email={email}
          fullName={fullName}
          role={role}
          tempPassword={tempPassword}
          onEmailChange={setEmail}
          onFullNameChange={setFullName}
          onRoleChange={setRole}
          onTempPasswordChange={setTempPassword}
        />

        <DialogFooter showCloseButton>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving...' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
