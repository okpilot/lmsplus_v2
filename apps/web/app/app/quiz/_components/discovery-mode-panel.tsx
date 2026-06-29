'use client'

// Discovery mode: the ModeToggle is rendered inside StudyConfigForm's Card 1
// (via the `header` slot), so the toggle + subject share one bordered card —
// matching the Study/Exam layout so switching modes doesn't reflow the form.
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import type { QuizMode } from '../types'
import { ModeToggle } from './mode-toggle'
import { StudyConfigForm } from './study-config-form'

type DiscoveryModePanelProps = {
  mode: QuizMode
  onModeChange: (m: QuizMode) => void
  examAvailable: boolean
  subjects: SubjectOption[]
  userId: string
}

export function DiscoveryModePanel({
  mode,
  onModeChange,
  examAvailable,
  subjects,
  userId,
}: DiscoveryModePanelProps) {
  return (
    <StudyConfigForm
      userId={userId}
      subjects={subjects}
      unseenLabel="Unseen"
      header={
        <ModeToggle value={mode} onValueChange={onModeChange} examAvailable={examAvailable} />
      }
    />
  )
}
