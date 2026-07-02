'use client'

import { CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'

export const FILTERS: {
  value: Exclude<QuestionFilterValue, 'all'>
  label: string
  hint: string
}[] = [
  {
    value: 'unseen',
    label: 'Previously unseen',
    hint: 'Only questions you have not answered yet.',
  },
  {
    value: 'incorrect',
    label: 'Incorrectly answered',
    hint: 'Questions where your last answer was wrong.',
  },
  {
    value: 'flagged',
    label: 'Flagged questions',
    hint: 'Questions you flagged for review during a quiz.',
  },
]

// Calculation questions are included by default. These two toggles are mutually
// exclusive deviations from that default: 'only' restricts the pool to calculation
// questions, 'exclude' removes them. Neither active → calcMode 'all' (the default).
export const CALC_TOGGLES: { mode: Exclude<CalcMode, 'all'>; label: string; hint: string }[] = [
  {
    mode: 'only',
    label: 'Only calculation questions',
    hint: 'Only questions that require a calculation (mass & balance, navigation, performance).',
  },
  {
    mode: 'exclude',
    label: 'Exclude calculation questions',
    hint: 'Hide questions that require a calculation.',
  },
]

// Image questions are included by default. Mirrors CALC_TOGGLES: 'only' restricts
// the pool to questions that carry an image, 'exclude' removes them. Neither
// active → imageMode 'all'.
export const IMAGE_TOGGLES: { mode: Exclude<ImageMode, 'all'>; label: string; hint: string }[] = [
  {
    mode: 'only',
    label: 'Only questions with an image',
    hint: 'Only questions that include a diagram, chart, or photo.',
  },
  {
    mode: 'exclude',
    label: 'Exclude questions with an image',
    hint: 'Hide questions that include a diagram, chart, or photo.',
  },
]

function FilterHint({ hint, label }: Readonly<{ hint: string; label: string }>) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex text-muted-foreground/60 hover:text-muted-foreground"
        // Fold the hint into the label so screen readers announce the explanation
        // directly — the visual tooltip below is a sighted-only enhancement.
        aria-label={`Info about ${label}. ${hint}`}
      >
        <CircleHelp className="size-3.5" />
      </button>
      {open && (
        <span
          aria-hidden
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md"
        >
          {hint}
        </span>
      )}
    </span>
  )
}

export function FilterToggle({
  label,
  hint,
  checked,
  onToggle,
}: Readonly<{
  label: string
  hint: string
  checked: boolean
  onToggle: () => void
}>) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        <FilterHint hint={hint} label={label} />
      </span>
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={label} />
    </div>
  )
}
