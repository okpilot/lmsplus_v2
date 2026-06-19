'use client'

import { useId } from 'react'
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
  inputId,
}: ShortAnswerRendererProps) {
  // Unique per instance so two renderers on one page don't collide label↔input.
  const generatedId = useId()
  const id = inputId ?? generatedId
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Your answer</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}
