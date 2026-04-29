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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { voidInternalExamCode } from '../actions/void-code'

type Props = {
  codeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VoidCodeDialog({ codeId, open, onOpenChange }: Readonly<Props>) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
    }
  }, [open])

  const trimmed = reason.trim()
  const isValid = trimmed.length >= 1 && trimmed.length <= 500

  function handleSubmit() {
    if (!codeId || !isValid) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await voidInternalExamCode({ codeId, reason: trimmed })
        if (result.success) {
          toast.success(
            result.sessionEnded ? 'Code voided and active session ended' : 'Code voided',
          )
          onOpenChange(false)
        } else {
          setError(result.error)
        }
      } catch {
        setError('Failed to void internal exam code')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void internal exam code</DialogTitle>
          <DialogDescription>
            Provide a reason for voiding this code. If the student has an active session it will be
            terminated. Finished attempts cannot be voided.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="void-reason">Reason</Label>
          <Textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Student requested rescheduling"
            maxLength={500}
            rows={4}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{trimmed.length}/500</span>
            {error ? (
              <span role="alert" className="text-destructive">
                {error}
              </span>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isPending || !isValid || !codeId}
          >
            {isPending ? 'Voiding…' : 'Void code'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
