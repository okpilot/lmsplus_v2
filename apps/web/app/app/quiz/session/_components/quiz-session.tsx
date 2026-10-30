'use client'

import type { QuizSessionProps } from '../../session-types'
import { useQuizSession } from '../_hooks/use-quiz-session'
import { QuizFinishDialogHost } from './quiz-finish-dialog-host'
import { QuizSessionBody } from './quiz-session-body'
import { QuizSessionHeader } from './quiz-session-header'

export function QuizSession(props: Readonly<QuizSessionProps>) {
  const session = useQuizSession(props)
  const { s, isDiscovery, ui, timer } = session

  if (!s.question) return null

  return (
    <div className="flex flex-1 flex-col">
      <QuizSessionHeader
        isExam={s.isExam}
        isDiscovery={isDiscovery}
        examMode={props.examMode}
        mode={props.mode}
        subjectName={props.subjectName}
        submitting={s.submitting}
        timeLimitSeconds={props.timeLimitSeconds}
        timerStart={timer.timerStart}
        activeTab={ui.activeTab}
        onTabChange={ui.setActiveTab}
        onTimeExpired={timer.handleTimeExpired}
        onFinishClick={() => s.setShowFinishDialog(true)}
        onExitClick={ui.leave.openExitConfirm}
        initialActiveMs={props.initialActiveMs}
      />
      <QuizSessionBody props={props} session={session} />
      <QuizFinishDialogHost
        s={s}
        isDiscovery={isDiscovery}
        totalQuestions={props.questions.length}
        examMode={props.examMode}
        timeExpired={timer.timeExpired}
        pendingSelection={ui.leave.pendingSelection}
        discoveryConfirmOpen={ui.leave.discoveryConfirmOpen}
        onDiscoveryConfirmChange={ui.leave.setDiscoveryConfirmOpen}
      />
    </div>
  )
}
