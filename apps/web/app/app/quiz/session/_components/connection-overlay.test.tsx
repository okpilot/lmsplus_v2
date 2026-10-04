import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockToastSuccess } = vi.hoisted(() => ({ mockToastSuccess: vi.fn() }))

vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => mockToastSuccess(...a) } }))

import { _resetConnectionState, markSaved, setConnectionStatus } from '../_utils/connection-state'
import { ConnectionOverlay } from './connection-overlay'

const assign = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  _resetConnectionState()
  vi.stubGlobal('location', { pathname: '/app/quiz/session', search: '?id=1', assign })
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
    expect(screen.getByText('Sign in again to continue.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(assign).toHaveBeenCalledWith('/?next=%2Fapp%2Fquiz%2Fsession%3Fid%3D1')
  })

  it('stays open when the student presses Escape', async () => {
    render(<ConnectionOverlay />)
    act(() => setConnectionStatus('offline'))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
