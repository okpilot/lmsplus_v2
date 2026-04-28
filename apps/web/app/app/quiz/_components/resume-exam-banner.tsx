'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
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
import { discardQuiz } from '../actions/discard'
import type { ActiveExamSession } from '../actions/get-active-exam-session'
import { sessionHandoffKey } from '../session/_utils/quiz-session-storage'

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

export function ResumeExamBanner({ userId, exam, discardOnly, sessionId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)

  const activeSessionId = discardOnly ? sessionId : exam.sessionId

  if (discarded) return null

  function handleResume() {
    if (discardOnly || !exam) return
    try {
      sessionStorage.setItem(
        sessionHandoffKey(userId),
        JSON.stringify({
          userId,
          sessionId: exam.sessionId,
          mode: 'exam',
          questionIds: exam.questionIds,
          timeLimitSeconds: exam.timeLimitSeconds,
          passMark: exam.passMark,
          subjectName: exam.subjectName,
          subjectCode: exam.subjectCode,
          startedAt: exam.startedAt,
        }),
      )
    } catch (err) {
      console.warn('[resume-exam-banner] Handoff write failed:', err)
      setError('Unable to resume right now. Please try again.')
      return
    }
    router.push('/app/quiz/session')
  }

  async function handleDiscard() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const result = await discardQuiz({ sessionId: activeSessionId })
      if (result.success) {
        setDiscarded(true)
        router.refresh()
      } else {
        setError(result.error ?? 'Failed to discard. Please try again.')
      }
    } catch {
      setError('Server unavailable. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  const title = discardOnly
    ? 'Practice exam stuck — discard to start a new one'
    : 'Practice Exam in progress'
  const subtitle = discardOnly
    ? 'This session has incomplete data and cannot be resumed.'
    : `${exam.subjectName} — session interrupted`

  return (
    <div className="mx-auto max-w-md rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {!discardOnly && (
          <button
            type="button"
            onClick={handleResume}
            disabled={loading}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            Resume Practice Exam
          </button>
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
      </div>
    </div>
  )
}
