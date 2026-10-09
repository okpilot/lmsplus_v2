'use client'

import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import { FinishQuizDialog } from '../../_components/finish-quiz-dialog'
import type { QuizState } from '../_hooks/use-quiz-state'
import { DiscoveryLeaveDialog } from './discovery-leave-dialog'

type QuizFinishDialogHostProps = {
  s: QuizState
  isDiscovery: boolean
  totalQuestions: number
  examMode?: DbQuizMode
  timeExpired: boolean
  /** A picked option on the current question that was never submitted. */
  pendingSelection?: boolean
  discoveryConfirmOpen?: boolean
  onDiscoveryConfirmChange?: (open: boolean) => void
}

/**
 * Wraps FinishQuizDialog with the exam-mode default. Discovery is browse-only (nothing
 * scored), so there is no finish flow — it gets the Stay/Leave confirm instead. For
 * study/exam, render the finish dialog, defaulting examMode to mock_exam for exam
 * sessions written before the field landed.
 */
export function QuizFinishDialogHost({
  s,
  isDiscovery,
  totalQuestions,
  examMode,
  timeExpired,
  pendingSelection,
  discoveryConfirmOpen = false,
  onDiscoveryConfirmChange = () => {},
}: Readonly<QuizFinishDialogHostProps>) {
  if (isDiscovery) {
    return (
      <DiscoveryLeaveDialog open={discoveryConfirmOpen} onOpenChange={onDiscoveryConfirmChange} />
    )
  }
  return (
    <FinishQuizDialog
      open={s.showFinishDialog}
      answeredCount={s.answeredCount}
      totalQuestions={totalQuestions}
      submitting={s.submitting}
      pendingAction={s.pendingAction}
      error={s.submitError}
      onSubmit={s.handleSubmit}
      onCancel={() => s.setShowFinishDialog(false)}
      onSave={s.handleSave}
      onDiscard={s.handleDiscard}
      isExam={s.isExam}
      examMode={s.isExam ? (examMode ?? 'mock_exam') : undefined}
      timeExpired={timeExpired}
      pendingSelection={pendingSelection}
    />
  )
}
