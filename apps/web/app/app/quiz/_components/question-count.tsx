'use client'

import { Button } from '@/components/ui/button'
import { EmptyNote } from '@/components/ui/empty'
import { Slider } from '@/components/ui/slider'

type QuestionCountProps = {
  value: number
  max: number
  onValueChange: (count: number) => void
}

const PRESETS = [10, 25, 50] as const

function NoQuestions() {
  return (
    <EmptyNote variant="inline">No questions available. Select at least one topic above.</EmptyNote>
  )
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
      className="rounded-full border-border"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function QuestionCount({ value, max, onValueChange }: Readonly<QuestionCountProps>) {
  if (max === 0) {
    return (
      <div className="space-y-3">
        <span className="text-label font-medium text-muted-foreground">Number of Questions</span>
        <NoQuestions />
      </div>
    )
  }

  const effectiveMax = max
  const effectiveValue = Math.min(value, effectiveMax)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-label font-medium text-muted-foreground">Number of Questions</span>
        <span className="text-sm font-semibold text-primary-text">{effectiveValue}</span>
      </div>
      <Slider
        value={[effectiveValue]}
        onValueChange={(v) => onValueChange(Array.isArray(v) ? (v[0] ?? 1) : v)}
        min={1}
        max={effectiveMax}
      />
      <div className="flex items-center gap-2">
        {PRESETS.map((preset) => (
          <CountPill
            key={preset}
            pressed={effectiveValue === preset}
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
        <span className="ml-auto text-sm text-muted-foreground">of {effectiveMax} selected</span>
      </div>
    </div>
  )
}
