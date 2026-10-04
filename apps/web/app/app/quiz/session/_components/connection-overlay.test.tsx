import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockToastSuccess } = vi.hoisted(() => ({ mockToastSuccess: vi.fn() }))

vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => mockToastSuccess(...a) } }))

import {
  _resetConnectionState,
  adjustPending,
  getConnectionStatus,
  markSaved,
  setConnectionStatus,
} from '../_utils/connection-state'
import { ConnectionOverlay, STALL_ESCAPE_MS } from './connection-overlay'

const assign = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  _resetConnectionState()
  vi.stubGlobal('location', { pathname: '/app/quiz/session', search: '?id=1', assign })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ConnectionOverlay', () => {
  it('renders nothing while the connection is fine', () => {
    render(<ConnectionOverlay />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('blocks with the reconnecting message while offline', () => {
    render(<ConnectionOverlay />)
    act(() => setConnectionStatus('offline'))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Connection lost — reconnecting…')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Keep this page open. Your answer will be sent when the connection returns.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('shows a Saved toast and unblocks after the connection returns', () => {
    render(<ConnectionOverlay />)
    act(() => setConnectionStatus('offline'))
    act(() => markSaved())
    expect(mockToastSuccess).toHaveBeenCalledWith('Saved ✓')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('offers a Sign in button that returns to the current page after sign-in', async () => {
    render(<ConnectionOverlay />)
    act(() => setConnectionStatus('signed-out'))
    expect(
      screen.getByText(
        'Sign in again to continue. Answers not yet saved will need to be entered again.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(assign).toHaveBeenCalledWith('/?next=%2Fapp%2Fquiz%2Fsession%3Fid%3D1')
  })

  it('stays open when the student presses Escape', async () => {
    render(<ConnectionOverlay />)
    act(() => setConnectionStatus('offline'))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('clears a stale signed-out status when a new session page mounts', async () => {
    setConnectionStatus('signed-out')
    render(<ConnectionOverlay />)
    expect(getConnectionStatus()).toBe('ok')
    await waitFor(() => {
      const dialog = screen.queryByRole('alertdialog')
      expect(dialog === null || dialog.hasAttribute('data-closed')).toBe(true)
    })
  })

  it('keeps an offline status when a session page mounts while a save is still unsent', () => {
    setConnectionStatus('offline')
    adjustPending(1)
    render(<ConnectionOverlay />)
    expect(getConnectionStatus()).toBe('offline')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('offers a Reload page button only after the connection stays down for a minute', () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    vi.stubGlobal('location', { pathname: '/', search: '', assign, reload })
    render(<ConnectionOverlay />)
    act(() => setConnectionStatus('offline'))
    act(() => vi.advanceTimersByTime(STALL_ESCAPE_MS - 1))
    expect(screen.queryByRole('button', { name: 'Reload page' })).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(
      screen.getByText('Still waiting? Reloading loses answers not yet sent.'),
    ).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'Reload page' }).click())
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('blocks with the still-saving message while a save is slow', () => {
    render(<ConnectionOverlay />)
    act(() => setConnectionStatus('slow'))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Still saving…')).toBeInTheDocument()
    expect(
      screen.getByText('This is taking longer than usual. Keep this page open.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('counts the Reload page minute from the first block when a slow save turns offline', () => {
    vi.useFakeTimers()
    render(<ConnectionOverlay />)
    act(() => setConnectionStatus('slow'))
    act(() => vi.advanceTimersByTime(STALL_ESCAPE_MS - 1))
    act(() => setConnectionStatus('offline'))
    expect(screen.queryByRole('button', { name: 'Reload page' })).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  })

  it('offers a Reload page button after a save stays slow for a minute', () => {
    vi.useFakeTimers()
    render(<ConnectionOverlay />)
    act(() => setConnectionStatus('slow'))
    act(() => vi.advanceTimersByTime(STALL_ESCAPE_MS))
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  })

  it('does not offer Reload page on the signed-out block', () => {
    vi.useFakeTimers()
    render(<ConnectionOverlay />)
    act(() => setConnectionStatus('signed-out'))
    act(() => vi.advanceTimersByTime(STALL_ESCAPE_MS))
    expect(screen.queryByRole('button', { name: 'Reload page' })).not.toBeInTheDocument()
  })
})
