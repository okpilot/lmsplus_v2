import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { progressColor, SavedSessionProgress } from './saved-session-progress'

describe('SavedSessionProgress', () => {
  it('shows the answered count and rounded percentage', () => {
    render(<SavedSessionProgress answered={1} total={3} />)
    expect(screen.getByText('1 of 3 answered')).toBeInTheDocument()
    expect(screen.getByText('33%')).toBeInTheDocument()
  })

  it('shows 0% without dividing by zero when the total is zero', () => {
    render(<SavedSessionProgress answered={0} total={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('sizes the bar to the percentage answered', () => {
    const { container } = render(<SavedSessionProgress answered={5} total={10} />)
    const bar = container.querySelector('.bg-primary') as HTMLElement | null
    expect(bar).not.toBeNull()
    expect(bar?.style.width).toBe('50%')
  })
})

describe('progressColor', () => {
  it('returns green class when progress is 90 or above', () => {
    expect(progressColor(90)).toBe('text-green-600')
    expect(progressColor(100)).toBe('text-green-600')
  })

  it('returns amber class when progress is below 50', () => {
    expect(progressColor(0)).toBe('text-amber-500')
    expect(progressColor(49)).toBe('text-amber-500')
  })

  it('returns primary class when progress is between 50 and 89', () => {
    expect(progressColor(50)).toBe('text-primary')
    expect(progressColor(89)).toBe('text-primary')
  })
})
