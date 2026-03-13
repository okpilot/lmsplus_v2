import type { SessionQuestion } from '@/app/app/_components/session-runner'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { checkAnswer } from '../../actions/check-answer'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { saveQuizDraft, submitQuizSession } from './quiz-submit'
import { useFlaggedQuestions } from './use-flagged-questions'
import { useQuizNavigation } from './use-quiz-navigation'

export function useQuizState(opts: {
  sessionId: string
  questions: SessionQuestion[]
  initialAnswers?: Record<string, DraftAnswer>
  initialIndex?: number
  draftId?: string
  subjectName?: string
  subjectCode?: string
}) {
  const { sessionId, questions, initialAnswers } = opts
  const router = useRouter()
  const nav = useQuizNavigation({
    totalQuestions: questions.length,
    initialIndex: opts.initialIndex,
  })
  const [answers, setAnswers] = useState<Map<string, DraftAnswer>>(() =>
    initialAnswers ? new Map(Object.entries(initialAnswers)) : new Map(),
  )
  const [feedback, setFeedback] = useState<Map<string, AnswerFeedback>>(new Map())
  const { flaggedQuestions, toggleFlag: toggleFlagById } = useFlaggedQuestions()
  const submitted = useRef(false)
  const answersRef = useRef(answers)
  answersRef.current = answers
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useNavigationGuard(answers.size > 0 && !submitted.current)

  const question = questions[nav.currentIndex]
  const questionId = question?.id ?? ''

  async function handleSelectAnswer(optionId: string) {
    // Re-entry guard: ignore if this question already has a recorded answer
    if (answers.has(questionId)) return

    // Lock immediately — record the answer before awaiting the server
    const elapsed = Date.now() - nav.answerStartTime.current
    setAnswers((prev) =>
      new Map(prev).set(questionId, { selectedOptionId: optionId, responseTimeMs: elapsed }),
    )

    // Fetch correctness feedback without blocking the UI
    const result = await checkAnswer({ questionId, selectedOptionId: optionId })
    if (result.success) {
      setFeedback((prev) =>
        new Map(prev).set(questionId, {
          isCorrect: result.isCorrect,
          correctOptionId: result.correctOptionId,
          explanationText: result.explanationText,
          explanationImageUrl: result.explanationImageUrl,
        }),
      )
    }
  }

  async function handleSubmit() {
    const currentAnswers = answersRef.current
    if (currentAnswers.size === 0) {
      setError('No answers to submit.')
      return
    }
    setSubmitting(true)
    setError(null)
    const r = await submitQuizSession(sessionId, currentAnswers, opts.draftId)
    if (r.success) {
      submitted.current = true
      setShowFinishDialog(false)
      router.push(`/app/quiz/report?session=${sessionId}`)
    } else {
      setError(r.error)
      setSubmitting(false)
    }
  }
  async function handleSave() {
    setSubmitting(true)
    setError(null)
    const questionIds = questions.map((q) => q.id)
    const r = await saveQuizDraft({
      sessionId,
      questionIds,
      answers: answersRef.current,
      currentIndex: nav.currentIndex,
      router,
      draftId: opts.draftId,
      subjectName: opts.subjectName,
      subjectCode: opts.subjectCode,
    })
    if (!r.success) {
      setError(r.error)
      setSubmitting(false)
    }
  }

  return {
    currentIndex: nav.currentIndex,
    question,
    questionId,
    answeredCount: answers.size,
    existingAnswer: answers.get(questionId),
    currentFeedback: feedback.get(questionId) ?? null,
    questionIds: questions.map((q) => q.id),
    answeredIds: new Set(answers.keys()),
    flaggedQuestions,
    isFlagged: flaggedQuestions.has(questionId),
    submitting,
    error,
    showFinishDialog,
    handleSelectAnswer,
    navigateTo: nav.navigateTo,
    handleSubmit,
    handleSave,
    setShowFinishDialog,
    navigate: nav.navigate,
    toggleFlag: () => toggleFlagById(questionId),
  }
}
