'use client'

import { useEffect, useState } from 'react'
import { useAutoSubmitCountdown } from '../../_hooks/use-auto-submit-countdown'
import {
  buildFinishDialogHandlers,
  deriveFinishDialogView,
  type FinishQuizDialogState,
  type UseFinishQuizDialogOpts,
} from './finish-quiz-dialog-helpers'

export type { FinishQuizDialogState, UseFinishQuizDialogOpts }

export function useFinishQuizDialog(
  opts: Readonly<UseFinishQuizDialogOpts>,
): FinishQuizDialogState {
  const { open, answeredCount, totalQuestions, submitting, onSubmit, onCancel } = opts
  const { isExam, examMode, timeExpired } = opts

  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [confirmingSubmit, setConfirmingSubmit] = useState(false)
  const countdown = useAutoSubmitCountdown({
    active: open && !!timeExpired && !!isExam,
    seconds: 10,
    submitting,
    onSubmit,
  })

  useEffect(() => {
    if (!open || (timeExpired && isExam)) {
      setConfirmingDiscard(false)
      setConfirmingSubmit(false)
    }
  }, [open, timeExpired, isExam])

  const { unanswered, isInternalExam, examLabel, title, canDismiss, canDiscard } =
    deriveFinishDialogView({ answeredCount, totalQuestions, isExam, examMode, timeExpired })

  const {
    handleClose,
    handleSubmitClick,
    cancelSubmitConfirm,
    openDiscardConfirm,
    cancelDiscardConfirm,
  } = buildFinishDialogHandlers({
    canDismiss,
    unanswered,
    confirmingSubmit,
    timeExpired,
    onCancel,
    onSubmit,
    setConfirmingDiscard,
    setConfirmingSubmit,
  })

  return {
    countdown,
    confirmingDiscard,
    confirmingSubmit,
    unanswered,
    isInternalExam,
    examLabel,
    title,
    canDismiss,
    canDiscard,
    handleClose,
    handleSubmitClick,
    cancelSubmitConfirm,
    openDiscardConfirm,
    cancelDiscardConfirm,
  }
}
