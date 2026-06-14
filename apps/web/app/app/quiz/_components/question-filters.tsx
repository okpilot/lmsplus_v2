'use client'

import { CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'

type QuestionFiltersProps = {
  value: QuestionFilterValue[]
  onValueChange: (filters: QuestionFilterValue[]) => void
  calcMode: CalcMode
  onCalcModeChange: (mode: CalcMode) => void
  imageMode: ImageMode
  onImageModeChange: (mode: ImageMode) => void
}

const FILTERS: { value: Exclude<QuestionFilterValue, 'all'>; label: string; hint: string }[] = [
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
const CALC_TOGGLES: { mode: Exclude<CalcMode, 'all'>; label: string; hint: string }[] = [
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
const IMAGE_TOGGLES: { mode: Exclude<ImageMode, 'all'>; label: string; hint: string }[] = [
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

function FilterHint({ hint, label }: { hint: string; label: string }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex text-muted-foreground/60 hover:text-muted-foreground"
        aria-label={`Info about ${label}`}
      >
        <CircleHelp className="size-3.5" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md">
          {hint}
        </span>
      )}
    </span>
  )
}

function FilterToggle({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string
  hint: string
  checked: boolean
  onToggle: () => void
}) {
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

export function QuestionFilters({
  value,
  onValueChange,
  calcMode,
  onCalcModeChange,
  imageMode,
  onImageModeChange,
}: QuestionFiltersProps) {
  function handleToggle(filter: Exclude<QuestionFilterValue, 'all'>) {
    const withoutAll = value.filter((f) => f !== 'all')
    const isActive = withoutAll.includes(filter)
    let next = isActive ? withoutAll.filter((f) => f !== filter) : [...withoutAll, filter]
    if (!isActive) {
      if (filter === 'unseen') {
        next = next.filter((f) => f !== 'incorrect' && f !== 'flagged')
      } else if (filter === 'incorrect' || filter === 'flagged') {
        next = next.filter((f) => f !== 'unseen')
      }
    }
    onValueChange(next.length === 0 ? ['all'] : next)
  }

  // Toggling the active mode off returns to 'all'; toggling a mode on replaces any
  // other mode (single calcMode value makes the two toggles mutually exclusive).
  function handleCalcToggle(mode: Exclude<CalcMode, 'all'>) {
    onCalcModeChange(calcMode === mode ? 'all' : mode)
  }

  // Mirrors handleCalcToggle: the single imageMode value keeps the two image
  // toggles mutually exclusive.
  function handleImageToggle(mode: Exclude<ImageMode, 'all'>) {
    onImageModeChange(imageMode === mode ? 'all' : mode)
  }

  return (
    <div className="space-y-3">
      <span className="text-[13px] font-medium">Question Preferences</span>
      <div className="space-y-2.5">
        {FILTERS.map((opt) => (
          <FilterToggle
            key={opt.value}
            label={opt.label}
            hint={opt.hint}
            checked={value.includes(opt.value)}
            onToggle={() => handleToggle(opt.value)}
          />
        ))}
        {CALC_TOGGLES.map((opt) => (
          <FilterToggle
            key={opt.mode}
            label={opt.label}
            hint={opt.hint}
            checked={calcMode === opt.mode}
            onToggle={() => handleCalcToggle(opt.mode)}
          />
        ))}
        {IMAGE_TOGGLES.map((opt) => (
          <FilterToggle
            key={opt.mode}
            label={opt.label}
            hint={opt.hint}
            checked={imageMode === opt.mode}
            onToggle={() => handleImageToggle(opt.mode)}
          />
        ))}
      </div>
    </div>
  )
}
