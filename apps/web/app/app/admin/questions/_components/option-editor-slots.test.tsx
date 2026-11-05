import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { QuestionOption } from '../types'
import { OptionEditor } from './option-editor'

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
