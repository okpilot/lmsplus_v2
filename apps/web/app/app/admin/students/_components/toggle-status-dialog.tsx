'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toggleStudentStatus } from '../actions/toggle-student-status'
import type { StudentRow } from '../types'

type Props = {
  student: StudentRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ToggleStatusDialog({ student, open, onOpenChange }: Readonly<Props>) {
  const [isPending, startTransition] = useTransition()
  const isActive = student?.deleted_at === null
  const name = student?.full_name ?? student?.email ?? 'this user'
  const confirmLabel = isActive ? 'Deactivate' : 'Reactivate'

  function handleConfirm() {
    if (!student) return
    startTransition(async () => {
      const result = await toggleStudentStatus({ id: student.id })
      if (result.success) {
        toast.success(isActive ? 'Student deactivated' : 'Student reactivated')
        onOpenChange(false)
      } else {
        toast.error(result.error ?? 'Failed to update student status')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isActive ? 'Deactivate student' : 'Reactivate student'}</DialogTitle>
          <DialogDescription>
            {isActive
              ? `Are you sure you want to deactivate ${name}? They will be unable to log in.`
              : `Are you sure you want to reactivate ${name}?`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={isActive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? 'Saving…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
