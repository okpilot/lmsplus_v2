import { render, screen, within } from '@testing-library/react'
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
    expect(screen.getAllByText('Exam Readiness').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Questions Today').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Study Streak').length).toBeGreaterThanOrEqual(1)
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

  it('displays "1 day" (singular) when bestStreak is exactly 1', () => {
    render(<StatCards {...BASE_PROPS} bestStreak={1} />)
    expect(screen.getByText(/Best: 1 day —/)).toBeInTheDocument()
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

  it('displays "1 day" (singular) when currentStreak is exactly 1', () => {
    render(<StatCards {...BASE_PROPS} currentStreak={1} />)
    expect(screen.getByText('1 day')).toBeInTheDocument()
  })

  it('displays "0 days" (plural) when currentStreak is 0', () => {
    render(<StatCards {...BASE_PROPS} currentStreak={0} />)
    expect(screen.getByText('0 days')).toBeInTheDocument()
  })

  it('renders each metric as a stat tile with the label above the value', () => {
    render(<StatCards {...BASE_PROPS} />)
    for (const value of ['33%', '38 / 50', '12 days']) {
      expect(screen.getByText(value).closest('[data-slot="card"]')).not.toBeNull()
    }
  })

  it('keeps the daily-goal bar and tooltip trigger inside the Questions Today tile', () => {
    render(<StatCards {...BASE_PROPS} />)
    const tile = screen.getByText('38 / 50').closest('[data-slot="card"]') as HTMLElement
    expect(tile.querySelector('[style*="width: 76%"]')).not.toBeNull()
    expect(
      within(tile).getByRole('button', { name: 'What is Questions Today?' }),
    ).toBeInTheDocument()
  })

  it('keeps three tiles in one row at every width with a tighter gap on a phone', () => {
    const { container } = render(<StatCards {...BASE_PROPS} />)
    const grid = container.querySelector('.grid') as HTMLElement
    expect(grid.className).toContain('grid-cols-3')
    expect(grid.className).toContain('gap-2')
    expect(grid.className).toContain('md:gap-4')
    expect(grid.className).not.toMatch(/(sm|md|lg):grid-cols/)
  })

  it('hides every detail line on a phone and shows it from md up', () => {
    const { container } = render(<StatCards {...BASE_PROPS} />)
    const hints = container.querySelectorAll('[data-slot="stat"] > :last-child:not(.tabular-nums)')
    expect(hints).toHaveLength(3)
    for (const h of hints) {
      expect(h.className).toContain('hidden')
      expect(h.className).toContain('md:flex')
    }
  })

  it('shrinks every stat value below the sm breakpoint so three tiles fit a phone', () => {
    const { container } = render(<StatCards {...BASE_PROPS} />)
    const values = container.querySelectorAll('[data-slot="stat"] > span.tabular-nums')
    expect(values).toHaveLength(3)
    for (const v of values) expect(v.className).toContain('sm:text-stat')
  })

  it('tightens the tile padding at phone width so label and help icon stay inside', () => {
    const { container } = render(<StatCards {...BASE_PROPS} />)
    const contents = container.querySelectorAll('[data-slot="card-content"]')
    expect(contents).toHaveLength(3)
    for (const c of contents) expect(c.className).toContain('px-3')
  })

  it.each([
    [50, 9, 'text-success'],
    [10, 3, 'text-caution'],
    [0, 0, 'text-danger'],
  ] as const)(
    'colours %i questions and a %i-day streak with %s',
    (questionsToday, currentStreak, token) => {
      const { container } = render(
        <StatCards {...BASE_PROPS} questionsToday={questionsToday} currentStreak={currentStreak} />,
      )
      expect(container.querySelectorAll(`.${token}`).length).toBeGreaterThanOrEqual(2)
    },
  )

  it('uses theme tokens, never the Tailwind palette, for tile colours', () => {
    const { container } = render(<StatCards {...BASE_PROPS} />)
    expect(container.innerHTML).not.toMatch(/(?:text|bg)-(?:green|amber|red)-500/)
  })

  it.each([
    [50, 'bg-success-solid'],
    [10, 'bg-caution-solid'],
    [0, 'bg-danger-solid'],
  ] as const)('fills the daily goal bar with %i questions using %s', (questionsToday, bar) => {
    const { container } = render(<StatCards {...BASE_PROPS} questionsToday={questionsToday} />)
    expect(container.querySelector(`.${bar}`)).not.toBeNull()
  })
})
