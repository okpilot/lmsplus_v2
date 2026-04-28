'use client'

import { MODE_LABELS, type QuizMode } from '@/lib/constants/exam-modes'
import { ExamCountdownTimer } from '../../_components/exam-countdown-timer'

type ExamSessionHeaderProps = {
  mode: QuizMode
  timeLimitSeconds: number
  startedAt: number
  onExpired: () => void
  className?: string
}

export function ExamBadge({ mode = 'mock_exam' }: { mode?: QuizMode } = {}) {
  return (
    <span className="hidden md:inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
      {MODE_LABELS[mode].toUpperCase()}
    </span>
  )
}

export function ExamSessionHeader({
  mode,
  timeLimitSeconds,
  startedAt,
  onExpired,
  className,
}: ExamSessionHeaderProps) {
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
