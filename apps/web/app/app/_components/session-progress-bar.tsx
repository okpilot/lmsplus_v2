import { SessionTimer } from './session-timer'

type SessionProgressBarProps = {
  currentIndex: number
  totalQuestions: number
}

export function SessionProgressBar({ currentIndex, totalQuestions }: SessionProgressBarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          data-testid="progress-bar"
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>
      <SessionTimer />
    </div>
  )
}
