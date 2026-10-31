'use client'

import { Button } from '@/components/ui/button'
import { usePublishHeight } from '../_hooks/use-publish-height'

type Props = {
  onReload: () => void
}

export function NewVersionBanner({ onReload }: Readonly<Props>) {
  const ref = usePublishHeight('--reload-banner-h')
  return (
    <div
      ref={ref}
      role="status"
      data-slot="reload-banner"
      className="fixed right-4 bottom-4 z-banner flex max-w-viewport-inset items-center justify-between gap-3 rounded-card bg-popover px-4 py-3 text-body text-popover-foreground ring-1 ring-border shadow-raised"
    >
      <span>A new version is available.</span>
      <Button type="button" size="sm" onClick={onReload}>
        Reload
      </Button>
    </div>
  )
}
