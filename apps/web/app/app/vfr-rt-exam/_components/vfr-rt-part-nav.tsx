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
  // Defensive: total is 25 in practice, but a 0-question set must not render
  // "Question 1 of 0" with Next enabled (currentIndex === total - 1 is false at 0/0).
  const hasQuestions = total > 0
  const displayIndex = hasQuestions ? currentIndex + 1 : 0
  return (
    <div className="flex items-center justify-between gap-4">
      <Button variant="outline" onClick={onPrev} disabled={!hasQuestions || currentIndex <= 0}>
        Previous
      </Button>
      <p className="text-sm text-muted-foreground">
        Question {displayIndex} of {total} · {partLabel}
      </p>
      <Button
        variant="outline"
        onClick={onNext}
        disabled={!hasQuestions || currentIndex >= total - 1}
      >
        Next
      </Button>
    </div>
  )
}
