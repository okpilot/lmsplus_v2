'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

type McOption = { id: string; text: string }

type McRendererProps = {
  options: McOption[]
  value: string | null
  onChange: (optionId: string) => void
  disabled?: boolean
  ariaLabelledBy?: string
}

export function McRenderer({
  options,
  value,
  onChange,
  disabled,
  ariaLabelledBy,
}: McRendererProps) {
  const groupName = useId()

  if (options.length === 0) return null

  return (
    <fieldset className="space-y-1.5 border-0 p-0" aria-labelledby={ariaLabelledBy}>
      {options.map((option, i) => {
        const letter = String.fromCodePoint(65 + i)
        const isSelected = option.id === value

        return (
          <label
            key={option.id}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              isSelected
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-input text-muted-foreground hover:border-primary/40',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option.id}
              checked={isSelected}
              disabled={disabled}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />
            <span className="font-medium">{letter}</span>
            <span aria-hidden>—</span>
            <span>{option.text}</span>
          </label>
        )
      })}
    </fieldset>
  )
}
