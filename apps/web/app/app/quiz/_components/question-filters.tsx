'use client'

import { CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { CalcMode, QuestionFilterValue } from '../types'

type QuestionFiltersProps = {
  value: QuestionFilterValue[]
  onValueChange: (filters: QuestionFilterValue[]) => void
  calcMode: CalcMode
  onCalcModeChange: (mode: CalcMode) => void
}

const CALC_MODE_ITEMS: { value: CalcMode; label: string }[] = [
  { value: 'all', label: 'Include calculation questions' },
  { value: 'only', label: 'Only calculation questions' },
  { value: 'exclude', label: 'Exclude calculation questions' },
]

// Short label shown in the collapsed trigger (the "Calculation questions" heading on
// the left already supplies the noun; the dropdown list carries the full phrases).
const CALC_TRIGGER_LABEL: Record<CalcMode, string> = {
  all: 'Include',
  only: 'Only',
  exclude: 'Exclude',
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

export function QuestionFilters({
  value,
  onValueChange,
  calcMode,
  onCalcModeChange,
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

  return (
    <div className="space-y-3">
      <span className="text-[13px] font-medium">Question Preferences</span>
      <div className="space-y-2.5">
        {FILTERS.map((opt) => {
          const isActive = value.includes(opt.value)
          return (
            <div key={opt.value} className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {opt.label}
                <FilterHint hint={opt.hint} label={opt.label} />
              </span>
              <Switch checked={isActive} onCheckedChange={() => handleToggle(opt.value)} />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Calculation questions</span>
        <Select
          value={calcMode}
          onValueChange={(v) => {
            if (v) onCalcModeChange(v as CalcMode)
          }}
          items={CALC_MODE_ITEMS}
        >
          <SelectTrigger className="w-36" aria-label="Calculation questions">
            {CALC_TRIGGER_LABEL[calcMode]}
          </SelectTrigger>
          <SelectContent>
            {CALC_MODE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value} label={item.label}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
