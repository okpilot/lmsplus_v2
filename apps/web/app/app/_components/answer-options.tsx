'use client'

import { useState } from 'react'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

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
  onSelectionChange?: (id: string | null) => void
  isExam?: boolean
}

function getOptionStyle(opts: {
  showResult: boolean
  isCorrect: boolean
  isWrongSelection: boolean
  isSelected: boolean
  isExamLocked: boolean
}) {
  if (opts.showResult && opts.isCorrect)
    return { card: 'border-green-500 bg-green-500/10', circle: 'bg-green-500 text-white' }
  if (opts.showResult && opts.isWrongSelection)
    return { card: 'border-destructive bg-destructive/10', circle: 'bg-red-500 text-white' }
  // Exam mode: confirmed answer — neutral grey, no correctness signal
  if (opts.isExamLocked)
    return {
      card: 'border-muted-foreground/40 bg-muted/50',
      circle: 'bg-muted-foreground text-background',
    }
  if (opts.isSelected && !opts.showResult)
    return { card: 'border-primary bg-primary/5', circle: 'bg-primary text-primary-foreground' }
  return { card: 'border-border hover:border-primary/40', circle: 'border border-current' }
}

export function AnswerOptions({
  options,
  onSubmit,
  disabled,
  correctOptionId,
  selectedOptionId: lockedSelection,
  onSelectionChange,
  isExam,
}: AnswerOptionsProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const currentSelection = lockedSelection ?? selected
  const showResult = lockedSelection != null && correctOptionId != null

  function handleSelect(id: string) {
    if (showResult || disabled) return
    setSelected(id)
    onSelectionChange?.(id)
  }

  return (
    <div className="space-y-2">
      {options.map((option, index) => {
        const isCorrect = option.id === correctOptionId
        const isWrongSelection = option.id === lockedSelection && option.id !== correctOptionId
        const isSelected = currentSelection === option.id
        const { card, circle } = getOptionStyle({
          showResult,
          isCorrect,
          isWrongSelection,
          isSelected,
          isExamLocked: !!isExam && lockedSelection != null && isSelected,
        })

        return (
          <button
            key={option.id}
            type="button"
            data-testid={`option-${option.id}`}
            data-selected={isSelected && !showResult ? 'true' : undefined}
            disabled={disabled}
            onClick={() => handleSelect(option.id)}
            className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${card} ${disabled && !showResult ? 'opacity-50' : ''}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${circle}`}
            >
              {LETTERS[index] ?? String(index + 1)}
            </span>
            <span>{option.text}</span>
          </button>
        )
      })}

      {!showResult && !(isExam && lockedSelection != null) && (
        <button
          type="button"
          disabled={!currentSelection || disabled}
          onClick={() => currentSelection && onSubmit(currentSelection)}
          className="mt-3 hidden w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 md:block"
        >
          {isExam ? 'Confirm Answer' : 'Submit Answer'}
        </button>
      )}
    </div>
  )
}
