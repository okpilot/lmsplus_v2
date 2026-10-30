'use client'

import { Input } from '@/components/ui/input'
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
  function handleTextChange(idx: number, text: string) {
    const updated = options.map((opt, i) => (i === idx ? { ...opt, text } : opt))
    onChange(updated)
  }

  // The Base UI RadioGroup is a composite root: it selects a focused text input's whole value and
  // takes its arrow keys. The text inputs therefore sit OUTSIDE the group, in a column whose rows
  // line up with the group's rows (same height and gap).
  return (
    <div className="space-y-3">
      <span className="text-label text-muted-foreground">Options</span>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-3">
          {OPTION_IDS.map((letter, idx) => (
            <div key={letter} className="flex h-(--control-h) items-center gap-3">
              <span className="w-6 text-center text-label uppercase text-muted-foreground">
                {letter}
              </span>
              <Input
                value={options[idx]?.text ?? ''}
                onChange={(e) => handleTextChange(idx, e.target.value)}
                placeholder={`Option ${letter.toUpperCase()}`}
                disabled={disabled}
                className="flex-1"
              />
            </div>
          ))}
        </div>
        <RadioGroup
          value={correctOptionId || null}
          onValueChange={(v) => {
            const id = OPTION_IDS.find((o) => o === v)
            if (id) onCorrectChange(id)
          }}
          disabled={disabled}
          className="flex flex-col gap-3"
        >
          {OPTION_IDS.map((letter) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: the "Correct" text is a pointer target for the radio
            // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard path is the radio itself
            <span
              key={letter}
              onClick={(e) => {
                // Radio clicks bubble here; Base UI already fires onValueChange for them.
                if (disabled || e.target !== e.currentTarget) return
                onCorrectChange(letter)
              }}
              className="flex h-(--control-h) cursor-pointer items-center gap-1.5 text-caption text-muted-foreground"
            >
              <Radio value={letter} aria-label={`Mark option ${letter.toUpperCase()} as correct`} />{' '}
              Correct
            </span>
          ))}
        </RadioGroup>
      </div>
    </div>
  )
}
