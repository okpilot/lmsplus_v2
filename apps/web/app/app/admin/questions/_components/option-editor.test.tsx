import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionOption } from '../types'
import { OptionEditor } from './option-editor'

const FOUR_OPTIONS: QuestionOption[] = [
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Beta' },
  { id: 'c', text: 'Gamma' },
  { id: 'd', text: 'Delta' },
]

describe('OptionEditor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders four text inputs with the correct option text values', () => {
    render(
      <OptionEditor
        options={FOUR_OPTIONS}
        correctOptionId="a"
        onChange={vi.fn()}
        onCorrectChange={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('Alpha')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Beta')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Gamma')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Delta')).toBeInTheDocument()
  })

  it('checks the radio matching correctOptionId', () => {
    render(
      <OptionEditor
        options={FOUR_OPTIONS}
        correctOptionId="a"
        onChange={vi.fn()}
        onCorrectChange={vi.fn()}
      />,
    )
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(4)
    expect(radios[0]).toBeChecked()
    expect(radios[1]).not.toBeChecked()
    expect(radios[2]).not.toBeChecked()
    expect(radios[3]).not.toBeChecked()
  })

  it('checks no radio when correctOptionId is empty', () => {
    render(
      <OptionEditor
        options={FOUR_OPTIONS}
        correctOptionId=""
        onChange={vi.fn()}
        onCorrectChange={vi.fn()}
      />,
    )
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
  })

  it('calls onChange with updated text when a text input changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <OptionEditor
        options={FOUR_OPTIONS}
        correctOptionId="a"
        onChange={onChange}
        onCorrectChange={vi.fn()}
      />,
    )
    // The component is controlled (parent owns state), so we verify onChange was
    // called with an updated options array where the first option has the extra
    // character appended.
    const inputA = screen.getByDisplayValue('Alpha')
    await user.type(inputA, 'X')
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as QuestionOption[]
    expect(lastCall[0]?.text).toBe('AlphaX')
  })

  it('calls onCorrectChange with the clicked option id when a radio changes', async () => {
    const user = userEvent.setup()
    const onCorrectChange = vi.fn()
    render(
      <OptionEditor
        options={FOUR_OPTIONS}
        correctOptionId="a"
        onChange={vi.fn()}
        onCorrectChange={onCorrectChange}
      />,
    )
    const radios = screen.getAllByRole('radio')
    await user.click(radios[1] as HTMLElement)
    expect(onCorrectChange).toHaveBeenCalledOnce()
    expect(onCorrectChange).toHaveBeenCalledWith('b')
  })
})
