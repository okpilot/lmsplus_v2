'use client'

import { useId } from 'react'
import { Label } from '@/components/ui/label'
import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'
import { CALC_TOGGLES, FILTERS, FilterToggle, IMAGE_TOGGLES } from './question-filter-toggles'

type QuestionFiltersProps = {
  value: QuestionFilterValue[]
  onValueChange: (filters: QuestionFilterValue[]) => void
  calcMode: CalcMode
  onCalcModeChange: (mode: CalcMode) => void
  imageMode: ImageMode
  onImageModeChange: (mode: ImageMode) => void
  unseenLabel?: string
  /**
   * Show the calculation and image toggle groups. Default `true`; VFR RT opts out
   * because radiotelephony has no calculation or image questions, so the two "Only …"
   * toggles yield an empty pool and the two "Exclude …" ones are no-ops (#1189).
   * Same default-on opt-out shape as TopicTree/TopicRow's `showCode`.
   */
  showCalcImageToggles?: boolean
}

export function QuestionFilters({
  value,
  onValueChange,
  calcMode,
  onCalcModeChange,
  imageMode,
  onImageModeChange,
  unseenLabel,
  showCalcImageToggles = true,
}: Readonly<QuestionFiltersProps>) {
  const labelId = useId()

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

  function handleCalcToggle(mode: Exclude<CalcMode, 'all'>) {
    onCalcModeChange(calcMode === mode ? 'all' : mode)
  }

  function handleImageToggle(mode: Exclude<ImageMode, 'all'>) {
    onImageModeChange(imageMode === mode ? 'all' : mode)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> brings default border/legend layout (choice-pills precedent)
    <div role="group" aria-labelledby={labelId} className="space-y-stack">
      <Label id={labelId}>Question Preferences</Label>
      <div className="space-y-stack-sm">
        {FILTERS.map((opt) => (
          <FilterToggle
            key={opt.value}
            label={opt.value === 'unseen' ? (unseenLabel ?? opt.label) : opt.label}
            hint={opt.hint}
            checked={value.includes(opt.value)}
            onToggle={() => handleToggle(opt.value)}
          />
        ))}
        {showCalcImageToggles &&
          CALC_TOGGLES.map((opt) => (
            <FilterToggle
              key={opt.mode}
              label={opt.label}
              hint={opt.hint}
              checked={calcMode === opt.mode}
              onToggle={() => handleCalcToggle(opt.mode)}
            />
          ))}
        {showCalcImageToggles &&
          IMAGE_TOGGLES.map((opt) => (
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
