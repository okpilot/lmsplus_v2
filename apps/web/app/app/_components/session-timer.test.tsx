import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionTimer } from './session-timer'

describe('SessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders 0:00 initially', () => {
    render(<SessionTimer />)
    expect(screen.getByText('00:00')).toBeInTheDocument()
  })

  it('increments after 1 second', () => {
    render(<SessionTimer />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('00:01')).toBeInTheDocument()
  })

  it('shows minutes after 60 seconds', () => {
    render(<SessionTimer />)
    act(() => {
      vi.advanceTimersByTime(65000)
    })
    expect(screen.getByText('01:05')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<SessionTimer className="text-red-500" />)
    const el = container.firstElementChild
    expect(el?.className).toContain('text-red-500')
  })

  it('starts from the active time already spent', () => {
    render(<SessionTimer initialElapsedMs={125_000} />)
    expect(screen.getByText('02:05')).toBeInTheDocument()
  })

  it('keeps counting on top of the active time already spent', () => {
    render(<SessionTimer initialElapsedMs={59_000} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('01:01')).toBeInTheDocument()
  })
})
