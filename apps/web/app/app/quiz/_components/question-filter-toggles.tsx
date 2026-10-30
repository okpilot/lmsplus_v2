'use client'

import { CircleHelp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        className="inline-flex text-muted-foreground hover:text-foreground"
        // Fold the hint into the label so screen readers announce the explanation directly.
        aria-label={`Info about ${label}. ${hint}`}
      >
        <CircleHelp className="size-icon-sm" />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-auto whitespace-nowrap">
        {hint}
      </PopoverContent>
    </Popover>
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
      <span className="flex items-center gap-1.5 text-body text-muted-foreground">
        {label}
        <FilterHint hint={hint} label={label} />
      </span>
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={label} />
    </div>
  )
}
