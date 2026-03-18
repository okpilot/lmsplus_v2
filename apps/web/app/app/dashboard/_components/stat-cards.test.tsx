import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StatCards } from './stat-cards'

const BASE_PROPS = {
  examReadiness: { readyCount: 3, totalCount: 9, projectedDate: 'Aug 2026' },
  questionsToday: 38,
  currentStreak: 12,
  bestStreak: 21,
}

describe('StatCards', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders all three card titles', () => {
    render(<StatCards {...BASE_PROPS} />)
    expect(screen.getByText('Exam Readiness')).toBeInTheDocument()
    expect(screen.getByText('Questions Today')).toBeInTheDocument()
    expect(screen.getByText('Study Streak')).toBeInTheDocument()
  })

  it('displays computed exam readiness percentage', () => {
    render(<StatCards {...BASE_PROPS} />)
    // 3/9 * 100 = 33%
    expect(screen.getByText('33%')).toBeInTheDocument()
  })

  it('shows the subjects-at-threshold count', () => {
    render(<StatCards {...BASE_PROPS} />)
    expect(screen.getByText('3 / 9 subjects at 90%+')).toBeInTheDocument()
  })

  it('shows projected date when projectedDate is provided', () => {
    render(<StatCards {...BASE_PROPS} />)
    expect(screen.getByText('Est. ready by Aug 2026')).toBeInTheDocument()
  })

  it('shows "Keep practicing" when projectedDate is null', () => {
    render(
      <StatCards
        {...BASE_PROPS}
        examReadiness={{ readyCount: 0, totalCount: 9, projectedDate: null }}
      />,
    )
    expect(screen.getByText('Keep practicing')).toBeInTheDocument()
  })

  it('displays questions today progress as N / 50', () => {
    render(<StatCards {...BASE_PROPS} />)
    expect(screen.getByText('38 / 50')).toBeInTheDocument()
  })

  it('shows "Daily goal reached!" when questionsToday >= 50', () => {
    render(<StatCards {...BASE_PROPS} questionsToday={50} />)
    expect(screen.getByText('Daily goal reached!')).toBeInTheDocument()
  })

  it('shows remaining questions to reach daily goal', () => {
    render(<StatCards {...BASE_PROPS} />)
    // 50 - 38 = 12 more
    expect(screen.getByText('12 more to hit your daily goal')).toBeInTheDocument()
  })

  it('displays current streak in days', () => {
    render(<StatCards {...BASE_PROPS} />)
    expect(screen.getByText('12 days')).toBeInTheDocument()
  })

  it('shows best streak in the detail line', () => {
    render(<StatCards {...BASE_PROPS} />)
    expect(screen.getByText(/Best: 21 days/)).toBeInTheDocument()
  })

  it('renders 0% exam readiness when totalCount is 0', () => {
    render(
      <StatCards
        {...BASE_PROPS}
        examReadiness={{ readyCount: 0, totalCount: 0, projectedDate: null }}
      />,
    )
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
