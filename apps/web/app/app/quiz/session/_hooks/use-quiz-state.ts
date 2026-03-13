import type { SessionQuestion } from '@/app/app/_components/session-runner'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { checkAnswer } from '../../actions/check-answer'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { handleDiscardSession, handleSaveSession, handleSubmitSession } from './quiz-submit'
import { usePinnedQuestions } from './use-pinned-questions'
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
  const { pinnedQuestions, togglePin: togglePinById } = usePinnedQuestions()
  const submitted = useRef(false)
  const answersRef = useRef(answers)
  answersRef.current = answers
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useNavigationGuard(answers.size > 0 && !submitted.current)

  const question = questions[nav.currentIndex]
  const questionId = question?.id ?? ''
  const shared = { router, setSubmitting, setError }

  const lockedQuestionsRef = useRef<Set<string>>(new Set())

  async function handleSelectAnswer(optionId: string) {
    if (lockedQuestionsRef.current.has(questionId) || answers.has(questionId)) return
    lockedQuestionsRef.current.add(questionId)
    const elapsed = Date.now() - nav.answerStartTime.current
    setAnswers((prev) =>
      new Map(prev).set(questionId, { selectedOptionId: optionId, responseTimeMs: elapsed }),
    )
    const result = await checkAnswer({ questionId, selectedOptionId: optionId })
    if (result.success) {
      const { isCorrect, correctOptionId, explanationText, explanationImageUrl } = result
      setFeedback((prev) =>
        new Map(prev).set(questionId, {
          isCorrect,
          correctOptionId,
          explanationText,
          explanationImageUrl,
        }),
      )
    }
  }

  function handleSubmit() {
    return handleSubmitSession({
      sessionId,
      answers: answersRef.current,
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
      sessionId,
      questions,
      answers: answersRef.current,
      currentIndex: nav.currentIndex,
      draftId: opts.draftId,
      subjectName: opts.subjectName,
      subjectCode: opts.subjectCode,
      ...shared,
    })
  }
  function handleDiscard() {
    return handleDiscardSession({ sessionId, draftId: opts.draftId, ...shared })
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
    pinnedQuestions,
    isPinned: pinnedQuestions.has(questionId),
    submitting,
    error,
    showFinishDialog,
    handleSelectAnswer,
    navigateTo: nav.navigateTo,
    handleSubmit,
    handleSave,
    handleDiscard,
    setShowFinishDialog,
    navigate: nav.navigate,
    togglePin: () => togglePinById(questionId),
  }
}
