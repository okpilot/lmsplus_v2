'use client'

import { Button } from '@/components/ui/button'

type Props = {
  onReload: () => void
}

export function NewVersionBanner({ onReload }: Readonly<Props>) {
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground shadow-lg"
    >
      <span>A new version is available.</span>
      <Button type="button" size="sm" onClick={onReload}>
        Reload
      </Button>
    </div>
  )
}
