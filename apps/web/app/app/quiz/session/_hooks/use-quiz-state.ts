import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import type { DraftAnswer, QuizStateOpts } from '../../types'
import { useAnswerHandler } from './use-answer-handler'
import { usePinnedQuestions } from './use-pinned-questions'
import { useQuizNavigation } from './use-quiz-navigation'
import { useQuizPersistence } from './use-quiz-persistence'
import { useQuizSubmit } from './use-quiz-submit'

export type QuizState = ReturnType<typeof useQuizState>

export function useQuizState(opts: QuizStateOpts) {
  const { sessionId, questions, initialAnswers, initialFeedback } = opts
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

  const { checkpoint } = useQuizPersistence(opts)

  const {
    feedback,
    error: answerError,
    handleSelectAnswer,
    clearError: clearAnswerError,
    pendingQuestionIdRef,
  } = useAnswerHandler({
    sessionId,
    getQuestionId: () => questionId,
    getAnswerStartTime: () => nav.answerStartTime.current,
    answers,
    setAnswers,
    initialFeedback,
    onAnswerRecorded: (a, fb) => checkpoint(a, currentIndexRef.current, fb),
    onAnswerReverted: (a) => checkpoint(a, currentIndexRef.current),
  })

  const {
    submitted,
    error: submitError,
    clearError: clearSubmitError,
    ...submit
  } = useQuizSubmit({
    userId: opts.userId,
    sessionId,
    questions,
    answersRef,
    currentIndexRef,
    router,
    draftId: opts.draftId,
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
  })
  const wrappedNavigateTo = (index: number) => {
    clearAnswerError()
    clearSubmitError()
    nav.navigateTo(index)
    const pending = pendingQuestionIdRef.current
    if (pending.size > 0) {
      const safe = new Map(answersRef.current)
      for (const qId of pending) safe.delete(qId)
      checkpoint(safe, index, feedback)
    } else {
      checkpoint(answersRef.current, index, feedback)
    }
  }
  const wrappedNavigate = (d: number) => wrappedNavigateTo(nav.currentIndex + d)

  // Frozen at mount — loader guarantees initialAnswers is resolved before render
  const initialSize = useRef(initialAnswers ? Object.keys(initialAnswers).length : 0)
  useNavigationGuard(answers.size > initialSize.current && !submitted.current)

  // Stable array reference for hooks that depend on questionIds (e.g. useFlaggedQuestions)
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
    navigateTo: wrappedNavigateTo,
    navigate: wrappedNavigate,
    togglePin: () => togglePinById(questionId),
    error: submitError ?? answerError,
    ...submit,
  }
}
