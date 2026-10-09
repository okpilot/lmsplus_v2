'use client'

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
    <div
      className={`mt-4 rounded-lg border p-4 ${isWarn ? 'border-orange-400/40 bg-orange-500/10' : 'border-destructive/40 bg-destructive/10'}`}
    >
      <p
        className={`text-sm font-medium ${isWarn ? 'text-orange-600 dark:text-orange-400' : 'text-destructive'}`}
      >
        {message}
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant={isWarn ? 'default' : 'destructive'}
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
    </div>
  )
}
