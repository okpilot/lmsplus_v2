import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('thinking-orbs', () => ({
  ThinkingOrb: () => <span data-testid="orb" />,
}))

import { PendingButton } from './pending-button'

describe('PendingButton', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
  })

  it('renders its children and stays enabled when idle', () => {
    render(
      <PendingButton pending={false} pendingLabel="Saving…" variant="brand">
        Save
      </PendingButton>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-busy')
  })

  it('shows the pending label with a status while pending', () => {
    render(
      <PendingButton pending pendingLabel="Saving…">
        Save
      </PendingButton>,
    )
    expect(screen.getByRole('status', { name: 'Saving…' })).toBeInTheDocument()
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(screen.queryByText('Save')).toBeNull()
  })

  it('is disabled and busy while pending', () => {
    render(
      <PendingButton pending pendingLabel="Saving…">
        Save
      </PendingButton>,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps full opacity while pending so it does not look faded', () => {
    render(
      <PendingButton pending pendingLabel="Saving…">
        Save
      </PendingButton>,
    )
    expect(screen.getByRole('button')).toHaveClass('disabled:opacity-100')
  })

  it('does not fire onClick while pending', async () => {
    const onClick = vi.fn()
    render(
      <PendingButton pending pendingLabel="Saving…" onClick={onClick}>
        Save
      </PendingButton>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})
