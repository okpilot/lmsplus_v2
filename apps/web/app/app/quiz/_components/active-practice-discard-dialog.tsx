'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

type Props = {
  modeLabel: string
  loading: boolean
  error: string | null
  onDiscard: () => void
  onClearError: () => void
}

/** Confirm-before-discard dialog; stays open while a discard is in flight. */
export function ActivePracticeDiscardDialog({
  modeLabel,
  loading,
  error,
  onDiscard,
  onClearError,
}: Readonly<Props>) {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Keep the dialog open while a discard is in flight so the confirm
        // can't be dismissed mid-request; clear any stale error on close.
        if (loading) return
        setOpen(next)
        if (!next) onClearError()
      }}
    >
      <AlertDialogTrigger render={<Button type="button" variant="outline" disabled={loading} />}>
        Discard
      </AlertDialogTrigger>
      <DiscardDialogContent
        modeLabel={modeLabel}
        loading={loading}
        error={error}
        onDiscard={onDiscard}
      />
    </AlertDialog>
  )
}

type ContentProps = Pick<Props, 'modeLabel' | 'loading' | 'error' | 'onDiscard'>

function DiscardDialogContent({ modeLabel, loading, error, onDiscard }: Readonly<ContentProps>) {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Discard {modeLabel} session?</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently discard your {modeLabel} progress. You cannot undo this action.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {/* Render the error inside the dialog: the AlertDialogAction does not
          close the popup, so a banner-level alert would sit behind the overlay. */}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={loading} onClick={onDiscard}>
          Discard
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}
