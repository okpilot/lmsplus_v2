'use client'

import type * as React from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog'
import { FieldError } from './field-error'
import { LoadingButton } from './loading-button'

type ConfirmDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel?: React.ReactNode
  pending: boolean
  onConfirm: () => void
  tone?: 'destructive' | 'default'
  error?: string | null
}>

/** Controlled confirm dialog; stays open while `pending`. */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  pending,
  onConfirm,
  tone = 'destructive',
  error,
}: Readonly<ConfirmDialogProps>) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <FieldError role="alert">{error}</FieldError>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <LoadingButton
            type="button"
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            loading={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </LoadingButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { ConfirmDialog }
