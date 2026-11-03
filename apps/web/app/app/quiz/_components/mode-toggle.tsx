'use client'

import { useId } from 'react'
import { Button } from '@/components/ui/button'
import type { QuizMode } from '../types'

const MODES: { value: QuizMode; label: string }[] = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'study', label: 'Study' },
  { value: 'exam', label: 'Practice Exam' },
]

function isAvailable(mode: QuizMode, examAvailable: boolean, discoveryAvailable: boolean) {
  if (mode === 'exam') return examAvailable
  if (mode === 'discovery') return discoveryAvailable
  return true
}

type ModeToggleProps = {
  value: QuizMode
  onValueChange: (mode: QuizMode) => void
  examAvailable?: boolean
  discoveryAvailable?: boolean
}

export function ModeToggle({
  value,
  onValueChange,
  examAvailable = false,
  discoveryAvailable = true,
}: Readonly<ModeToggleProps>) {
  const labelId = useId()
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> brings default border/legend layout (choice-pills precedent)
    <div role="group" aria-labelledby={labelId} className="space-y-stack-sm">
      <span id={labelId} className="text-label text-muted-foreground">
        Mode
      </span>
      <div className="flex gap-1 rounded-control bg-muted p-1">
        {MODES.map((mode) => (
          <Button
            key={mode.value}
            type="button"
            variant="segment"
            className="flex-1"
            aria-pressed={value === mode.value}
            disabled={!isAvailable(mode.value, examAvailable, discoveryAvailable)}
            onClick={() => onValueChange(mode.value)}
          >
            {mode.label}
          </Button>
        ))}
      </div>
      <p className="max-w-reading text-caption text-muted-foreground">
        {value === 'discovery'
          ? 'Discovery shows the answer and explanation up front — explore the questions, nothing scored.'
          : value === 'exam'
            ? 'Practice Exam mode is timed with no hints or feedback until submission.'
            : 'Study mode shows explanations after each answer.'}
      </p>
    </div>
  )
}
