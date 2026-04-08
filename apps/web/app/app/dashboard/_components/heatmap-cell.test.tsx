import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeatmapCell } from './heatmap-cell'

const BASE_PROPS = {
  day: 1,
  total: 0,
  correct: 0,
  incorrect: 0,
  isFuture: false,
  isToday: false,
}

describe('HeatmapCell', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('data-testid', () => {
    it('includes data-testid with the day number', () => {
      render(<HeatmapCell {...BASE_PROPS} day={7} />)
      expect(screen.getByTestId('heatmap-cell-7')).toBeInTheDocument()
    })
  })

  describe('active cell (has activity)', () => {
    const activeProps = { ...BASE_PROPS, total: 20, correct: 15, incorrect: 5 }

    it('displays the total question count', () => {
      render(<HeatmapCell {...activeProps} />)
      expect(screen.getByText('20')).toBeInTheDocument()
    })

    it('displays the correct answer count', () => {
      render(<HeatmapCell {...activeProps} />)
      expect(screen.getByText('15')).toBeInTheDocument()
    })

    it('displays the incorrect answer count', () => {
      render(<HeatmapCell {...activeProps} />)
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('uses the activity background class', () => {
      render(<HeatmapCell {...activeProps} />)
      const cell = screen.getByTestId(`heatmap-cell-${activeProps.day}`)
      const inner = cell.firstElementChild
      expect(inner?.className).toMatch(/bg-slate-200/)
    })
  })

  describe('empty past cell (no activity, not future)', () => {
    it('shows a dash character', () => {
      render(<HeatmapCell {...BASE_PROPS} total={0} isFuture={false} />)
      expect(screen.getByText('—')).toBeInTheDocument()
    })

    it('uses the muted background class', () => {
      render(<HeatmapCell {...BASE_PROPS} total={0} isFuture={false} />)
      const cell = screen.getByTestId(`heatmap-cell-${BASE_PROPS.day}`)
      const inner = cell.firstElementChild
      expect(inner?.className).toMatch(/bg-muted/)
    })
  })

  describe('future cell', () => {
    const futureProps = { ...BASE_PROPS, isFuture: true }

    it('renders no activity counts or dash', () => {
      const { container } = render(<HeatmapCell {...futureProps} />)
      expect(container.querySelectorAll('span').length).toBe(1) // only the day label
    })

    it('uses the muted/30 background class', () => {
      render(<HeatmapCell {...futureProps} />)
      const cell = screen.getByTestId(`heatmap-cell-${futureProps.day}`)
      const inner = cell.firstElementChild
      expect(inner?.className).toMatch(/bg-muted\/30/)
    })

    it('renders the day number with dimmed text style', () => {
      render(<HeatmapCell {...futureProps} day={22} />)
      const dayLabel = screen.getByText('22')
      expect(dayLabel.className).toMatch(/text-muted-foreground\/30/)
    })
  })

  describe('today cell', () => {
    const todayProps = { ...BASE_PROPS, isToday: true }

    it('applies ring styling to the inner box', () => {
      render(<HeatmapCell {...todayProps} />)
      const cell = screen.getByTestId(`heatmap-cell-${todayProps.day}`)
      const inner = cell.firstElementChild
      expect(inner?.className).toMatch(/ring-2/)
      expect(inner?.className).toMatch(/ring-primary/)
    })

    it('renders the day number with semibold foreground style', () => {
      render(<HeatmapCell {...todayProps} day={8} />)
      const dayLabel = screen.getByText('8')
      expect(dayLabel.className).toMatch(/font-semibold/)
      expect(dayLabel.className).toMatch(/text-foreground/)
    })
  })
})
