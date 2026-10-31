'use client'

import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyNote } from '@/components/ui/empty'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

type QuestionCountProps = {
  value: number
  max: number
  onValueChange: (count: number) => void
}

const PRESETS = [10, 25, 50] as const

function NoQuestions() {
  return <EmptyNote variant="inline">No questions available. Select at least one topic.</EmptyNote>
}

function CountPill({
  pressed,
  disabled,
  onClick,
  children,
}: Readonly<{
  pressed: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}>) {
  return (
    <Button
      type="button"
      size="sm"
      variant="toggle"
      className="rounded-pill border-border"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function QuestionCount({ value, max, onValueChange }: Readonly<QuestionCountProps>) {
  const labelId = useId()
  if (max === 0) {
    return (
      <div className="space-y-stack">
        <p className="text-label text-muted-foreground">Number of Questions</p>
        <NoQuestions />
      </div>
    )
  }

  const effectiveMax = max
  const effectiveValue = Math.min(value, effectiveMax)

  return (
    <div className="space-y-stack">
      <div className="flex items-center justify-between">
        <Label id={labelId}>Number of Questions</Label>
        <span className="text-label-strong text-primary-text">{effectiveValue}</span>
      </div>
      <Slider
        aria-labelledby={labelId}
        value={[effectiveValue]}
        onValueChange={(v) => onValueChange(Array.isArray(v) ? (v[0] ?? 1) : v)}
        min={1}
        max={effectiveMax}
      />
      <div className="flex items-center gap-2">
        {PRESETS.map((preset) => (
          <CountPill
            key={preset}
            pressed={effectiveValue === preset && preset < effectiveMax}
            disabled={preset > effectiveMax}
            onClick={() => onValueChange(Math.min(preset, effectiveMax))}
          >
            {preset}
          </CountPill>
        ))}
        <CountPill
          pressed={effectiveValue === effectiveMax}
          onClick={() => onValueChange(effectiveMax)}
        >
          All
        </CountPill>
        <span className="ml-auto text-body text-muted-foreground">of {effectiveMax} selected</span>
      </div>
    </div>
  )
}
