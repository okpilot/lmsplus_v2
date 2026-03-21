import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScoreRing } from './score-ring'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ScoreRing', () => {
  describe('aria label', () => {
    it('announces the percentage value to screen readers', () => {
      render(<ScoreRing percentage={75} />)
      expect(screen.getByRole('img', { name: 'Score: 75%' })).toBeInTheDocument()
    })

    it('includes the percentage in the visible text inside the ring', () => {
      render(<ScoreRing percentage={42} />)
      // The text element inside the SVG carries the same value
      expect(screen.getByText('42%')).toBeInTheDocument()
    })
  })

  describe('color thresholds', () => {
    it('uses green stroke for scores at or above 70%', () => {
      const { container } = render(<ScoreRing percentage={70} />)
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      expect(progressCircle?.getAttribute('stroke')).toBe('#22C55E')
    })

    it('uses green stroke for scores above 70%', () => {
      const { container } = render(<ScoreRing percentage={95} />)
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      expect(progressCircle?.getAttribute('stroke')).toBe('#22C55E')
    })

    it('uses amber stroke for scores between 50% and 69%', () => {
      const { container } = render(<ScoreRing percentage={50} />)
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      expect(progressCircle?.getAttribute('stroke')).toBe('#F59E0B')
    })

    it('uses amber stroke for scores at 69%', () => {
      const { container } = render(<ScoreRing percentage={69} />)
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      expect(progressCircle?.getAttribute('stroke')).toBe('#F59E0B')
    })

    it('uses red stroke for scores below 50%', () => {
      const { container } = render(<ScoreRing percentage={49} />)
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      expect(progressCircle?.getAttribute('stroke')).toBe('#EF4444')
    })

    it('uses red stroke for 0%', () => {
      const { container } = render(<ScoreRing percentage={0} />)
      const circles = container.querySelectorAll('circle')
      const progressCircle = circles[1]
      expect(progressCircle?.getAttribute('stroke')).toBe('#EF4444')
    })
  })

  describe('size prop', () => {
    it('defaults to 120px when size is not provided', () => {
      const { container } = render(<ScoreRing percentage={80} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('width')).toBe('120')
      expect(svg?.getAttribute('height')).toBe('120')
    })

    it('uses the provided size value', () => {
      const { container } = render(<ScoreRing percentage={80} size={90} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('width')).toBe('90')
      expect(svg?.getAttribute('height')).toBe('90')
    })
  })

  describe('SVG geometry', () => {
    it('renders two circles (track and progress)', () => {
      const { container } = render(<ScoreRing percentage={60} />)
      expect(container.querySelectorAll('circle')).toHaveLength(2)
    })

    it('track circle uses a grey stroke', () => {
      const { container } = render(<ScoreRing percentage={60} />)
      const trackCircle = container.querySelectorAll('circle')[0]
      expect(trackCircle?.getAttribute('stroke')).toBe('#E5E7EB')
    })

    it('progress circle has the correct rotation transform', () => {
      const { container } = render(<ScoreRing percentage={60} size={120} />)
      const progressCircle = container.querySelectorAll('circle')[1]
      expect(progressCircle?.getAttribute('transform')).toBe('rotate(-90 60 60)')
    })
  })

  describe('rounding regression', () => {
    it('69.5% rounds to 70 for display but uses amber color (below 70 threshold)', () => {
      const { container } = render(<ScoreRing percentage={69.5} />)
      expect(screen.getByText('70%')).toBeInTheDocument()
      const progressCircle = container.querySelectorAll('circle')[1]
      expect(progressCircle?.getAttribute('stroke')).toBe('#F59E0B')
    })

    it('49.5% rounds to 50 for display but uses red color (below 50 threshold)', () => {
      const { container } = render(<ScoreRing percentage={49.5} />)
      expect(screen.getByText('50%')).toBeInTheDocument()
      const progressCircle = container.querySelectorAll('circle')[1]
      expect(progressCircle?.getAttribute('stroke')).toBe('#EF4444')
    })
  })
})
