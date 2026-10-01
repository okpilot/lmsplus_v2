'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const DISMISS_CLASS =
  'rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50'

type DiscardControlProps = Readonly<{
  isExam: boolean
  examLabel: string
  loading: boolean
  onDiscard: () => void
}>

/** Discard dialog wording: exams name the exam, study sessions refer to progress. */
export function discardCopy(isExam: boolean, examLabel: string) {
  if (!isExam) {
    return {
      title: 'Discard quiz session?',
      description: 'This will permanently discard your progress. You cannot undo this action.',
    }
  }
  return {
    title: `Discard ${examLabel}?`,
    description: `This will permanently discard your ${examLabel} session. You cannot undo this action.`,
  }
}

export function DiscardControl({
  isExam,
  examLabel,
  loading,
  onDiscard,
}: Readonly<DiscardControlProps>) {
  const copy = discardCopy(isExam, examLabel)
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <button
            type="button"
            disabled={loading}
            className="rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          />
        }
      >
        Discard
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type DismissControlProps = Readonly<{
  loading: boolean
  onDismiss?: () => void
}>

export function DismissControl({ loading, onDismiss }: Readonly<DismissControlProps>) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<button type="button" disabled={loading} className={DISMISS_CLASS} />}
      >
        Dismiss
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dismiss this exam on this device?</AlertDialogTitle>
          <AlertDialogDescription>
            Your answers saved on this device will be removed. The exam stays open and its timer
            keeps running.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDismiss}>
            Dismiss
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
