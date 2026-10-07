'use client'

import { BusyLabel } from '@/components/ui/busy-label'

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
}: Readonly<StartButtonProps>) {
  return (
    <button
      type="button"
      // Block clicks while loading too — aria-busy does not, so this stops a second
      // start request even if a caller forgets to fold `loading` into `disabled`.
      disabled={disabled || loading}
      onClick={onClick}
      aria-busy={loading || undefined}
      className="w-full rounded-[10px] bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      <span className="inline-flex items-center justify-center gap-2">
        <BusyLabel busy={loading}>{loading ? loadingLabel : label}</BusyLabel>
      </span>
    </button>
  )
}
