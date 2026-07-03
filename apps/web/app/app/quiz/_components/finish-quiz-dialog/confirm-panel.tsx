'use client'

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
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          aria-busy={busy || undefined}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${isWarn ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}`}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isWarn ? 'Go back' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
