'use client'

import { Check, X } from 'lucide-react'
import { useState } from 'react'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

type Option = {
  id: string
  text: string
}

type AnswerOptionsProps = {
  options: Option[]
  disabled: boolean
  correctOptionId?: string | null
  selectedOptionId?: string | null
  onSelectionChange?: (id: string | null) => void
  isExam?: boolean
  /**
   * Option currently highlighted via keyboard (↑/↓). Drives a focus ring only —
   * deliberately separate from `selectedOptionId`, which carries lock/result
   * semantics. Submitting the highlight is handled by the keyboard hook.
   */
  keyboardHighlightedId?: string | null
}

const SELECTED_STYLE = {
  card: 'border-primary ring-1 ring-primary text-primary-text',
  circle: 'bg-primary text-primary-foreground',
}

function getOptionStyle(opts: {
  showResult: boolean
  isCorrect: boolean
  isWrongSelection: boolean
  isSelected: boolean
  isExamLocked: boolean
}): { card: string; circle: string; result?: 'correct' | 'wrong' } {
  if (opts.showResult && opts.isCorrect)
    return {
      card: 'border-success',
      circle: 'bg-success-solid text-success-foreground',
      result: 'correct',
    }
  if (opts.showResult && opts.isWrongSelection)
    return {
      card: 'border-danger',
      circle: 'bg-danger-solid text-danger-foreground',
      result: 'wrong',
    }
  // Exam mode: confirmed answer — same look as a selection, no correctness signal
  if (opts.isExamLocked || (opts.isSelected && !opts.showResult)) return SELECTED_STYLE
  return { card: 'border-border hover:border-primary/40', circle: 'border border-current' }
}

function ResultMark({
  result,
  picked,
}: Readonly<{ result?: 'correct' | 'wrong'; picked: boolean }>) {
  if (result === 'correct')
    return (
      <>
        <Check aria-hidden className="ml-auto size-icon shrink-0 text-success" />
        <span className="sr-only">{picked ? 'Your answer, correct' : 'Correct answer'}</span>
      </>
    )
  if (result === 'wrong')
    return (
      <>
        <X aria-hidden className="ml-auto size-icon shrink-0 text-danger" />
        <span className="sr-only">Your answer, incorrect</span>
      </>
    )
  return null
}

export function AnswerOptions({
  options,
  disabled,
  correctOptionId,
  selectedOptionId: lockedSelection,
  onSelectionChange,
  isExam,
  keyboardHighlightedId,
}: Readonly<AnswerOptionsProps>) {
  const [selected, setSelected] = useState<string | null>(null)
  const currentSelection = lockedSelection ?? selected
  const showResult = lockedSelection != null && correctOptionId != null

  function handleSelect(id: string) {
    if (showResult || disabled || (isExam && lockedSelection != null)) return
    setSelected(id)
    onSelectionChange?.(id)
  }

  return (
    <div className="space-y-2">
      {options.map((option, index) => {
        const isCorrect = option.id === correctOptionId
        const isWrongSelection = option.id === lockedSelection && option.id !== correctOptionId
        const isSelected = currentSelection === option.id
        const { card, circle, result } = getOptionStyle({
          showResult,
          isCorrect,
          isWrongSelection,
          isSelected,
          isExamLocked: !!isExam && lockedSelection != null && isSelected,
        })
        // No ring once a result is shown (study) or the exam answer is locked —
        // the option is no longer actionable, so a highlight would mislead.
        const isKeyboardHighlighted =
          !showResult && !(isExam && lockedSelection != null) && option.id === keyboardHighlightedId

        return (
          <button
            key={option.id}
            type="button"
            data-testid={`option-${option.id}`}
            data-selected={isSelected && !showResult ? 'true' : undefined}
            data-result={result}
            data-kb-highlighted={isKeyboardHighlighted ? 'true' : undefined}
            disabled={disabled || (!!isExam && lockedSelection != null)}
            onClick={() => handleSelect(option.id)}
            className={`flex w-full items-center gap-3 rounded-control border px-4 py-3 text-left text-body transition-colors ${card} ${isKeyboardHighlighted ? 'outline-2 outline-offset-2 outline-ring' : ''} ${disabled && !showResult ? 'opacity-50' : ''}`}
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-pill text-caption font-semibold ${circle}`}
            >
              {LETTERS[index] ?? String(index + 1)}
            </span>
            <span>{option.text}</span>
            <ResultMark result={result} picked={option.id === lockedSelection} />
          </button>
        )
      })}
    </div>
  )
}
