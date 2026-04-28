import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import type { DraftAnswer, QuizStateOpts } from '../../types'
import { useAnswerPipeline } from './use-answer-pipeline'
import { useExamPipeline } from './use-exam-state'
import { usePinnedQuestions } from './use-pinned-questions'
import { useQuizNavigation } from './use-quiz-navigation'

export type QuizState = ReturnType<typeof useQuizState>

export function useQuizState(opts: QuizStateOpts) {
  const isExam = opts.mode === 'exam'
  const router = useRouter()
  const nav = useQuizNavigation({
    totalQuestions: opts.questions.length,
    initialIndex: opts.initialIndex,
  })
  const [studyAnswers, setStudyAnswers] = useState<Map<string, DraftAnswer>>(() =>
    opts.initialAnswers ? new Map(Object.entries(opts.initialAnswers)) : new Map(),
  )
  const { pinnedQuestions, togglePin: togglePinById } = usePinnedQuestions()
  const studyAnswersRef = useRef(studyAnswers)
  studyAnswersRef.current = studyAnswers
  const currentIndexRef = useRef(nav.currentIndex)
  currentIndexRef.current = nav.currentIndex
  const question = opts.questions[nav.currentIndex]
  const questionId = question?.id ?? ''

  const getQId = () => questionId
  const getStart = () => nav.answerStartTime.current

  const exam = useExamPipeline({
    quizOpts: opts,
    getQuestionId: getQId,
    getAnswerStartTime: getStart,
    currentIndexRef,
    navigateTo: nav.navigateTo,
    navigate: nav.navigate,
  })
  const study = useAnswerPipeline({
    ...opts,
    getQuestionId: getQId,
    getAnswerStartTime: getStart,
    getCurrentIndex: () => nav.currentIndex,
    answers: studyAnswers,
    setAnswers: setStudyAnswers,
    answersRef: studyAnswersRef,
    currentIndexRef,
    navigateTo: nav.navigateTo,
    router,
  })

  const p = isExam ? exam : study
  const answers = isExam ? exam.answers : studyAnswers
  const initialSize = useRef(opts.initialAnswers ? Object.keys(opts.initialAnswers).length : 0)
  useNavigationGuard(!isExam && answers.size > initialSize.current && !p.submitted.current)

  return {
    currentIndex: nav.currentIndex,
    question,
    questionId,
    answeredCount: answers.size,
    existingAnswer: answers.get(questionId),
    currentFeedback: p.feedback.get(questionId) ?? null,
    questionIds: useMemo(() => opts.questions.map((q) => q.id), [opts.questions]),
    answeredIds: new Set(answers.keys()),
    feedback: p.feedback,
    pinnedQuestions,
    isPinned: pinnedQuestions.has(questionId),
    handleSelectAnswer: p.handleSelectAnswer,
    navigateTo: p.navigateTo,
    navigate: p.navigate,
    togglePin: () => togglePinById(questionId),
    error: p.error,
    isExam,
    submitting: p.submitting,
    handleSubmit: p.handleSubmit,
    handleSave: p.handleSave,
    handleDiscard: p.handleDiscard,
    showFinishDialog: p.showFinishDialog,
    setShowFinishDialog: p.setShowFinishDialog,
  }
}
