'use client'

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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetStudentPassword } from '../actions/reset-student-password'
import type { StudentRow } from '../types'

type Props = {
  student: StudentRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function generatePassword(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

export function ResetPasswordDialog({ student, open, onOpenChange }: Readonly<Props>) {
  const [password, setPassword] = useState(() => generatePassword())
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) setPassword(generatePassword())
  }, [open])

  function handleSubmit() {
    if (!student) return
    startTransition(async () => {
      const result = await resetStudentPassword({ id: student.id, temporary_password: password })
      if (result.success) {
        toast.success(`Password reset. Temporary password: ${password}`)
        onOpenChange(false)
      } else {
        toast.error(result.error ?? 'Failed to reset password')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a temporary password for {student?.full_name ?? student?.email}. Share it securely —
            they should change it on next login.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="temp-password">Temporary password</Label>
          <div className="flex gap-2">
            <Input
              id="temp-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
              Generate
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !password}>
            {isPending ? 'Resetting…' : 'Reset password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
