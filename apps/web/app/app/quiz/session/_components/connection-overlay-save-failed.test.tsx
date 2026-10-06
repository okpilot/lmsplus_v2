import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { _resetConnectionState, getConnectionStatus } from '../_utils/connection-state'
import { _resetRefusedSave, refusedAnswerHold } from '../_utils/refused-save'
import { ConnectionOverlay } from './connection-overlay'

const REFUSED = {
  success: false as const,
  error: 'This answer could not be saved. Please review it and try again.',
}

beforeEach(() => {
  vi.resetAllMocks()
  _resetConnectionState()
  _resetRefusedSave()
})

async function holdAnswer() {
  const pending = refusedAnswerHold()(REFUSED)
  await act(async () => {})
  return { pending }
}

describe('ConnectionOverlay with a refused answer save', () => {
  it('blocks with the not-saved copy and both choices', async () => {
    render(<ConnectionOverlay />)
    await holdAnswer()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Your answer was not saved')).toBeInTheDocument()
    expect(
      screen.getByText('Try again, or continue without it — it will then count as unanswered.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue without it' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reload page' })).not.toBeInTheDocument()
  })

  it('resends the save when the student presses Try again', async () => {
    render(<ConnectionOverlay />)
    const { pending } = await holdAnswer()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await expect(pending).resolves.toBe('retry')
    expect(getConnectionStatus()).toBe('ok')
  })

  it('leaves the answer unsaved when the student presses Continue without it', async () => {
    render(<ConnectionOverlay />)
    const { pending } = await holdAnswer()
    await userEvent.click(screen.getByRole('button', { name: 'Continue without it' }))
    await expect(pending).resolves.toBe('done')
    expect(getConnectionStatus()).toBe('ok')
  })

  it('stays open when the student presses Escape', async () => {
    render(<ConnectionOverlay />)
    await holdAnswer()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByText('Your answer was not saved')).toBeInTheDocument()
  })
})
