'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { emailCodesBanner } from '../_utils/copy'
import { emailSittingCodes } from '../actions/email-sitting-codes'
import { useSittingAction } from './use-sitting-action'

/** Emails every unused code not yet emailed to its student, after a confirm. */
export function EmailCodesButton({ sittingId }: Readonly<{ sittingId: string }>) {
  const [open, setOpen] = useState(false)
  const { pending, error, run, clearError } = useSittingAction()
  const send = () =>
    run(
      () => emailSittingCodes({ sittingId }),
      (d) => {
        setOpen(false)
        return emailCodesBanner(d)
      },
    )
  return (
    <>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
        Email codes
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          clearError()
        }}
        title="Email codes?"
        description="Email every unused code not yet emailed to its student."
        confirmLabel="Email codes"
        tone="default"
        pending={pending}
        error={error}
        onConfirm={send}
      />
    </>
  )
}
