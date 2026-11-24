'use client'

import { FilterSelect } from '@/app/app/_components/filter-select'

export type SelectOption = { value: string; label: string }

type Props = {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

/** Labelled app Select. The visible label doubles as the trigger name. */
export function OptionSelect({ label, value, options, onChange, disabled }: Readonly<Props>) {
  return (
    <div className="min-w-0 space-y-1">
      <span className="block text-label text-muted-foreground">{label}</span>
      <FilterSelect
        value={value}
        items={options}
        ariaLabel={label}
        placeholder=""
        triggerClassName="w-full min-w-0"
        disabled={disabled}
        onValueChange={(v) => onChange(v ?? '')}
      />
    </div>
  )
}
