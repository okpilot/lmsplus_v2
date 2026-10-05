'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type QuizMode as DbQuizMode, MODE_LABELS } from '@/lib/constants/exam-modes'
import { useDiscoveryExit } from '../_hooks/use-discovery-exit'

type Props = {
  isExam: boolean
  isDiscovery?: boolean
  examMode?: DbQuizMode
  submitting: boolean
  onFinishClick: () => void
}

/** The header's Finish button, or Exit in Discovery, which is browse-only. */
export function QuizHeaderAction({
  isExam,
  isDiscovery,
  examMode,
  submitting,
  onFinishClick,
}: Readonly<Props>) {
  const handleDiscoveryExit = useDiscoveryExit()
  const finishLabel = isExam ? `Finish ${MODE_LABELS[examMode ?? 'mock_exam']}` : 'Finish Test'

  if (isDiscovery) {
    return (
      // replace (not push): the consumed handoff makes the session page
      // un-resumable, so Back must not be able to reopen the exited runner.
      <Button type="button" onClick={handleDiscoveryExit} className="shrink-0">
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
        {submitting && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
        {finishLabel}
      </span>
    </Button>
  )
}
