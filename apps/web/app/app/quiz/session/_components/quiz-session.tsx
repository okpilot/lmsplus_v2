'use client'

import { QuestionTabs } from '../../_components/question-tabs'
import type { QuizSessionProps } from '../../session-types'
import { useFlaggedQuestions } from '../_hooks/use-flagged-questions'
import { useQuizRunnerUI } from '../_hooks/use-quiz-runner-ui'
import { useQuizState } from '../_hooks/use-quiz-state'
import { useQuizTimer } from '../_hooks/use-quiz-timer'
import { useUnblockedQuizKeyboard } from '../_hooks/use-unblocked-quiz-keyboard'
import { QuizFinishDialogHost } from './quiz-finish-dialog-host'
import { QuizMainPanel } from './quiz-main-panel'
import { QuizSessionFooter } from './quiz-session-footer'
import { QuizSessionGrid } from './quiz-session-grid'
import { QuizSessionHeader } from './quiz-session-header'
import { QuizSessionMetaRow } from './quiz-session-meta-row'

export function QuizSession(props: Readonly<QuizSessionProps>) {
  const s = useQuizState(props)
  const isDiscovery = props.mode === 'discovery'
  const ui = useQuizRunnerUI(s, { isDiscovery })
  const { activeTab, setActiveTab, effectiveTab, leave } = ui
  const { flaggedIds, isFlagged, toggleFlag, isToggling } = useFlaggedQuestions(
    props.initialFlaggedIds ?? [],
  )

  const { timerStart, timeExpired, handleTimeExpired } = useQuizTimer(
    props.startedAt,
    s.setShowFinishDialog,
  )

  const { highlightedOptionId } = useUnblockedQuizKeyboard({
    optionIds: s.question?.options.map((o) => o.id) ?? [],
    currentIndex: s.currentIndex,
    isExam: s.isExam,
    // Pause shortcuts while the finish or Discovery leave dialog is open; lightweight popovers (the keyboard legend) stay live — no destructive action, Escape-dismissable.
    enabled: !s.showFinishDialog && !leave.discoveryConfirmOpen,
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
        onExitClick={leave.openExitConfirm}
        initialActiveMs={props.initialActiveMs}
      />
      <div className="px-4 pt-4 pb-32 md:px-8 md:pb-24">
        <div className="mx-auto max-w-3xl space-y-4">
          <QuizSessionGrid
            s={s}
            isDiscovery={isDiscovery}
            totalQuestions={props.questions.length}
            flaggedIds={flaggedIds}
            feedbackMap={ui.feedbackMap}
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
            initialActiveMs={props.initialActiveMs}
          />
          <QuizMainPanel
            s={s}
            activeTab={effectiveTab}
            userId={props.userId}
            onSelectionChange={ui.handleSelectionChange}
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
          ui.canSubmitAnswer || (s.answering && s.question.question_type === 'multiple_choice')
        }
        pendingOptionId={ui.pendingOptionId}
        examMode={props.examMode}
        onToggleFlag={() => toggleFlag(s.questionId)}
      />

      <QuizFinishDialogHost
        s={s}
        isDiscovery={isDiscovery}
        totalQuestions={props.questions.length}
        examMode={props.examMode}
        timeExpired={timeExpired}
        pendingSelection={leave.pendingSelection}
        discoveryConfirmOpen={leave.discoveryConfirmOpen}
        onDiscoveryConfirmChange={leave.setDiscoveryConfirmOpen}
      />
    </div>
  )
}
