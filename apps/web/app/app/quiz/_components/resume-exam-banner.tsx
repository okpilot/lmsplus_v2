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

type Props = {
  userId: string
  exam: ActiveExamSession
}

export function ResumeExamBanner({ userId, exam }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)

  if (discarded) return null

  function handleResume() {
    try {
      sessionStorage.setItem(
        sessionHandoffKey(userId),
        JSON.stringify({
          userId,
          sessionId: exam.sessionId,
          mode: 'exam',
          questionIds: [],
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
      const result = await discardQuiz({ sessionId: exam.sessionId })
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

  return (
    <div className="mx-auto max-w-md rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
      <p className="text-sm font-medium text-foreground">Practice Exam in progress</p>
      <p className="mt-1 text-xs text-muted-foreground">{exam.subjectName} — session interrupted</p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleResume}
          disabled={loading}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          Resume Practice Exam
        </button>
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
