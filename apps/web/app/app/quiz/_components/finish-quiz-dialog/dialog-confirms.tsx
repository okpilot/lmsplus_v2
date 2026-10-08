'use client'

import type { QuizPendingAction } from '../../session/_hooks/use-quiz-submit'
import { ConfirmPanel } from './confirm-panel'
import { getDiscardConfirmMessage, getSubmitConfirmMessage } from './finish-quiz-dialog-helpers'

type SubmitConfirmProps = {
  unanswered: number
  isExam?: boolean
  submitting: boolean
  pendingAction?: QuizPendingAction
  onSubmit: () => void
  onCancel: () => void
}

export function SubmitConfirm({
  unanswered,
  isExam,
  submitting,
  pendingAction,
  onSubmit,
  onCancel,
}: Readonly<SubmitConfirmProps>) {
  return (
    <ConfirmPanel
      message={getSubmitConfirmMessage({ unanswered, isExam })}
      confirmLabel={pendingAction === 'submit' ? 'Submitting...' : 'Submit anyway'}
      onConfirm={onSubmit}
      onCancel={onCancel}
      submitting={submitting}
      busy={pendingAction === 'submit'}
      variant="warning"
    />
  )
}

type DiscardConfirmProps = {
  isExam?: boolean
  submitting: boolean
  pendingAction?: QuizPendingAction
  onDiscard: () => void
  onCancel: () => void
}

export function DiscardConfirm({
  isExam,
  submitting,
  pendingAction,
  onDiscard,
  onCancel,
}: Readonly<DiscardConfirmProps>) {
  return (
    <ConfirmPanel
      message={getDiscardConfirmMessage(isExam)}
      confirmLabel={pendingAction === 'discard' ? 'Discarding...' : 'Yes, discard'}
      onConfirm={onDiscard}
      onCancel={onCancel}
      submitting={submitting}
      busy={pendingAction === 'discard'}
      variant="destructive"
    />
  )
}
