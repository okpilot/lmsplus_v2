import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReplace } = vi.hoisted(() => ({ mockReplace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }))

import { _resetRunnerExit, isRunnerExiting } from '../_utils/runner-exit'
import { _resetSessionTakeover, isTakenOver, markTakenOver } from '../_utils/session-takeover'
import { TakeoverDialog } from './takeover-dialog'

const reload = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  _resetRunnerExit()
  _resetSessionTakeover()
  vi.stubGlobal('location', { ...window.location, reload })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TakeoverDialog', () => {
  it('renders nothing while the session is not taken over', () => {
    render(<TakeoverDialog sessionId="s1" />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('explains the takeover and offers both actions when its session is taken over', () => {
    render(<TakeoverDialog sessionId="s1" />)
    act(() => markTakenOver('s1'))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('This quiz was opened in another tab or device')).toBeInTheDocument()
    expect(
      screen.getByText('Continue here to take it back, or go back to your quizzes.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to quizzes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue here' })).toBeInTheDocument()
  })

  it('stays hidden when another session is taken over', () => {
    render(<TakeoverDialog sessionId="s1" />)
    act(() => markTakenOver('s2'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('Back to quizzes replaces to the picker with the dialog and the flag still up', async () => {
    render(<TakeoverDialog sessionId="s1" />)
    act(() => markTakenOver('s1'))
    await userEvent.click(screen.getByRole('button', { name: 'Back to quizzes' }))
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
    expect(isRunnerExiting()).toBe(false)
    expect(isTakenOver('s1')).toBe(true)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('forgets the takeover flag when it unmounts', () => {
    const { unmount } = render(<TakeoverDialog sessionId="s1" />)
    act(() => markTakenOver('s1'))
    unmount()
    expect(isTakenOver('s1')).toBe(false)
  })

  it('Continue here reloads the page', async () => {
    render(<TakeoverDialog sessionId="s1" />)
    act(() => markTakenOver('s1'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue here' }))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(isRunnerExiting()).toBe(false)
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
