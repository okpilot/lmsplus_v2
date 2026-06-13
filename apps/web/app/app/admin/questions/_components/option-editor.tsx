'use client'

import { Input } from '@/components/ui/input'
import type { QuestionOption } from '../types'

type Props = {
  options: QuestionOption[]
  correctOptionId: 'a' | 'b' | 'c' | 'd' | ''
  onChange: (options: QuestionOption[]) => void
  onCorrectChange: (id: 'a' | 'b' | 'c' | 'd') => void
  disabled?: boolean
}

const OPTION_IDS = ['a', 'b', 'c', 'd'] as const

export function OptionEditor({
  options,
  correctOptionId,
  onChange,
  onCorrectChange,
  disabled,
}: Readonly<Props>) {
  function handleTextChange(idx: number, text: string) {
    const updated = options.map((opt, i) => (i === idx ? { ...opt, text } : opt))
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      <span className="text-xs font-medium text-muted-foreground">Options *</span>
      {OPTION_IDS.map((letter, idx) => (
        <div key={letter} className="flex items-center gap-3">
          <span className="w-6 text-center text-sm font-medium uppercase text-muted-foreground">
            {letter}
          </span>
          <Input
            value={options[idx]?.text ?? ''}
            onChange={(e) => handleTextChange(idx, e.target.value)}
            placeholder={`Option ${letter.toUpperCase()}`}
            disabled={disabled}
            className="flex-1"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="radio"
              name="correct-option"
              aria-label={`Mark option ${letter.toUpperCase()} as correct`}
              checked={correctOptionId === letter}
              onChange={() => onCorrectChange(letter)}
              disabled={disabled}
              className="accent-primary"
            />{' '}
            Correct
          </label>
        </div>
      ))}
    </div>
  )
}
