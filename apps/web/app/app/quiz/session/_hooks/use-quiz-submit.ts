import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { useEffect, useRef, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import {
  buildHandleDiscard,
  buildHandleSave,
  buildHandleSubmit,
  NAV_FALLBACK_MS,
  type QuizPendingAction,
} from './quiz-submit-handlers'

export type { QuizPendingAction }
export { NAV_FALLBACK_MS }

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
  examMode?: DbQuizMode
}) {
  const submitted = useRef(false)
  // Synchronous one-shot re-entry guard for handleSubmit (multi-source: timer/click/keyboard).
  const inFlight = useRef(false)
  const navFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  // A single discriminator drives both per-button spinners and derived `submitting`.
  const [pendingAction, setPendingAction] = useState<QuizPendingAction>(null)
  const submitting = pendingAction !== null
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (navFallbackTimer.current) clearTimeout(navFallbackTimer.current)
    }
  }, [])

  // `shared` carries every opts field plus the local setters/refs — each builder below
  // structurally picks only the subset it declares (excess fields are harmless).
  const shared = { ...opts, setPendingAction, setError, submitted, inFlight }
  const handleSubmit = buildHandleSubmit({ ...shared, navFallbackTimer, setShowFinishDialog })
  const handleSave = buildHandleSave(shared)
  const handleDiscard = buildHandleDiscard(shared)

  return {
    submitted,
    showFinishDialog,
    setShowFinishDialog,
    submitting,
    pendingAction,
    error,
    clearError: () => setError(null),
    handleSubmit,
    handleSave,
    handleDiscard,
  }
}
