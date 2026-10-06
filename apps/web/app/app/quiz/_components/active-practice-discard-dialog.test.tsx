import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivePracticeDiscardDialog } from './active-practice-discard-dialog'

function setup(over: Partial<React.ComponentProps<typeof ActivePracticeDiscardDialog>> = {}) {
  const props = {
    modeLabel: 'Study',
    loading: false,
    error: null,
    onDiscard: vi.fn(),
    onClearError: vi.fn(),
    ...over,
  }
  const view = render(<ActivePracticeDiscardDialog {...props} />)
  return { ...props, view }
}

describe('ActivePracticeDiscardDialog', () => {
  beforeEach(() => vi.resetAllMocks())

  it('asks for confirmation naming the mode before discarding', async () => {
    const p = setup()
    expect(screen.queryByText('Discard Study session?')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByText('Discard Study session?')).toBeInTheDocument()
    expect(p.onDiscard).not.toHaveBeenCalled()
  })

  it('calls onDiscard when the destructive action is confirmed', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    )
    expect(p.onDiscard).toHaveBeenCalledTimes(1)
  })

  it('clears a stale error when the dialog is cancelled', async () => {
    const p = setup({ error: 'boom' })
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(p.onClearError).toHaveBeenCalledTimes(1)
  })

  it('disables the trigger while a discard is in flight', () => {
    setup({ loading: true })
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled()
  })

  it('keeps the dialog open when Escape is pressed while a discard is in flight', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    p.view.rerender(<ActivePracticeDiscardDialog {...p} loading />)
    await userEvent.keyboard('{Escape}')
    expect(screen.getByText('Discard Study session?')).toBeInTheDocument()
    expect(p.onClearError).not.toHaveBeenCalled()
  })
})
