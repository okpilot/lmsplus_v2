import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { checkAnswer } from '../../actions/check-answer'
import type { AnswerFeedback, DraftAnswer, QuizStateOpts } from '../../types'
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
  const [feedback, setFeedback] = useState<Map<string, AnswerFeedback>>(new Map())
  const { pinnedQuestions, togglePin: togglePinById } = usePinnedQuestions()
  const answersRef = useRef(answers)
  answersRef.current = answers
  const currentIndexRef = useRef(nav.currentIndex)
  currentIndexRef.current = nav.currentIndex

  const { submitted, ...submit } = useQuizSubmit({
    sessionId,
    questions,
    answersRef,
    currentIndexRef,
    router,
    draftId: opts.draftId,
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
  })
  useNavigationGuard(answers.size > 0 && !submitted.current)

  const question = questions[nav.currentIndex]
  const questionId = question?.id ?? ''
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
    ...submit,
  }
}
