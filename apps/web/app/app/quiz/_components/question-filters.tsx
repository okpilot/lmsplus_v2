'use client'

import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'
import { CALC_TOGGLES, FILTERS, FilterToggle, IMAGE_TOGGLES } from './question-filter-toggles'

type QuestionFiltersProps = {
  value: QuestionFilterValue[]
  onValueChange: (filters: QuestionFilterValue[]) => void
  calcMode: CalcMode
  onCalcModeChange: (mode: CalcMode) => void
  imageMode: ImageMode
  onImageModeChange: (mode: ImageMode) => void
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
