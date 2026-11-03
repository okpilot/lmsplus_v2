import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SavedSessionProgress } from './saved-session-progress'

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
    render(<SavedSessionProgress answered={5} total={10} />)
    const bar = screen
      .getByRole('progressbar', { name: 'Answered questions' })
      .querySelector('.bg-primary') as HTMLElement | null
    expect(bar).not.toBeNull()
    expect(bar?.style.width).toBe('50%')
  })
})

describe('SavedSessionProgress percentage text', () => {
  it.each([0, 49, 50, 89, 90, 100])('shows %i in muted text without green or amber', (pct) => {
    render(<SavedSessionProgress answered={pct} total={100} />)
    const el = screen.getByText(`${pct}%`)
    expect(el).toHaveClass('text-muted-foreground')
    expect(el.className).not.toMatch(/text-(green|amber)-/)
  })
})
