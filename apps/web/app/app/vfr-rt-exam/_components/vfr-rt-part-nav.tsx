'use client'

import { Button } from '@/components/ui/button'

type VfrRtPartNavProps = {
  currentIndex: number
  total: number
  partLabel: string
  onPrev: () => void
  onNext: () => void
}

export function VfrRtPartNav({
  currentIndex,
  total,
  partLabel,
  onPrev,
  onNext,
}: VfrRtPartNavProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Button variant="outline" onClick={onPrev} disabled={currentIndex === 0}>
        Previous
      </Button>
      <p className="text-sm text-muted-foreground">
        Question {currentIndex + 1} of {total} · {partLabel}
      </p>
      <Button variant="outline" onClick={onNext} disabled={currentIndex === total - 1}>
        Next
      </Button>
    </div>
  )
}
