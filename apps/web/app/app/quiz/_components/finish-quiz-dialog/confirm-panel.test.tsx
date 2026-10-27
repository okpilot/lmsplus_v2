import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmPanel } from './confirm-panel'

function renderPanel(variant: 'warning' | 'destructive' = 'warning') {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const { container } = render(
    <ConfirmPanel
      message="Discard?"
      confirmLabel="Discard"
      onConfirm={onConfirm}
      onCancel={onCancel}
      submitting={false}
      busy={false}
      variant={variant}
    />,
  )
  return { container, onConfirm, onCancel }
}

describe('ConfirmPanel', () => {
  it('stacks the buttons under the message instead of a trailing side column', () => {
    const { container } = renderPanel()
    expect(container.querySelector('[data-slot=alert-action]')).toBeNull()
    const title = screen.getByText('Discard?')
    const confirm = screen.getByRole('button', { name: 'Discard' })
    expect(title.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(confirm.parentElement?.className).toContain('mt-3')
  })

  it('confirms and cancels through the two buttons', () => {
    const { onConfirm, onCancel } = renderPanel('destructive')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
