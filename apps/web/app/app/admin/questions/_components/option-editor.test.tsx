import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const SHUFFLED: QuestionOption[] = [
  { id: 'b', text: 'Beta' },
  { id: 'a', text: 'Alpha' },
  { id: 'c', text: 'Gamma' },
  { id: 'd', text: 'Delta' },
]

describe('OptionEditor with options stored out of slot order', () => {
  it('checks the radio of the row that holds the correct option id', () => {
    render(
      <OptionEditor
        options={SHUFFLED}
        correctOptionId="b"
        onChange={vi.fn()}
        onCorrectChange={vi.fn()}
      />,
    )
    const radios = screen.getAllByRole('radio')
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Beta')
    expect(radios[0]).toBeChecked()
    expect(radios[1]).not.toBeChecked()
  })

  it("reports the stored option id of row 2 when that row's radio is selected", async () => {
    const onCorrectChange = vi.fn()
    render(
      <OptionEditor
        options={SHUFFLED}
        correctOptionId=""
        onChange={vi.fn()}
        onCorrectChange={onCorrectChange}
      />,
    )
    await userEvent.click(screen.getAllByRole('radio')[1] as HTMLElement)
    expect(onCorrectChange).toHaveBeenCalledWith('a')
  })
})

const GAPPED: QuestionOption[] = [
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Beta' },
  { id: 'd', text: 'Delta' },
]

describe('OptionEditor with stored options that skip a letter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the stored option on row 3 and gives the empty row the unused id without duplicate keys', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <OptionEditor
        options={GAPPED}
        correctOptionId="d"
        onChange={vi.fn()}
        onCorrectChange={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('textbox')[2]).toHaveValue('Delta')
    expect(screen.getByRole('radio', { name: 'Mark option C as correct' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Mark option D as correct' })).not.toBeChecked()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
    const duplicateKeyCalls = consoleError.mock.calls.filter((args) =>
      args.some((a) => String(a).includes('same key')),
    )
    expect(duplicateKeyCalls).toHaveLength(0)
  })

  it('emits the unused id for the typed row when text is entered after the gap', () => {
    const onChange = vi.fn()
    render(
      <OptionEditor
        options={GAPPED}
        correctOptionId="d"
        onChange={onChange}
        onCorrectChange={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Option D' }), {
      target: { value: 'Gamma' },
    })
    const emitted = onChange.mock.lastCall?.[0] as QuestionOption[]
    expect(emitted).toHaveLength(4)
    expect(emitted[3]).toEqual({ id: 'c', text: 'Gamma' })
  })
})
