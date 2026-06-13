import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QuestionOption } from '../types'
import { AnswerKeyField } from './answer-key-field'

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

const OPTIONS: QuestionOption[] = [
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Beta' },
  { id: 'c', text: 'Gamma' },
  { id: 'd', text: 'Delta' },
]

describe('AnswerKeyField', () => {
  it('marks the supplied correct option as selected', () => {
    render(
      <AnswerKeyField
        options={OPTIONS}
        correctOptionId="c"
        isPending={false}
        onOptionsChange={vi.fn()}
        onCorrectOptionChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Mark option C as correct')).toBeChecked()
    expect(screen.getByLabelText('Mark option A as correct')).not.toBeChecked()
  })

  it('fires onCorrectOptionChange with the chosen option letter', () => {
    const onCorrectOptionChange = vi.fn()
    render(
      <AnswerKeyField
        options={OPTIONS}
        correctOptionId="a"
        isPending={false}
        onOptionsChange={vi.fn()}
        onCorrectOptionChange={onCorrectOptionChange}
      />,
    )

    fireEvent.click(screen.getByLabelText('Mark option D as correct'))
    expect(onCorrectOptionChange).toHaveBeenCalledWith('d')
  })

  it('disables the inputs while pending', () => {
    render(
      <AnswerKeyField
        options={OPTIONS}
        correctOptionId="a"
        isPending={true}
        onOptionsChange={vi.fn()}
        onCorrectOptionChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Mark option B as correct')).toBeDisabled()
  })
})
