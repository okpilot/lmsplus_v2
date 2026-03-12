import type { SessionQuestion } from '@/app/app/_components/session-runner'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import type { DraftAnswer } from '../../types'
import { saveQuizDraft, submitQuizSession } from './quiz-submit'
import { useFlaggedQuestions } from './use-flagged-questions'

type StoredAnswer = { selectedOptionId: string; responseTimeMs: number }
type UseQuizStateOpts = {
  sessionId: string
  questions: SessionQuestion[]
  initialAnswers?: Record<string, DraftAnswer>
  initialIndex?: number
}

export function useQuizState({
  sessionId,
  questions,
  initialAnswers,
  initialIndex,
}: UseQuizStateOpts) {
  const router = useRouter()
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0)
  const [answers, setAnswers] = useState<Map<string, StoredAnswer>>(() =>
    initialAnswers ? new Map(Object.entries(initialAnswers)) : new Map(),
  )
  const { flaggedQuestions, toggleFlag: toggleFlagById } = useFlaggedQuestions()
  const answerStartTime = useRef(Date.now())
  const submitted = useRef(false)
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useNavigationGuard(answers.size > 0 && !submitted.current)

  const question = questions[currentIndex]
  const questionId = question?.id ?? ''

  function handleSelectAnswer(optionId: string) {
    const elapsed = Date.now() - answerStartTime.current
    setAnswers((prev) =>
      new Map(prev).set(questionId, { selectedOptionId: optionId, responseTimeMs: elapsed }),
    )
  }

  function navigateTo(index: number) {
    if (index >= 0 && index < questions.length) {
      setCurrentIndex(index)
      answerStartTime.current = Date.now()
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const r = await submitQuizSession(sessionId, answers)
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
    const r = await saveQuizDraft({ sessionId, questionIds, answers, currentIndex, router })
    if (!r.success) {
      setError(r.error)
      setSubmitting(false)
    }
  }

  return {
    currentIndex,
    question,
    questionId,
    answeredCount: answers.size,
    existingAnswer: answers.get(questionId),
    questionIds: questions.map((q) => q.id),
    answeredIds: new Set(answers.keys()),
    flaggedQuestions,
    isFlagged: flaggedQuestions.has(questionId),
    submitting,
    error,
    showFinishDialog,
    handleSelectAnswer,
    navigateTo,
    navigate: (d: number) => navigateTo(currentIndex + d),
    toggleFlag: () => toggleFlagById(questionId),
    handleSubmit,
    handleSave,
    setShowFinishDialog,
  }
}
