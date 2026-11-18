'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
      <Select
        value={value}
        onValueChange={(v) => onChange(v ?? '')}
        items={options}
        disabled={disabled}
      >
        <SelectTrigger className="w-full min-w-0" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} label={o.label}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
