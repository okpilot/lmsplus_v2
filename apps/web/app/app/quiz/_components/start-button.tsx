'use client'

import { Loader2 } from 'lucide-react'

type StartButtonProps = {
  disabled: boolean
  loading: boolean
  label: string
  loadingLabel?: string
  onClick: () => void
}

export function StartButton({
  disabled,
  loading,
  label,
  loadingLabel = 'Starting...',
  onClick,
}: StartButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-busy={loading || undefined}
      className="w-full rounded-[10px] bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      <span className="inline-flex items-center justify-center gap-2">
        {loading && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
        {loading ? loadingLabel : label}
      </span>
    </button>
  )
}
