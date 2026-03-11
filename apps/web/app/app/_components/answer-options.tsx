'use client'

import { useState } from 'react'

type Option = {
  id: string
  text: string
}

type AnswerOptionsProps = {
  options: Option[]
  onSubmit: (selectedId: string) => void
  disabled: boolean
  correctOptionId?: string | null
  selectedOptionId?: string | null
}

export function AnswerOptions({
  options,
  onSubmit,
  disabled,
  correctOptionId,
  selectedOptionId: lockedSelection,
}: AnswerOptionsProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const currentSelection = lockedSelection ?? selected
  const showResult = lockedSelection != null

  return (
    <div className="space-y-2">
      {options.map((option) => {
        let style = 'border-border hover:border-primary/40'
        if (showResult && option.id === correctOptionId) {
          style = 'border-green-500 bg-green-500/10'
        } else if (showResult && option.id === lockedSelection && option.id !== correctOptionId) {
          style = 'border-destructive bg-destructive/10'
        } else if (currentSelection === option.id && !showResult) {
          style = 'border-primary bg-primary/5'
        }

        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => !showResult && setSelected(option.id)}
            className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${style} ${disabled && !showResult ? 'opacity-50' : ''}`}
          >
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-medium uppercase">
              {option.id}
            </span>
            <span>{option.text}</span>
          </button>
        )
      })}

      {!showResult && (
        <button
          type="button"
          disabled={!currentSelection || disabled}
          onClick={() => currentSelection && onSubmit(currentSelection)}
          className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Submit Answer
        </button>
      )}
    </div>
  )
}
