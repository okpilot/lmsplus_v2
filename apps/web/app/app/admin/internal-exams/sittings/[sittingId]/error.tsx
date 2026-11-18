'use client'

import { Button } from '@/components/ui/button'

export default function SittingError({ reset }: Readonly<{ error: Error; reset: () => void }>) {
  return (
    <div className="space-y-stack">
      <p role="alert">Failed to load this sitting.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
