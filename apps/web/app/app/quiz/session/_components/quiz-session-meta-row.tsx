'use client'

import { SessionTimer } from '@/app/app/_components/session-timer'
import { ExamCountdownTimer } from '../../_components/exam-countdown-timer'

type QuizSessionMetaRowProps = {
  isExam: boolean
  currentIndex: number
  totalQuestions: number
  questionNumber: string | null
  timeLimitSeconds?: number
  timerStart: number
  onTimeExpired: () => void
}

export function QuizSessionMetaRow({
  isExam,
  currentIndex,
  totalQuestions,
  questionNumber,
  timeLimitSeconds,
  timerStart,
  onTimeExpired,
}: QuizSessionMetaRowProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="hidden font-medium md:inline">
        Question {currentIndex + 1} of {totalQuestions}
      </span>
      {isExam ? (
        timeLimitSeconds && (
          <ExamCountdownTimer
            timeLimitSeconds={timeLimitSeconds}
            startedAt={timerStart}
            onExpired={onTimeExpired}
            className="hidden text-sm md:inline"
          />
        )
      ) : (
        <span className="hidden md:inline">
          <SessionTimer className="text-sm" />
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        {questionNumber ? `No. ${questionNumber}` : ' '}
      </span>
    </div>
  )
}
