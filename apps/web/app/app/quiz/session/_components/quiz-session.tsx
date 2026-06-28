'use client'

import type { SessionQuestion } from '@/app/app/_types/session'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import { QuestionGrid } from '../../_components/question-grid'
import { QuestionTabs } from '../../_components/question-tabs'
import type { SessionMode } from '../../session-types'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { useFlaggedQuestions } from '../_hooks/use-flagged-questions'
import { useQuizActiveTab } from '../_hooks/use-quiz-active-tab'
import { useQuizKeyboard } from '../_hooks/use-quiz-keyboard'
import { useQuizState } from '../_hooks/use-quiz-state'
import { useQuizTimer } from '../_hooks/use-quiz-timer'
import { useQuizUI } from '../_hooks/use-quiz-ui'
import { QuizFinishDialogHost } from './quiz-finish-dialog-host'
import { QuizMainPanel } from './quiz-main-panel'
import { QuizSessionFooter } from './quiz-session-footer'
import { QuizSessionHeader } from './quiz-session-header'
import { QuizSessionMetaRow } from './quiz-session-meta-row'

type QuizSessionProps = {
  userId: string
  sessionId: string
  questions: SessionQuestion[]
  initialAnswers?: Record<string, DraftAnswer>
  initialFeedback?: Map<string, AnswerFeedback>
  initialIndex?: number
  draftId?: string
  subjectName?: string
  subjectCode?: string
  mode?: SessionMode
  examMode?: DbQuizMode
  timeLimitSeconds?: number
  passMark?: number
  startedAt?: string
}

export function QuizSession(props: QuizSessionProps) {
  const s = useQuizState(props)
  const isDiscovery = props.mode === 'discovery'
  const { activeTab, setActiveTab } = useQuizActiveTab(s.currentIndex)
  const { flaggedIds, isFlagged, toggleFlag, isToggling } = useFlaggedQuestions(s.questionIds)
  const effectiveTab = s.isExam ? 'question' : activeTab
  const { feedbackMap, pendingOptionId, handleSelectionChange, canSubmitAnswer } = useQuizUI({
    feedback: s.feedback,
    currentIndex: s.currentIndex,
    activeTab: effectiveTab,
    existingAnswer: s.existingAnswer,
  })

  const { timerStart, timeExpired, handleTimeExpired } = useQuizTimer(
    props.startedAt,
    s.setShowFinishDialog,
  )

  const { highlightedOptionId } = useQuizKeyboard({
    optionIds: s.question?.options.map((o) => o.id) ?? [],
    currentIndex: s.currentIndex,
    isExam: s.isExam,
    // Pause shortcuts only while the finish dialog is open; lightweight popovers (the keyboard legend) stay live — no destructive action, Escape-dismissable.
    enabled: !s.showFinishDialog,
    onNavigate: s.navigate,
    onConfirm: s.handleSelectAnswer,
    onTab: setActiveTab,
  })

  if (!s.question) return null

  return (
    <div className="flex flex-1 flex-col">
      <QuizSessionHeader
        isExam={s.isExam}
        isDiscovery={isDiscovery}
        examMode={props.examMode}
        currentIndex={s.currentIndex}
        totalQuestions={props.questions.length}
        submitting={s.submitting}
        timeLimitSeconds={props.timeLimitSeconds}
        timerStart={timerStart}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onTimeExpired={handleTimeExpired}
        onFinishClick={() => s.setShowFinishDialog(true)}
      />

      <div className="px-4 pt-4 pb-32 md:px-8 md:pb-24">
        <div className="mx-auto max-w-3xl space-y-4">
          <QuestionGrid
            totalQuestions={props.questions.length}
            currentIndex={s.currentIndex}
            pinnedIds={s.pinnedQuestions}
            flaggedIds={flaggedIds}
            questionIds={s.questionIds}
            feedbackMap={s.isExam ? new Map() : feedbackMap}
            answeredIds={s.isExam ? s.answeredIds : undefined}
            isExamMode={s.isExam}
            onNavigate={s.navigateTo}
          />
          {!s.isExam && (
            <div className="md:hidden">
              <QuestionTabs activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
          )}
          <QuizSessionMetaRow
            isExam={s.isExam}
            currentIndex={s.currentIndex}
            totalQuestions={props.questions.length}
            questionNumber={s.question.question_number ?? null}
            timeLimitSeconds={props.timeLimitSeconds}
            timerStart={timerStart}
            onTimeExpired={handleTimeExpired}
          />
          <QuizMainPanel
            s={s}
            activeTab={effectiveTab}
            userId={props.userId}
            onSelectionChange={handleSelectionChange}
            keyboardHighlightedId={highlightedOptionId}
          />
        </div>
      </div>

      <QuizSessionFooter
        s={s}
        totalQuestions={props.questions.length}
        isFlagged={isFlagged(s.questionId)}
        flagLoading={isToggling(s.questionId)}
        // Stay mounted through the in-flight per-question RPC, else the button
        // unmounts before the spinner paints (#886). No-op in exam mode (answering=false).
        // MC-only: non-MC inputs own their own full-width submit, so the footer
        // button must not flash as an inert no-op while a non-MC answer is in flight.
        showSubmit={
          canSubmitAnswer || (s.answering && s.question.question_type === 'multiple_choice')
        }
        pendingOptionId={pendingOptionId}
        onToggleFlag={() => toggleFlag(s.questionId)}
      />

      <QuizFinishDialogHost
        s={s}
        isDiscovery={isDiscovery}
        totalQuestions={props.questions.length}
        examMode={props.examMode}
        timeExpired={timeExpired}
      />
    </div>
  )
}
