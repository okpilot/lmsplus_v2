'use client'

// Discovery mode: ModeToggle sits above StudyConfigForm as siblings —
// StudyConfigForm is self-contained (own cards + Start button), so Card 1 is skipped.
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import type { QuizMode } from '../types'
import { ModeToggle } from './mode-toggle'
import { StudyConfigForm } from './study-config-form'

type DiscoveryModePanelProps = {
  mode: QuizMode
  onModeChange: (m: QuizMode) => void
  examAvailable: boolean
  subjects: SubjectOption[]
}

export function DiscoveryModePanel({
  mode,
  onModeChange,
  examAvailable,
  subjects,
}: DiscoveryModePanelProps) {
  return (
    <div className="space-y-4">
      <ModeToggle value={mode} onValueChange={onModeChange} examAvailable={examAvailable} />
      <StudyConfigForm subjects={subjects} unseenLabel="Unseen" />
    </div>
  )
}
