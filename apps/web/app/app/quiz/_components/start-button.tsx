'use client'

import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'

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
    <Button
      type="button"
      data-testid="start-button"
      // Block clicks while loading too — aria-busy does not, so this stops a second
      // start request even if a caller forgets to fold `loading` into `disabled`.
      disabled={disabled || loading}
      onClick={onClick}
      aria-busy={loading || undefined}
      className="w-full sm:w-auto"
    >
      <span className="inline-flex items-center justify-center gap-2">
        <BusyLabel busy={loading}>{loading ? loadingLabel : label}</BusyLabel>
      </span>
    </Button>
  )
}
