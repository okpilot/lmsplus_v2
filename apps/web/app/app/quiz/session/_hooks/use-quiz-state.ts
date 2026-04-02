import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import type { DraftAnswer, QuizStateOpts } from '../../types'
import { useAnswerPipeline } from './use-answer-pipeline'
import { usePinnedQuestions } from './use-pinned-questions'
import { useQuizNavigation } from './use-quiz-navigation'

export type QuizState = ReturnType<typeof useQuizState>

export function useQuizState(opts: QuizStateOpts) {
  const { questions, initialAnswers } = opts
  const router = useRouter()
  const nav = useQuizNavigation({
    totalQuestions: questions.length,
    initialIndex: opts.initialIndex,
  })
  const [answers, setAnswers] = useState<Map<string, DraftAnswer>>(() =>
    initialAnswers ? new Map(Object.entries(initialAnswers)) : new Map(),
  )
  const { pinnedQuestions, togglePin: togglePinById } = usePinnedQuestions()
  const answersRef = useRef(answers)
  answersRef.current = answers
  const currentIndexRef = useRef(nav.currentIndex)
  currentIndexRef.current = nav.currentIndex
  const question = questions[nav.currentIndex]
  const questionId = question?.id ?? ''

  const { feedback, handleSelectAnswer, navigateTo, navigate, submitted, error, ...submit } =
    useAnswerPipeline({
      ...opts,
      getQuestionId: () => questionId,
      getAnswerStartTime: () => nav.answerStartTime.current,
      getCurrentIndex: () => nav.currentIndex,
      answers,
      setAnswers,
      answersRef,
      currentIndexRef,
      navigateTo: nav.navigateTo,
      router,
    })

  const initialSize = useRef(initialAnswers ? Object.keys(initialAnswers).length : 0)
  useNavigationGuard(answers.size > initialSize.current && !submitted.current)
  const stableQuestionIds = useMemo(() => questions.map((q) => q.id), [questions])

  return {
    currentIndex: nav.currentIndex,
    question,
    questionId,
    answeredCount: answers.size,
    existingAnswer: answers.get(questionId),
    currentFeedback: feedback.get(questionId) ?? null,
    questionIds: stableQuestionIds,
    answeredIds: new Set(answers.keys()),
    feedback,
    pinnedQuestions,
    isPinned: pinnedQuestions.has(questionId),
    handleSelectAnswer,
    navigateTo,
    navigate,
    togglePin: () => togglePinById(questionId),
    error,
    ...submit,
  }
}
