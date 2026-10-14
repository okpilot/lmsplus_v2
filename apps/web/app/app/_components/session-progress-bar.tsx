import { Progress } from '@/components/ui/meter'
import { SessionTimer } from './session-timer'

type SessionProgressBarProps = {
  currentIndex: number
  totalQuestions: number
}

export function SessionProgressBar({
  currentIndex,
  totalQuestions,
}: Readonly<SessionProgressBarProps>) {
  return (
    <div className="flex items-center gap-3">
      <Progress
        value={((currentIndex + 1) / totalQuestions) * 100}
        label="Quiz progress"
        className="h-1.5 flex-1"
      />
      <SessionTimer />
    </div>
  )
}
