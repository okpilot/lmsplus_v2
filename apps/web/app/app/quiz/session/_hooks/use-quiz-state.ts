import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import type { AnswerFeedback, DraftAnswer, QuizStateOpts } from '../../types'
import { useAnswerPipeline } from './use-answer-pipeline'
import { useExamAnswerBuffer } from './use-exam-answer-buffer'
import { usePinnedQuestions } from './use-pinned-questions'
import { useQuizNavigation } from './use-quiz-navigation'
import { useQuizSubmit } from './use-quiz-submit'

export type QuizState = ReturnType<typeof useQuizState>

export function useQuizState(opts: QuizStateOpts) {
  const { questions, initialAnswers } = opts
  const isExam = opts.mode === 'exam'
  const router = useRouter()
  const nav = useQuizNavigation({
    totalQuestions: questions.length,
    initialIndex: opts.initialIndex,
  })
  const [studyAnswers, setStudyAnswers] = useState<Map<string, DraftAnswer>>(() =>
    initialAnswers ? new Map(Object.entries(initialAnswers)) : new Map(),
  )
  const { pinnedQuestions, togglePin: togglePinById } = usePinnedQuestions()
  const studyAnswersRef = useRef(studyAnswers)
  studyAnswersRef.current = studyAnswers
  const currentIndexRef = useRef(nav.currentIndex)
  currentIndexRef.current = nav.currentIndex
  const question = questions[nav.currentIndex]
  const questionId = question?.id ?? ''

  // --- Exam mode: buffer answers locally, no per-answer RPC ---
  const examBuffer = useExamAnswerBuffer({
    getQuestionId: () => questionId,
    getAnswerStartTime: () => nav.answerStartTime.current,
  })

  const emptyFeedbackRef = useRef<Map<string, AnswerFeedback>>(new Map())
  const emptyPendingRef = useRef(new Set<string>())

  const examSubmit = useQuizSubmit({
    userId: opts.userId,
    sessionId: opts.sessionId,
    questions: opts.questions,
    answersRef: examBuffer.answersRef,
    feedbackRef: emptyFeedbackRef,
    currentIndexRef,
    pendingQuestionIdRef: emptyPendingRef,
    router,
    draftId: opts.draftId,
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
  })

  // --- Study mode: full answer pipeline with per-answer RPC ---
  const studyPipeline = useAnswerPipeline({
    ...opts,
    getQuestionId: () => questionId,
    getAnswerStartTime: () => nav.answerStartTime.current,
    getCurrentIndex: () => nav.currentIndex,
    answers: studyAnswers,
    setAnswers: setStudyAnswers,
    answersRef: studyAnswersRef,
    currentIndexRef,
    navigateTo: nav.navigateTo,
    router,
  })

  // --- Merge: pick exam or study values ---
  const answers = isExam ? examBuffer.answers : studyAnswers
  const feedback = isExam ? new Map<string, AnswerFeedback>() : studyPipeline.feedback
  const handleSelectAnswer = isExam ? examBuffer.confirmAnswer : studyPipeline.handleSelectAnswer
  const navigateTo = isExam ? nav.navigateTo : studyPipeline.navigateTo
  const navigate = isExam ? nav.navigate : studyPipeline.navigate
  const submitted = isExam ? examSubmit.submitted : studyPipeline.submitted
  const error = isExam ? examSubmit.error : studyPipeline.error

  const submit = isExam
    ? {
        submitting: examSubmit.submitting,
        handleSubmit: examSubmit.handleSubmit,
        handleSave: examSubmit.handleSave,
        handleDiscard: examSubmit.handleDiscard,
        showFinishDialog: examSubmit.showFinishDialog,
        setShowFinishDialog: examSubmit.setShowFinishDialog,
      }
    : {
        submitting: studyPipeline.submitting,
        handleSubmit: studyPipeline.handleSubmit,
        handleSave: studyPipeline.handleSave,
        handleDiscard: studyPipeline.handleDiscard,
        showFinishDialog: studyPipeline.showFinishDialog,
        setShowFinishDialog: studyPipeline.setShowFinishDialog,
      }

  const initialSize = useRef(initialAnswers ? Object.keys(initialAnswers).length : 0)
  // Skip navigation guard for exam mode (no localStorage checkpoint)
  useNavigationGuard(!isExam && answers.size > initialSize.current && !submitted.current)
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
    isExam,
    ...submit,
  }
}
