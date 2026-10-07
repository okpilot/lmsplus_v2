import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import {
  _resetConnectionState,
  getConnectionSnapshot,
  getConnectionStatus,
} from '../_utils/connection-state'
import { _resetRefusedSave, refusedAnswerHold } from '../_utils/refused-save'
import { _resetWithReconnect, withReconnect } from '../_utils/with-reconnect'
import { ConnectionOverlay } from './connection-overlay'

beforeEach(() => {
  vi.resetAllMocks()
  _resetConnectionState()
  _resetRefusedSave()
  _resetWithReconnect()
})

async function holdAnswer() {
  const hold = refusedAnswerHold()
  vi.useFakeTimers()
  for (const delay of [2000, 4000]) {
    const retried = hold({ kind: 'thrown' })
    await vi.advanceTimersByTimeAsync(delay)
    await retried
  }
  vi.useRealTimers()
  const pending = hold({ kind: 'thrown' })
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
      screen.getByText('Try again, or continue without saving this answer.'),
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

describe('ConnectionOverlay mounted while an earlier page left a refused save open', () => {
  const TRANSIENT = { success: false as const, error: 'boom' }
  const OK = { success: true as const }

  async function holdUntilBlocked() {
    vi.useFakeTimers()
    try {
      const hold = refusedAnswerHold()
      const save = withReconnect(async () => TRANSIENT, hold)
      const later = vi.fn().mockResolvedValue(OK)
      const next = withReconnect(later)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(getConnectionStatus()).toBe('save-failed')
      return { hold, save, later, next }
    } finally {
      vi.useRealTimers()
    }
  }

  it('settles the held save as skipped without showing the not-saved dialog', async () => {
    const { hold, save, next } = await holdUntilBlocked()
    render(<ConnectionOverlay />)
    await expect(save).resolves.toBe(TRANSIENT)
    await next
    expect(hold.skipped).toBe(true)
    expect(screen.queryByText('Your answer was not saved')).not.toBeInTheDocument()
    expect(getConnectionStatus()).toBe('ok')
    expect(getConnectionSnapshot().pending).toBe(0)
  })

  it('runs the saves queued behind the held one', async () => {
    const { later, next } = await holdUntilBlocked()
    expect(later).not.toHaveBeenCalled()
    render(<ConnectionOverlay />)
    await expect(next).resolves.toBe(OK)
    expect(later).toHaveBeenCalledTimes(1)
  })
})
