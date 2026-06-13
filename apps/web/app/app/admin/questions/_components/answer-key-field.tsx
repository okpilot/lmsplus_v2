'use client'

import type { QuestionOption } from '../types'
import { OptionEditor } from './option-editor'

type Props = {
  options: QuestionOption[]
  correctOptionId: 'a' | 'b' | 'c' | 'd' | ''
  isPending: boolean
  onOptionsChange: (opts: QuestionOption[]) => void
  onCorrectOptionChange: (id: 'a' | 'b' | 'c' | 'd') => void
}

export function AnswerKeyField({
  options,
  correctOptionId,
  isPending,
  onOptionsChange,
  onCorrectOptionChange,
}: Readonly<Props>) {
  return (
    <OptionEditor
      options={options}
      correctOptionId={correctOptionId}
      onChange={onOptionsChange}
      onCorrectChange={onCorrectOptionChange}
      disabled={isPending}
    />
  )
}
