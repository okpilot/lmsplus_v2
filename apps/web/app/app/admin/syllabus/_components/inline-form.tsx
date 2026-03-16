'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type FieldConfig = {
  name: string
  placeholder: string
  width: string
  defaultValue?: string
}

type InlineFormProps = {
  fields: FieldConfig[]
  onSubmit: (data: Record<string, string>) => void
  onCancel?: () => void
  isPending?: boolean
  submitLabel?: string
}

export function InlineForm({
  fields,
  onSubmit,
  onCancel,
  isPending,
  submitLabel = 'Add',
}: InlineFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const field of fields) {
      initial[field.name] = field.defaultValue ?? ''
    }
    return initial
  })
  const firstInputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const allFilled = fields.every((f) => values[f.name]?.trim())
    if (!allFilled) return

    onSubmit(values)

    // Reset form for rapid entry (only when adding, not editing)
    if (!onCancel) {
      const reset: Record<string, string> = {}
      for (const field of fields) {
        reset[field.name] = ''
      }
      setValues(reset)
      firstInputRef.current?.focus()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      {fields.map((field, i) => (
        <Input
          key={field.name}
          ref={i === 0 ? firstInputRef : undefined}
          aria-label={field.placeholder}
          placeholder={field.placeholder}
          value={values[field.name] ?? ''}
          onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
          className={field.width}
          disabled={isPending}
        />
      ))}
      <Button type="submit" size="sm" disabled={isPending}>
        {submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      )}
    </form>
  )
}
