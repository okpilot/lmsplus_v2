import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExamCountdownTimer } from './exam-countdown-timer'

// ---- Helpers --------------------------------------------------------------

/**
 * Advance fake timers by `ms` inside an act() so React state updates flush.
 */
async function advanceTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---- Formatting -----------------------------------------------------------

describe('ExamCountdownTimer — display formatting', () => {
  it('renders MM:SS format when time remaining is under one hour', () => {
    const now = Date.now()
    render(<ExamCountdownTimer timeLimitSeconds={600} startedAt={now} onExpired={vi.fn()} />)
    // 10 minutes remaining: 10:00
    expect(screen.getByText('10:00')).toBeInTheDocument()
  })

  it('renders HH:MM:SS format when time remaining is one hour or more', () => {
    const now = Date.now()
    render(<ExamCountdownTimer timeLimitSeconds={3600} startedAt={now} onExpired={vi.fn()} />)
    // 1 hour remaining: 1:00:00
    expect(screen.getByText('1:00:00')).toBeInTheDocument()
  })

  it('displays 00:00 when time has already expired on mount', () => {
    // startedAt is 1 hour in the past, limit is 10 minutes — already expired
    const startedAt = Date.now() - 3600_000
    render(<ExamCountdownTimer timeLimitSeconds={600} startedAt={startedAt} onExpired={vi.fn()} />)
    expect(screen.getByText('00:00')).toBeInTheDocument()
  })
})

// ---- Countdown behaviour --------------------------------------------------

describe('ExamCountdownTimer — countdown tick', () => {
  it('decrements by one second each tick', async () => {
    const now = Date.now()
    render(<ExamCountdownTimer timeLimitSeconds={120} startedAt={now} onExpired={vi.fn()} />)
    expect(screen.getByText('02:00')).toBeInTheDocument()
    await advanceTimers(1000)
    expect(screen.getByText('01:59')).toBeInTheDocument()
  })

  it('counts down multiple ticks correctly', async () => {
    const now = Date.now()
    render(<ExamCountdownTimer timeLimitSeconds={65} startedAt={now} onExpired={vi.fn()} />)
    await advanceTimers(5000)
    expect(screen.getByText('01:00')).toBeInTheDocument()
  })

  it('does not go below 00:00', async () => {
    const now = Date.now()
    render(<ExamCountdownTimer timeLimitSeconds={2} startedAt={now} onExpired={vi.fn()} />)
    await advanceTimers(10_000)
    expect(screen.getByText('00:00')).toBeInTheDocument()
  })
})

// ---- Expiry callback ------------------------------------------------------

describe('ExamCountdownTimer — expiry callback', () => {
  it('calls onExpired when the timer reaches zero', async () => {
    const onExpired = vi.fn()
    const now = Date.now()
    render(<ExamCountdownTimer timeLimitSeconds={2} startedAt={now} onExpired={onExpired} />)
    await advanceTimers(3000)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('calls onExpired only once even when many ticks pass after expiry', async () => {
    const onExpired = vi.fn()
    const now = Date.now()
    render(<ExamCountdownTimer timeLimitSeconds={1} startedAt={now} onExpired={onExpired} />)
    // Advance well past expiry — expiredRef guard must prevent duplicate calls
    await advanceTimers(10_000)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('does not call onExpired before the time runs out', async () => {
    const onExpired = vi.fn()
    const now = Date.now()
    render(<ExamCountdownTimer timeLimitSeconds={60} startedAt={now} onExpired={onExpired} />)
    await advanceTimers(30_000)
    expect(onExpired).not.toHaveBeenCalled()
  })
})

// ---- Visual state classes -------------------------------------------------

describe('ExamCountdownTimer — visual urgency classes', () => {
  it('applies a neutral class when more than 5 minutes remain', () => {
    const now = Date.now()
    const { container } = render(
      <ExamCountdownTimer timeLimitSeconds={600} startedAt={now} onExpired={vi.fn()} />,
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-muted-foreground')
  })

  it('applies an amber warning class when 5 minutes or fewer remain', async () => {
    const now = Date.now()
    const { container } = render(
      <ExamCountdownTimer timeLimitSeconds={600} startedAt={now} onExpired={vi.fn()} />,
    )
    // Advance to 299 seconds remaining (just under 5 minutes)
    await advanceTimers(301_000)
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-amber-600')
  })

  it('applies a destructive pulsing class when 60 seconds or fewer remain', async () => {
    const now = Date.now()
    const { container } = render(
      <ExamCountdownTimer timeLimitSeconds={600} startedAt={now} onExpired={vi.fn()} />,
    )
    // Advance to 60 seconds remaining exactly
    await advanceTimers(540_000)
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-destructive')
    expect(span?.className).toContain('animate-pulse')
  })
})

// ---- Custom className prop ------------------------------------------------

describe('ExamCountdownTimer — className prop', () => {
  it('appends the provided className to the span', () => {
    const now = Date.now()
    const { container } = render(
      <ExamCountdownTimer
        timeLimitSeconds={600}
        startedAt={now}
        onExpired={vi.fn()}
        className="my-custom-class"
      />,
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('my-custom-class')
  })
})
