'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type DeleteSavedQuizButtonProps = {
  testId?: string
  label?: string
  disabled?: boolean
  pending: boolean
  onConfirm: () => Promise<void>
}

/** Delete trigger that asks in a ConfirmDialog, then closes once `onConfirm` settles. */
export function DeleteSavedQuizButton({
  testId,
  label = 'Delete',
  disabled,
  pending,
  onConfirm,
}: Readonly<DeleteSavedQuizButtonProps>) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const lockRef = useRef(false)

  async function confirm() {
    if (lockRef.current) return
    lockRef.current = true
    setBusy(true)
    try {
      await onConfirm()
    } catch {
      // the caller surfaces its own error
    } finally {
      lockRef.current = false
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-testid={testId}
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this saved quiz?"
        description="This cannot be undone."
        confirmLabel="Delete"
        pending={pending || busy}
        onConfirm={confirm}
      />
    </>
  )
}
