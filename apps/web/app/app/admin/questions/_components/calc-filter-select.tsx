'use client'

import { FilterSelect } from './filter-select'

const ALL = '__all__'

const CALCULATIONS_ITEMS = [
  { value: ALL, label: 'All questions' },
  { value: 'true', label: 'Has calculations' },
  { value: 'false', label: 'No calculations' },
]

type Props = {
  value: string
  onValueChange: (value: string | null) => void
}

export function CalcFilterSelect({ value, onValueChange }: Readonly<Props>) {
  return (
    <FilterSelect
      value={value}
      items={CALCULATIONS_ITEMS}
      ariaLabel="Calculations"
      placeholder="Calculations"
      triggerClassName="w-40"
      onValueChange={onValueChange}
    />
  )
}
