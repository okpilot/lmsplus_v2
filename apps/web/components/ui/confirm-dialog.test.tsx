import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './confirm-dialog'

function setup(over: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Delete item?',
    description: 'This cannot be undone.',
    confirmLabel: 'Delete',
    pending: false,
    onConfirm: vi.fn(),
    ...over,
  }
  render(<ConfirmDialog {...props} />)
  return props
}

describe('ConfirmDialog', () => {
  it('is an alertdialog named by the title', () => {
    setup()
    expect(screen.getByRole('alertdialog', { name: 'Delete item?' })).toBeInTheDocument()
  })

  it('Cancel requests close', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(p.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('Confirm calls onConfirm once', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(p.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape while pending', async () => {
    const p = setup({ pending: true })
    await userEvent.keyboard('{Escape}')
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('ignores a backdrop click while pending', async () => {
    const p = setup({ pending: true })
    await userEvent.click(document.body)
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('disables both buttons while pending and keeps the Delete name', () => {
    setup({ pending: true })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('renders the error as an alert inside the popup', () => {
    setup({ error: 'boom' })
    expect(screen.getByRole('alertdialog')).toContainElement(screen.getByRole('alert'))
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })
})
