'use client'

import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'
import type { QuizPendingAction } from '../../session/_hooks/use-quiz-submit'
import {
  getDiscardButtonLabel,
  getReturnButtonLabel,
  getSaveButtonLabel,
  getSubmitButtonLabel,
} from './finish-quiz-dialog-helpers'

type DialogFooterProps = {
  answeredCount: number
  submitting: boolean
  pendingAction?: QuizPendingAction
  isExam?: boolean
  examLabel?: string | null
  timeExpired?: boolean
  canDismiss: boolean
  canDiscard: boolean
  onSubmitClick: () => void
  onSave: () => void
  onDiscardOpen: () => void
  onClose: () => void
}

type FooterButtonProps = {
  variant?: 'outline' | 'destructive'
  onClick: () => void
  disabled: boolean
  busy?: boolean
  children: React.ReactNode
}

function FooterButton({ variant, onClick, disabled, busy, children }: Readonly<FooterButtonProps>) {
  return (
    <Button
      type="button"
      variant={variant}
      size="lg"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className="w-full"
    >
      {busy === undefined ? (
        children
      ) : (
        <span className="inline-flex items-center justify-center gap-2">
          <BusyLabel busy={busy}>{children}</BusyLabel>
        </span>
      )}
    </Button>
  )
}

// Every button is disabled while any action runs (`submitting`), but the spinner
// and "…ing" label belong only to the button whose own action is in flight.
export function DialogFooter({
  answeredCount,
  submitting,
  pendingAction,
  isExam,
  examLabel,
  timeExpired,
  canDismiss,
  canDiscard,
  onSubmitClick,
  onSave,
  onDiscardOpen,
  onClose,
}: Readonly<DialogFooterProps>) {
  const isSubmitting = pendingAction === 'submit'
  const isSaving = pendingAction === 'save'
  const submitLabel = getSubmitButtonLabel({ isSubmitting, isExam, examLabel, answeredCount })
  return (
    <div className="mt-6 flex flex-col gap-2">
      <FooterButton
        onClick={onSubmitClick}
        disabled={submitting || (answeredCount === 0 && !timeExpired)}
        busy={isSubmitting}
      >
        {submitLabel}
      </FooterButton>
      {!isExam && (
        <FooterButton variant="outline" onClick={onSave} disabled={submitting} busy={isSaving}>
          {getSaveButtonLabel({ isSaving })}
        </FooterButton>
      )}
      {canDiscard && (
        <FooterButton variant="destructive" onClick={onDiscardOpen} disabled={submitting}>
          {getDiscardButtonLabel({ isExam, examLabel })}
        </FooterButton>
      )}
      {canDismiss && (
        <FooterButton variant="outline" onClick={onClose} disabled={submitting}>
          {getReturnButtonLabel({ isExam, examLabel })}
        </FooterButton>
      )}
    </div>
  )
}
