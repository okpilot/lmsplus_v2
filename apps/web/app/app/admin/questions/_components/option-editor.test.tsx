import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionOption } from '../types'
import { OptionEditor } from './option-editor'

const FOUR_OPTIONS: QuestionOption[] = [
  { id: 'a', text: 'Alpha', correct: true },
  { id: 'b', text: 'Beta', correct: false },
  { id: 'c', text: 'Gamma', correct: false },
  { id: 'd', text: 'Delta', correct: false },
]

describe('OptionEditor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders four text inputs with the correct option text values', () => {
    render(<OptionEditor options={FOUR_OPTIONS} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Alpha')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Beta')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Gamma')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Delta')).toBeInTheDocument()
  })

  it('marks option a as the selected correct answer via radio button', () => {
    render(<OptionEditor options={FOUR_OPTIONS} onChange={vi.fn()} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(4)
    expect(radios[0]).toBeChecked()
    expect(radios[1]).not.toBeChecked()
    expect(radios[2]).not.toBeChecked()
    expect(radios[3]).not.toBeChecked()
  })

  it('calls onChange with updated text when a text input changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<OptionEditor options={FOUR_OPTIONS} onChange={onChange} />)
    // Type a single character into input A — the component fires onChange once per keystroke.
    // The component is controlled (parent owns state), so we verify onChange was called
    // with an updated options array where the first option has the extra character appended.
    const inputA = screen.getByDisplayValue('Alpha')
    await user.type(inputA, 'X')
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as QuestionOption[]
    expect(lastCall[0]?.text).toBe('AlphaX')
  })

  it('calls onChange with only the selected option marked correct when a radio changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<OptionEditor options={FOUR_OPTIONS} onChange={onChange} />)
    const radios = screen.getAllByRole('radio')
    await user.click(radios[1] as HTMLElement)
    expect(onChange).toHaveBeenCalledOnce()
    const updated = onChange.mock.calls[0]?.[0] as QuestionOption[]
    expect(updated[0]?.correct).toBe(false)
    expect(updated[1]?.correct).toBe(true)
    expect(updated[2]?.correct).toBe(false)
    expect(updated[3]?.correct).toBe(false)
  })
})
