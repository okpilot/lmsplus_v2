import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DialogBlank } from './dialog-blank'

function renderBlank(overrides: Partial<Parameters<typeof DialogBlank>[0]> = {}) {
  const props = {
    index: 0,
    value: '',
    onChange: vi.fn(),
    disabled: false,
    result: undefined,
    ...overrides,
  }
  render(<DialogBlank {...props} />)
  return props
}

describe('DialogBlank', () => {
  it('labels the box with its one-based position for screen readers', () => {
    renderBlank({ index: 2 })
    expect(screen.getByLabelText('Blank 3')).toBeInTheDocument()
  })

  it('reports each keystroke against the blank it belongs to', async () => {
    const { onChange } = renderBlank({ index: 1 })
    await userEvent.type(screen.getByTestId('blank-1'), 'r')
    expect(onChange).toHaveBeenCalledWith(1, 'r')
  })

  it('stops accepting input once the answer is locked', () => {
    renderBlank({ disabled: true })
    expect(screen.getByTestId('blank-0')).toBeDisabled()
  })

  it('sizes the box from what the student typed, never from the answer', () => {
    renderBlank({ value: 'cleared to land immediately', result: undefined })
    // 27 characters typed + 2 padding; the empty-box floor is the constant 15ch.
    expect(screen.getByTestId('blank-0')).toHaveStyle({ '--blank-w': '29ch' })
  })

  it('keeps an empty box at the uniform floor width so no answer length leaks', () => {
    renderBlank({ value: '' })
    expect(screen.getByTestId('blank-0')).toHaveStyle({ '--blank-w': '15ch' })
  })

  it('reveals the canonical answer only when the blank was graded wrong', () => {
    renderBlank({ result: { isCorrect: false, canonical: 'cleared to land' } })
    expect(screen.getByTestId('blank-canonical-0')).toHaveTextContent('cleared to land')
  })

  it('keeps a long revealed answer inside the transcript instead of overflowing it', () => {
    renderBlank({ result: { isCorrect: false, canonical: 'a'.repeat(120) } })
    expect(screen.getByTestId('blank-canonical-0')).toHaveClass('break-words')
  })

  it('hands the typed element back with the index so a repeated index stays distinguishable', () => {
    const onEnter = vi.fn()
    renderBlank({ onEnter })
    fireEvent.keyDown(screen.getByTestId('blank-0'), { key: 'Enter' })
    expect(onEnter).toHaveBeenCalledWith(0, screen.getByTestId('blank-0'))
  })

  it('ignores Enter while an IME composition is still in progress', () => {
    const onEnter = vi.fn()
    renderBlank({ onEnter })
    // fireEvent returns false when the default was prevented — cancelling the keypress that
    // commits an IME candidate is what loses the student's text.
    const notCancelled = fireEvent.keyDown(screen.getByTestId('blank-0'), {
      key: 'Enter',
      isComposing: true,
    })
    expect(onEnter).not.toHaveBeenCalled()
    expect(notCancelled).toBe(true)
  })

  it('does not invoke the Enter action during a legacy IME composition', () => {
    const onEnter = vi.fn()
    renderBlank({ onEnter })
    fireEvent.keyDown(screen.getByTestId('blank-0'), { key: 'Enter', keyCode: 229 })
    expect(onEnter).not.toHaveBeenCalled()
  })
})
