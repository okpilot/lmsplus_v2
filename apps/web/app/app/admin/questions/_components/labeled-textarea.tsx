'use client'

import { Textarea } from '@/components/ui/textarea'

type Props = {
  label: string
  value: string
  placeholder: string
  rows: number
  disabled: boolean
  onChange: (value: string) => void
}

export function LabeledTextarea({
  label,
  value,
  placeholder,
  rows,
  disabled,
  onChange,
}: Readonly<Props>) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
      />
    </div>
  )
}
