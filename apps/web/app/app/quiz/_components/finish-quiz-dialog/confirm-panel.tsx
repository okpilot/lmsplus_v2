'use client'

import { Alert, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type ConfirmPanelProps = {
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** True while ANY action runs — disables both buttons. */
  submitting: boolean
  /** True only while THIS panel's own action runs — drives aria-busy. */
  busy: boolean
  variant: 'warning' | 'destructive'
}

export function ConfirmPanel({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  submitting,
  busy,
  variant,
}: Readonly<ConfirmPanelProps>) {
  const isWarn = variant === 'warning'
  return (
    <Alert tone={isWarn ? 'caution' : 'danger'} className="mt-4">
      <AlertTitle>{message}</AlertTitle>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant={isWarn ? 'caution' : 'destructive'}
          onClick={onConfirm}
          disabled={submitting}
          aria-busy={busy || undefined}
        >
          {confirmLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          {isWarn ? 'Go back' : 'Cancel'}
        </Button>
      </div>
    </Alert>
  )
}
