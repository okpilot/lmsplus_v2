'use client'

import type { SessionQuestion } from '@/app/app/_types/session'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import { FinishQuizDialog } from '../../_components/finish-quiz-dialog'
import { QuestionGrid } from '../../_components/question-grid'
import { QuestionTabs } from '../../_components/question-tabs'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { useFlaggedQuestions } from '../_hooks/use-flagged-questions'
import { useQuizActiveTab } from '../_hooks/use-quiz-active-tab'
import { useQuizKeyboard } from '../_hooks/use-quiz-keyboard'
import { useQuizState } from '../_hooks/use-quiz-state'
import { useQuizTimer } from '../_hooks/use-quiz-timer'
import { useQuizUI } from '../_hooks/use-quiz-ui'
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
  mode?: 'study' | 'exam'
  examMode?: DbQuizMode
  timeLimitSeconds?: number
  passMark?: number
  startedAt?: string
}

export function QuizSession(props: QuizSessionProps) {
  const s = useQuizState(props)
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
    // Pause shortcuts while the finish dialog is open so arrows/Enter don't act behind it.
    enabled: !s.showFinishDialog,
    onNavigate: s.navigate,
    onConfirm: s.handleSelectAnswer,
    onTab: setActiveTab,
  })

  if (!s.question) return null

  // Default examMode to mock_exam in exam sessions when caller didn't supply it.
  // (Existing exam sessions in localStorage written before this field landed.)
  const examMode = s.isExam ? (props.examMode ?? 'mock_exam') : undefined

  return (
    <div className="flex flex-1 flex-col">
      <QuizSessionHeader
        isExam={s.isExam}
        examMode={examMode}
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
        showSubmit={canSubmitAnswer}
        pendingOptionId={pendingOptionId}
        onToggleFlag={() => toggleFlag(s.questionId)}
      />

      <FinishQuizDialog
        open={s.showFinishDialog}
        answeredCount={s.answeredCount}
        totalQuestions={props.questions.length}
        submitting={s.submitting}
        error={s.error}
        onSubmit={s.handleSubmit}
        onCancel={() => s.setShowFinishDialog(false)}
        onSave={s.handleSave}
        onDiscard={s.handleDiscard}
        isExam={s.isExam}
        examMode={examMode}
        timeExpired={timeExpired}
      />
    </div>
  )
}
