'use client'

import { Button } from '@/components/ui/button'

type Props = {
  onReload: () => void
}

export function NewVersionBanner({ onReload }: Readonly<Props>) {
  return (
    <div
      role="status"
      data-slot="reload-banner"
      className="fixed right-4 bottom-4 z-banner flex max-w-[calc(100vw-2rem)] items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground shadow-lg md:w-80"
    >
      <span className="whitespace-nowrap">A new version is available.</span>
      <Button type="button" size="sm" onClick={onReload}>
        Reload
      </Button>
    </div>
  )
}
