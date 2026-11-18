'use client'

import { Button } from '@/components/ui/button'
import { useSittingUi } from '../_hooks/sitting-ui-context'

/** Closes the popup; disabled while a mutation holds it locked. */
export function CloseButton({ label = 'Close' }: Readonly<{ label?: string }>) {
  const { close, locked } = useSittingUi()
  return (
    <Button variant="outline" disabled={locked} onClick={close}>
      {label}
    </Button>
  )
}
