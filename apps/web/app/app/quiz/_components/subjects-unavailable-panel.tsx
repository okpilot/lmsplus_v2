'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import type { QuizMode } from '../types'
import { ModeToggle } from './mode-toggle'
import { SubjectsLoadFailedAlert } from './subjects-load-failed-alert'

type SubjectsUnavailablePanelProps = {
  mode: QuizMode
  onModeChange: (mode: QuizMode) => void
  examAvailable: boolean
}

export function SubjectsUnavailablePanel({
  mode,
  onModeChange,
  examAvailable,
}: Readonly<SubjectsUnavailablePanelProps>) {
  const router = useRouter()
  return (
    <Card>
      <CardContent className="space-y-stack-lg">
        <ModeToggle value={mode} onValueChange={onModeChange} examAvailable={examAvailable} />
        <SubjectsLoadFailedAlert onRetry={() => router.refresh()} />
      </CardContent>
    </Card>
  )
}
