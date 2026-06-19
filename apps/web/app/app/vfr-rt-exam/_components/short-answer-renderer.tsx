'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ShortAnswerRendererProps = {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  inputId?: string
}

export function ShortAnswerRenderer({
  value,
  onChange,
  disabled,
  inputId = 'short-answer',
}: ShortAnswerRendererProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Your answer</Label>
      <Input
        id={inputId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}
