import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { useRef, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { handleDiscardSession, handleSaveSession, handleSubmitSession } from './quiz-submit'

export function useQuizSubmit(opts: {
  userId: string
  sessionId: string
  questions: SessionQuestion[]
  answersRef: React.RefObject<Map<string, DraftAnswer>>
  feedbackRef: React.RefObject<Map<string, AnswerFeedback>>
  currentIndexRef: React.RefObject<number>
  pendingQuestionIdRef: React.RefObject<Set<string>>
  router: AppRouterInstance
  draftId?: string
  subjectName?: string
  subjectCode?: string
  isExam?: boolean
}) {
  const submitted = useRef(false)
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shared = { router: opts.router, setSubmitting, setError }

  function handleSubmit() {
    const pending = opts.pendingQuestionIdRef.current
    const safeAnswers =
      pending.size > 0
        ? new Map([...opts.answersRef.current].filter(([qId]) => !pending.has(qId)))
        : opts.answersRef.current
    return handleSubmitSession({
      userId: opts.userId,
      sessionId: opts.sessionId,
      answers: safeAnswers,
      draftId: opts.draftId,
      isExam: opts.isExam,
      onSuccess: () => {
        submitted.current = true
        setShowFinishDialog(false)
      },
      ...shared,
    })
  }

  function handleSave() {
    const pending = opts.pendingQuestionIdRef.current
    const safeAnswers =
      pending.size > 0
        ? new Map([...opts.answersRef.current].filter(([qId]) => !pending.has(qId)))
        : opts.answersRef.current
    return handleSaveSession({
      userId: opts.userId,
      sessionId: opts.sessionId,
      questions: opts.questions,
      answers: safeAnswers,
      feedback: opts.feedbackRef.current,
      currentIndex: opts.currentIndexRef.current,
      draftId: opts.draftId,
      subjectName: opts.subjectName,
      subjectCode: opts.subjectCode,
      ...shared,
    })
  }

  function handleDiscard() {
    return handleDiscardSession({
      userId: opts.userId,
      sessionId: opts.sessionId,
      draftId: opts.draftId,
      ...shared,
    })
  }

  return {
    submitted,
    showFinishDialog,
    setShowFinishDialog,
    submitting,
    error,
    clearError: () => setError(null),
    handleSubmit,
    handleSave,
    handleDiscard,
  }
}
