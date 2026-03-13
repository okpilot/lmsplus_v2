import type { SessionQuestion } from '@/app/app/_components/session-runner'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { useRef, useState } from 'react'
import type { DraftAnswer } from '../../types'
import { handleDiscardSession, handleSaveSession, handleSubmitSession } from './quiz-submit'

export function useQuizSubmit(opts: {
  sessionId: string
  questions: SessionQuestion[]
  answersRef: React.RefObject<Map<string, DraftAnswer>>
  currentIndex: number
  router: AppRouterInstance
  draftId?: string
  subjectName?: string
  subjectCode?: string
}) {
  const submitted = useRef(false)
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shared = { router: opts.router, setSubmitting, setError }

  function handleSubmit() {
    return handleSubmitSession({
      sessionId: opts.sessionId,
      answers: opts.answersRef.current,
      draftId: opts.draftId,
      onSuccess: () => {
        submitted.current = true
        setShowFinishDialog(false)
      },
      ...shared,
    })
  }

  function handleSave() {
    return handleSaveSession({
      sessionId: opts.sessionId,
      questions: opts.questions,
      answers: opts.answersRef.current,
      currentIndex: opts.currentIndex,
      draftId: opts.draftId,
      subjectName: opts.subjectName,
      subjectCode: opts.subjectCode,
      ...shared,
    })
  }

  function handleDiscard() {
    return handleDiscardSession({ sessionId: opts.sessionId, draftId: opts.draftId, ...shared })
  }

  return {
    submitted,
    showFinishDialog,
    setShowFinishDialog,
    submitting,
    error,
    handleSubmit,
    handleSave,
    handleDiscard,
  }
}
