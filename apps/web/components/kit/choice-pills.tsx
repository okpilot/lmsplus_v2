'use client'

import { Button } from '@/components/ui/button'

type Option<T> = { value: T; label: string }

type ChoicePillsProps<T extends string | number> = {
  label: string
  options: readonly Option<T>[]
  value: T | readonly T[]
  onChange: (value: T) => void
}

function isPicked<T extends string | number>(value: T | readonly T[], candidate: T): boolean {
  return Array.isArray(value) ? value.includes(candidate) : value === candidate
}

export function ChoicePills<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: Readonly<ChoicePillsProps<T>>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> brings default border/legend layout; a flex pill row needs a plain group
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const picked = isPicked(value, option.value)
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            className="rounded-full"
            aria-pressed={picked}
            variant={picked ? 'default' : 'outline'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
