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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createStudent } from '../actions/create-student'
import { updateStudent } from '../actions/update-student'
import type { StudentRow } from '../types'

type Props = {
  student?: StudentRow
  trigger: ReactElement
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
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Student' : 'New Student'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the student details below.'
              : 'Fill in the details to create a new student account.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isEdit || isPending}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => {
                if (v) setRole(v)
              }}
              disabled={isPending}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isEdit && <SelectItem value="admin">Admin</SelectItem>}
                <SelectItem value="instructor">Instructor</SelectItem>
                <SelectItem value="student">Student</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (
            <div className="grid gap-2">
              <Label htmlFor="tempPassword">Temporary password</Label>
              <Input
                id="tempPassword"
                type="text"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                disabled={isPending}
                minLength={6}
                required
              />
            </div>
          )}
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving...' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
