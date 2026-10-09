import { SessionTimer } from '@/app/app/_components/session-timer'
import { ThemeToggle } from '@/app/app/_components/theme-toggle'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import { ExamCountdownTimer } from '../../_components/exam-countdown-timer'
import type { QuestionTab } from '../../_components/question-tabs'
import { QuestionTabs } from '../../_components/question-tabs'
import { ExamBadge } from './exam-session-header'
import { KeyboardLegend } from './keyboard-legend'
import { QuizHeaderAction } from './quiz-header-action'

type HeaderStatusProps = {
  isExam: boolean
  examMode?: DbQuizMode
  currentIndex: number
  totalQuestions: number
  timeLimitSeconds?: number
  timerStart: number
  onTimeExpired: () => void
  /** Active time already spent (ms); the untimed clock continues from it. */
  initialActiveMs?: number
}

export function HeaderStatus({
  isExam,
  examMode,
  currentIndex,
  totalQuestions,
  timeLimitSeconds,
  timerStart,
  onTimeExpired,
  initialActiveMs,
}: Readonly<HeaderStatusProps>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium md:hidden">
        Q {currentIndex + 1} / {totalQuestions}
      </span>
      {isExam ? (
        <>
          <ExamBadge mode={examMode} />
          {timeLimitSeconds && (
            <ExamCountdownTimer
              timeLimitSeconds={timeLimitSeconds}
              startedAt={timerStart}
              onExpired={onTimeExpired}
              className="text-sm md:hidden"
            />
          )}
        </>
      ) : (
        <SessionTimer
          className="text-sm text-muted-foreground md:hidden"
          initialElapsedMs={initialActiveMs}
        />
      )}
    </div>
  )
}

type DesktopTabsProps = {
  activeTab: QuestionTab
  onTabChange: (tab: QuestionTab) => void
}

export function DesktopTabs({ activeTab, onTabChange }: Readonly<DesktopTabsProps>) {
  return (
    <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
      <div className="pointer-events-auto">
        <QuestionTabs activeTab={activeTab} onTabChange={onTabChange} />
      </div>
    </div>
  )
}

type HeaderControlsProps = {
  isExam: boolean
  isDiscovery?: boolean
  examMode?: DbQuizMode
  submitting: boolean
  onFinishClick: () => void
  onExitClick?: () => void
}

export function HeaderControls({
  isExam,
  isDiscovery,
  examMode,
  submitting,
  onFinishClick,
  onExitClick,
}: Readonly<HeaderControlsProps>) {
  return (
    <div className="z-10 flex items-center gap-2">
      {/* Keyboard shortcuts are pointer-with-keyboard only → desktop. */}
      <div className="hidden md:block">
        <KeyboardLegend isExam={isExam} />
      </div>
      <ThemeToggle />
      <QuizHeaderAction
        isExam={isExam}
        isDiscovery={isDiscovery}
        examMode={examMode}
        submitting={submitting}
        onFinishClick={onFinishClick}
        onExitClick={onExitClick}
      />
    </div>
  )
}
