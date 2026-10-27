'use client'

import { Badge } from '@/components/ui/badge'
import { MODE_LABELS, type QuizMode } from '@/lib/constants/exam-modes'
import { ExamCountdownTimer } from '../../_components/exam-countdown-timer'

type ExamSessionHeaderProps = {
  mode: QuizMode
  timeLimitSeconds: number
  startedAt: number
  onExpired: () => void
  className?: string
}

export function ExamBadge({ mode = 'mock_exam' }: Readonly<{ mode?: QuizMode }> = {}) {
  return (
    <Badge tone="caution" className="hidden md:inline-flex">
      {MODE_LABELS[mode].toUpperCase()}
    </Badge>
  )
}

export function ExamSessionHeader({
  mode,
  timeLimitSeconds,
  startedAt,
  onExpired,
  className,
}: Readonly<ExamSessionHeaderProps>) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <ExamBadge mode={mode} />
      <ExamCountdownTimer
        timeLimitSeconds={timeLimitSeconds}
        startedAt={startedAt}
        onExpired={onExpired}
        className="text-sm"
      />
    </div>
  )
}
