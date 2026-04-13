'use client'

import { ExamCountdownTimer } from '../../_components/exam-countdown-timer'

type ExamSessionHeaderProps = {
  timeLimitSeconds: number
  startedAt: number
  onExpired: () => void
  className?: string
}

export function ExamBadge() {
  return (
    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
      EXAM
    </span>
  )
}

export function ExamSessionHeader({
  timeLimitSeconds,
  startedAt,
  onExpired,
  className,
}: ExamSessionHeaderProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <ExamBadge />
      <ExamCountdownTimer
        timeLimitSeconds={timeLimitSeconds}
        startedAt={startedAt}
        onExpired={onExpired}
        className="text-sm"
      />
    </div>
  )
}
