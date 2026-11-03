'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
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
  const labelId = useId()
  function handleTextChange(idx: number, text: string) {
    const updated = options.map((opt, i) => (i === idx ? { ...opt, text } : opt))
    onChange(updated)
  }

  // The Base UI RadioGroup is a composite root: it selects a focused text input's whole value and
  // takes its arrow keys. The text inputs therefore sit OUTSIDE the group, in a column whose rows
  // line up with the group's rows (same height and gap).
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> brings default border/legend layout (choice-pills precedent)
    <div role="group" aria-labelledby={labelId} className="space-y-stack">
      <span id={labelId} className="text-label text-muted-foreground">
        Options
      </span>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-stack-lg">
          {OPTION_IDS.map((letter, idx) => (
            <div key={letter} className="flex h-(--control-h) items-center gap-3">
              <span className="w-6 text-center text-label uppercase text-muted-foreground">
                {letter}
              </span>
              <Input
                value={options[idx]?.text ?? ''}
                onChange={(e) => handleTextChange(idx, e.target.value)}
                placeholder={`Option ${letter.toUpperCase()}`}
                aria-label={`Option ${letter.toUpperCase()}`}
                disabled={disabled}
                className="flex-1"
              />
            </div>
          ))}
        </div>
        <RadioGroup
          aria-label="Correct option"
          value={correctOptionId || null}
          onValueChange={(v) => {
            const id = OPTION_IDS.find((o) => o === v)
            if (id) onCorrectChange(id)
          }}
          disabled={disabled}
          className="flex flex-col gap-stack-lg"
        >
          {OPTION_IDS.map((letter) => (
            <Label key={letter} className="h-(--control-h) cursor-pointer gap-1.5 text-caption">
              <span id={`${labelId}-mark-${letter}`} hidden>
                {`Mark option ${letter.toUpperCase()} as correct`}
              </span>
              <Radio value={letter} aria-labelledby={`${labelId}-mark-${letter}`} />
              Correct
            </Label>
          ))}
        </RadioGroup>
      </div>
    </div>
  )
}
