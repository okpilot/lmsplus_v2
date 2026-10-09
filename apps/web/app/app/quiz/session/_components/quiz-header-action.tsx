'use client'

import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'
import { type QuizMode as DbQuizMode, MODE_LABELS } from '@/lib/constants/exam-modes'

type Props = {
  isExam: boolean
  isDiscovery?: boolean
  examMode?: DbQuizMode
  submitting: boolean
  onFinishClick: () => void
  /** Discovery only: opens the Stay / Leave confirm. */
  onExitClick?: () => void
}

/** The header's Finish button, or Exit in Discovery, which is browse-only. */
export function QuizHeaderAction({
  isExam,
  isDiscovery,
  examMode,
  submitting,
  onFinishClick,
  onExitClick,
}: Readonly<Props>) {
  const finishLabel = isExam ? `Finish ${MODE_LABELS[examMode ?? 'mock_exam']}` : 'Finish Test'

  if (isDiscovery) {
    return (
      <Button type="button" onClick={onExitClick} className="shrink-0">
        Exit
      </Button>
    )
  }
  return (
    <Button
      type="button"
      onClick={onFinishClick}
      disabled={submitting}
      aria-busy={submitting || undefined}
      className="shrink-0"
    >
      <span className="inline-flex items-center justify-center gap-2">
        <BusyLabel busy={submitting}>{finishLabel}</BusyLabel>
      </span>
    </Button>
  )
}
