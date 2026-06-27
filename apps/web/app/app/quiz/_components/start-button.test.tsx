import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StartButton } from './start-button'

describe('StartButton', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the button label when not loading', () => {
    render(<StartButton disabled={false} loading={false} label="Start Quiz" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Start Quiz' })).toBeInTheDocument()
  })

  it('shows "Starting..." and a spinner while loading', () => {
    render(<StartButton disabled={false} loading={true} label="Start Quiz" onClick={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Starting...' })
    expect(btn).toBeInTheDocument()
    expect(btn.querySelector('svg[aria-hidden="true"].animate-spin')).not.toBeNull()
  })

  it('marks the button as busy while loading', () => {
    render(<StartButton disabled={false} loading={true} label="Start Quiz" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Starting...' })).toHaveAttribute('aria-busy', 'true')
  })

  it('does not set aria-busy when not loading', () => {
    render(<StartButton disabled={false} loading={false} label="Start Quiz" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Start Quiz' })).not.toHaveAttribute('aria-busy')
  })

  it('disables the button when the disabled prop is true', () => {
    render(<StartButton disabled={true} loading={false} label="Start Quiz" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Start Quiz' })).toBeDisabled()
  })

  it('remains disabled while loading even when the disabled prop is false', () => {
    render(<StartButton disabled={false} loading={true} label="Start Quiz" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Starting...' })).toBeDisabled()
  })

  it('enables the button when the disabled prop is false', () => {
    render(<StartButton disabled={false} loading={false} label="Start Quiz" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Start Quiz' })).not.toBeDisabled()
  })

  it('notifies the parent when clicked', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<StartButton disabled={false} loading={false} label="Start Quiz" onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: 'Start Quiz' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not notify the parent when clicked while disabled', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<StartButton disabled={true} loading={false} label="Start Quiz" onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: 'Start Quiz' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
