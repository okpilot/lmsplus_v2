'use client'

import Link from 'next/link'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { buttonVariants } from '@/components/ui/button-variants'
import { FieldError } from '@/components/ui/field-error'
import { cn } from '@/lib/utils'
import { useResumeExamActions } from '../_hooks/use-resume-exam-actions'
import type { ActiveExamSession } from '../actions/get-active-exam-session'

type NormalProps = {
  userId: string
  exam: ActiveExamSession
  discardOnly?: false
  sessionId?: never
}

type DiscardOnlyProps = {
  userId: string
  discardOnly: true
  sessionId: string
  exam?: never
}

type Props = NormalProps | DiscardOnlyProps

export function ResumeLink({
  sessionId,
  loading,
  children,
}: Readonly<{ sessionId: string; loading: boolean; children: React.ReactNode }>) {
  return (
    <Link
      href={`/app/quiz/session/${sessionId}`}
      aria-disabled={loading || undefined}
      tabIndex={loading ? -1 : undefined}
      onClick={(e) => {
        if (loading) e.preventDefault()
      }}
      className={cn(buttonVariants(), 'aria-disabled:pointer-events-none aria-disabled:opacity-50')}
    >
      {children}
    </Link>
  )
}

export function ResumeExamBanner({ userId, exam, discardOnly, sessionId }: Readonly<Props>) {
  const activeSessionId = discardOnly ? sessionId : exam.sessionId
  const { loading, error, discarded, handleDiscard } = useResumeExamActions({
    userId,
    activeSessionId,
  })

  if (discarded) return null

  const title = discardOnly
    ? 'Practice exam stuck — discard to start a new one'
    : 'Practice Exam in progress'
  const subtitle = discardOnly
    ? 'This session has incomplete data and cannot be resumed.'
    : `${exam.subjectName} — session interrupted`

  return (
    <Alert tone="caution" className="mx-auto mb-4 max-w-md">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{subtitle}</AlertDescription>
      <FieldError role="alert">{error}</FieldError>
      <AlertAction className="flex gap-2">
        {!discardOnly && (
          <ResumeLink sessionId={activeSessionId} loading={loading}>
            Resume Practice Exam
          </ResumeLink>
        )}
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <button
                type="button"
                disabled={loading}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              />
            }
          >
            Discard
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard Practice Exam?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently discard your Practice Exam session. You cannot undo this
                action.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDiscard}>
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AlertAction>
    </Alert>
  )
}
