import { SessionTimer } from '@/app/app/_components/session-timer'
import { ThemeToggle } from '@/app/app/_components/theme-toggle'
import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'
import { type QuizMode as DbQuizMode, MODE_LABELS } from '@/lib/constants/exam-modes'
import { ExamCountdownTimer } from '../../_components/exam-countdown-timer'
import type { QuestionTab } from '../../_components/question-tabs'
import { QuestionTabs } from '../../_components/question-tabs'
import type { SessionMode } from '../../session-types'
import { KeyboardLegend } from './keyboard-legend'

type ModeHeadingProps = {
  isExam: boolean
  examMode?: DbQuizMode
  mode?: SessionMode
  subjectName?: string
}

/** Session mode name (every mode) with the subject beneath. */
export function ModeHeading({ isExam, examMode, mode, subjectName }: Readonly<ModeHeadingProps>) {
  const label = MODE_LABELS[examMode ?? (isExam ? 'mock_exam' : modeKey(mode))]
  return (
    <div className="min-w-0">
      <p className="truncate text-label-strong">{label}</p>
      {subjectName && <p className="truncate text-caption text-muted-foreground">{subjectName}</p>}
    </div>
  )
}

function modeKey(mode?: SessionMode): DbQuizMode {
  return mode === 'discovery' ? 'discovery' : 'quick_quiz'
}

type DesktopTabsProps = {
  activeTab: QuestionTab
  onTabChange: (tab: QuestionTab) => void
}

export function DesktopTabs({ activeTab, onTabChange }: Readonly<DesktopTabsProps>) {
  return (
    <div className="pointer-events-none absolute inset-0 hidden items-center justify-center lg:flex">
      <div className="pointer-events-auto">
        <QuestionTabs activeTab={activeTab} onTabChange={onTabChange} />
      </div>
    </div>
  )
}

type HeaderTimerProps = {
  isExam: boolean
  timeLimitSeconds?: number
  timerStart: number
  onTimeExpired: () => void
}

function HeaderTimer({
  isExam,
  timeLimitSeconds,
  timerStart,
  onTimeExpired,
}: Readonly<HeaderTimerProps>) {
  if (!isExam) return <SessionTimer startedAtMs={timerStart} />
  if (!timeLimitSeconds) return null
  return (
    <ExamCountdownTimer
      timeLimitSeconds={timeLimitSeconds}
      startedAt={timerStart}
      onExpired={onTimeExpired}
      className="text-caption"
    />
  )
}

type HeaderControlsProps = HeaderTimerProps & {
  isDiscovery?: boolean
  examMode?: DbQuizMode
  submitting: boolean
  onFinishClick: () => void
  onExitClick?: () => void
}

export function HeaderControls({
  isDiscovery,
  examMode,
  submitting,
  onFinishClick,
  onExitClick,
  ...timer
}: Readonly<HeaderControlsProps>) {
  const finishLabel = timer.isExam
    ? `Finish ${MODE_LABELS[examMode ?? 'mock_exam']}`
    : 'Finish Test'
  return (
    <div className="z-sticky flex items-center gap-2">
      {/* Keyboard shortcuts need a keyboard → hidden on phones (from sm). */}
      <div className="hidden sm:block">
        <KeyboardLegend isExam={timer.isExam} />
      </div>
      <ThemeToggle />
      <HeaderTimer {...timer} />
      {isDiscovery ? (
        <Button type="button" variant="outline" onClick={onExitClick} className="shrink-0">
          Exit
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={onFinishClick}
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="shrink-0"
        >
          <BusyLabel busy={submitting}>{finishLabel}</BusyLabel>
        </Button>
      )}
    </div>
  )
}
