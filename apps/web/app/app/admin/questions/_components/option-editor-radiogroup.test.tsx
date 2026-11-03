import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { OptionEditor } from './option-editor'

const OPTIONS = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id, correct: false }))

function setup(props: Partial<React.ComponentProps<typeof OptionEditor>> = {}) {
  const onCorrectChange = vi.fn()
  render(
    <OptionEditor
      options={OPTIONS as never}
      correctOptionId=""
      onChange={vi.fn()}
      onCorrectChange={onCorrectChange}
      {...props}
    />,
  )
  return { onCorrectChange }
}

describe('OptionEditor radio group (B2b-12 AC 1)', () => {
  it('wraps the four option rows in one radiogroup', () => {
    setup()
    const group = screen.getByRole('radiogroup')
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(4)
  })

  it('names the radiogroup "Correct option"', () => {
    setup()
    expect(screen.getByRole('radiogroup', { name: 'Correct option' })).toBeInTheDocument()
  })

  it('keeps the "Mark option X as correct" accessible name', () => {
    setup()
    expect(screen.getByRole('radio', { name: 'Mark option B as correct' })).toBeInTheDocument()
  })

  it('fires onCorrectChange with the letter when a radio is clicked', async () => {
    const { onCorrectChange } = setup()
    await userEvent.click(screen.getByLabelText('Mark option C as correct'))
    expect(onCorrectChange).toHaveBeenCalledWith('c')
  })

  it('checks the radio matching correctOptionId and none when empty', () => {
    setup({ correctOptionId: 'b' })
    expect(screen.getByRole('radio', { name: 'Mark option B as correct' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Mark option A as correct' })).not.toBeChecked()
  })

  it('disables every radio when disabled', async () => {
    const { onCorrectChange } = setup({ disabled: true })
    await userEvent.click(screen.getByLabelText('Mark option A as correct'))
    expect(onCorrectChange).not.toHaveBeenCalled()
  })
})

describe('OptionEditor "Correct" text target (round 4 #1)', () => {
  it('selects the option when its "Correct" text is clicked', async () => {
    const { onCorrectChange } = setup()
    await userEvent.click(screen.getAllByText('Correct').at(2) as HTMLElement)
    expect(onCorrectChange).toHaveBeenCalledTimes(1)
    expect(onCorrectChange).toHaveBeenCalledWith('c')
  })

  it('ignores a "Correct" text click when disabled', async () => {
    const { onCorrectChange } = setup({ disabled: true })
    await userEvent.click(screen.getAllByText('Correct').at(2) as HTMLElement)
    expect(onCorrectChange).not.toHaveBeenCalled()
  })

  it('fires once when the radio itself is clicked', async () => {
    const { onCorrectChange } = setup()
    await userEvent.click(screen.getByLabelText('Mark option C as correct'))
    expect(onCorrectChange).toHaveBeenCalledTimes(1)
  })
})
