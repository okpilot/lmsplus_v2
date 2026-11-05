'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { buildOptionSlots, OPTION_IDS, withOptionText } from '../_hooks/option-slots'
import type { QuestionOption } from '../types'

type Props = {
  options: QuestionOption[]
  correctOptionId: 'a' | 'b' | 'c' | 'd' | ''
  onChange: (options: QuestionOption[]) => void
  onCorrectChange: (id: 'a' | 'b' | 'c' | 'd') => void
  disabled?: boolean
}

export function OptionEditor({
  options,
  correctOptionId,
  onChange,
  onCorrectChange,
  disabled,
}: Readonly<Props>) {
  const labelId = useId()
  const slots = buildOptionSlots(options)

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
          {slots.map(({ letter, id }, idx) => (
            <div key={id} className="flex h-(--control-h) items-center gap-3">
              <span className="w-6 text-center text-label uppercase text-muted-foreground">
                {letter}
              </span>
              <Input
                value={options[idx]?.text ?? ''}
                onChange={(e) => onChange(withOptionText(options, idx, e.target.value))}
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
          {slots.map(({ letter, id }) => (
            <Label key={id} className="h-(--control-h) cursor-pointer gap-1.5 text-caption">
              <span id={`${labelId}-mark-${id}`} hidden>
                {`Mark option ${letter.toUpperCase()} as correct`}
              </span>
              <Radio value={id} aria-labelledby={`${labelId}-mark-${id}`} />
              Correct
            </Label>
          ))}
        </RadioGroup>
      </div>
    </div>
  )
}
