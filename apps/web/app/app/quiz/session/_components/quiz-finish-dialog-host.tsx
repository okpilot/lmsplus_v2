'use client'

import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import { FinishQuizDialog } from '../../_components/finish-quiz-dialog'
import type { QuizState } from '../_hooks/use-quiz-state'

type QuizFinishDialogHostProps = {
  s: QuizState
  isDiscovery: boolean
  totalQuestions: number
  examMode?: DbQuizMode
  timeExpired: boolean
}

/**
 * Wraps FinishQuizDialog with the discovery suppression + exam-mode default.
 * Discovery is browse-only (nothing scored), so there is no finish flow — render
 * nothing. For study/exam, render the dialog exactly as the runner did inline,
 * defaulting examMode to mock_exam for exam sessions written before the field landed.
 */
export function QuizFinishDialogHost({
  s,
  isDiscovery,
  totalQuestions,
  examMode,
  timeExpired,
}: QuizFinishDialogHostProps) {
  if (isDiscovery) return null
  return (
    <FinishQuizDialog
      open={s.showFinishDialog}
      answeredCount={s.answeredCount}
      totalQuestions={totalQuestions}
      submitting={s.submitting}
      pendingAction={s.pendingAction}
      error={s.error}
      onSubmit={s.handleSubmit}
      onCancel={() => s.setShowFinishDialog(false)}
      onSave={s.handleSave}
      onDiscard={s.handleDiscard}
      isExam={s.isExam}
      examMode={s.isExam ? (examMode ?? 'mock_exam') : undefined}
      timeExpired={timeExpired}
    />
  )
}
