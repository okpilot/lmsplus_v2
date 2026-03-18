'use client'

import { Slider } from '@/components/ui/slider'

type QuestionCountProps = {
  value: number
  max: number
  onValueChange: (count: number) => void
}

const PRESETS = [10, 25, 50] as const

export function QuestionCount({ value, max, onValueChange }: QuestionCountProps) {
  const effectiveMax = Math.max(max, 1)
  const effectiveValue = Math.min(value, effectiveMax)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">Number of Questions</span>
        <span className="text-sm font-semibold text-primary">{effectiveValue}</span>
      </div>
      <Slider
        value={[effectiveValue]}
        onValueChange={(v) => onValueChange(Array.isArray(v) ? (v[0] ?? 1) : v)}
        min={1}
        max={effectiveMax}
      />
      <div className="flex items-center gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={preset > effectiveMax}
            onClick={() => onValueChange(Math.min(preset, effectiveMax))}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              effectiveValue === preset
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40'
            }`}
          >
            {preset}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onValueChange(effectiveMax)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            effectiveValue === effectiveMax
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
          }`}
        >
          All
        </button>
        <span className="ml-auto text-sm text-muted-foreground">of {effectiveMax} selected</span>
      </div>
    </div>
  )
}
