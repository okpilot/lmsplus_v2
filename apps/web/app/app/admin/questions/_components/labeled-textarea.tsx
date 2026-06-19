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
    // biome-ignore lint/a11y/noLabelWithoutControl: Textarea renders a native <textarea> nested in the label (implicit association); biome can't trace the custom wrapper
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
      />
    </label>
  )
}
