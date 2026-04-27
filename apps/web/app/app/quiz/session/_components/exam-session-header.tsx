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
    <span className="hidden md:inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
      PRACTICE EXAM
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
