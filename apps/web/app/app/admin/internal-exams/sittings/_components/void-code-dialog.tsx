'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { LoadingButton } from '@/components/ui/loading-button'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  emailed: boolean
  pending: boolean
  error: string | null
  onConfirm: (reason: string) => void
}

/** Void needs a reason (1..500 characters). */
export function VoidCodeDialog(p: Readonly<Props>) {
  const [reason, setReason] = useState('')
  const close = () => {
    setReason('')
    p.onOpenChange(false)
  }
  return (
    <Dialog
      open={p.open}
      onOpenChange={(next) => {
        if (p.pending) return
        if (next) p.onOpenChange(true)
        else close()
      }}
    >
      <DialogContent className="sm:max-w-dialog-md">
        <DialogHeader>
          <DialogTitle>{p.title}</DialogTitle>
          <DialogDescription>
            The student cannot use a voided code. This is audited.
          </DialogDescription>
        </DialogHeader>
        {p.emailed && <p className="text-body">The student was emailed this code.</p>}
        <label htmlFor="void-reason" className="block space-y-1 text-label text-muted-foreground">
          Reason
          <Textarea
            id="void-reason"
            value={reason}
            maxLength={500}
            disabled={p.pending}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <FieldError role="alert">{p.error}</FieldError>
        <DialogFooter>
          <Button variant="outline" disabled={p.pending} onClick={close}>
            Cancel
          </Button>
          <LoadingButton
            variant="destructive"
            loading={p.pending}
            disabled={reason.trim().length === 0}
            onClick={() => p.onConfirm(reason.trim())}
          >
            Void code
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
