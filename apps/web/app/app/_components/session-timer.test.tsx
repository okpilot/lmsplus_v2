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

  it('counts from the server start time: 52 s ago shows 00:52', () => {
    render(<SessionTimer startedAtMs={Date.now() - 52_000} />)
    expect(screen.getByText('00:52')).toBeInTheDocument()
  })

  it('a fresh mount later with the same start time never shows less (reload)', () => {
    const startedAtMs = Date.now() - 52_000
    const first = render(<SessionTimer startedAtMs={startedAtMs} />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('00:55')).toBeInTheDocument()
    first.unmount()
    vi.advanceTimersByTime(10_000)
    render(<SessionTimer startedAtMs={startedAtMs} />)
    expect(screen.getByText('01:05')).toBeInTheDocument()
  })

  it('shows 00:00 for a start time in the future', () => {
    render(<SessionTimer startedAtMs={Date.now() + 30_000} />)
    expect(screen.getByText('00:00')).toBeInTheDocument()
  })
})
