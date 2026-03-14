import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import type { DraftAnswer, QuizStateOpts } from '../../types'
import { useAnswerHandler } from './use-answer-handler'
import { usePinnedQuestions } from './use-pinned-questions'
import { useQuizNavigation } from './use-quiz-navigation'
import { useQuizSubmit } from './use-quiz-submit'

export function useQuizState(opts: QuizStateOpts) {
  const { sessionId, questions, initialAnswers } = opts
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

  const {
    feedback,
    error: answerError,
    handleSelectAnswer,
  } = useAnswerHandler({
    sessionId,
    getQuestionId: () => questionId,
    getAnswerStartTime: () => nav.answerStartTime.current,
    answers,
    setAnswers,
  })

  const {
    submitted,
    error: submitError,
    ...submit
  } = useQuizSubmit({
    sessionId,
    questions,
    answersRef,
    currentIndexRef,
    router,
    draftId: opts.draftId,
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
  })
  // Frozen at mount — loader guarantees initialAnswers is resolved before render
  const initialSize = useRef(initialAnswers ? Object.keys(initialAnswers).length : 0)
  useNavigationGuard(answers.size > initialSize.current && !submitted.current)

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
    handleSelectAnswer,
    navigateTo: nav.navigateTo,
    navigate: nav.navigate,
    togglePin: () => togglePinById(questionId),
    error: answerError ?? submitError,
    ...submit,
  }
}
