import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PartProgress } from './part-progress'

const SEGMENTS = [
  { label: 'Part 1', answered: 2, total: 4 },
  { label: 'Part 2', answered: 0, total: 3 },
  { label: 'Part 3', answered: 5, total: 5 },
]

describe('PartProgress', () => {
  it('renders one segment per entry', () => {
    render(<PartProgress segments={SEGMENTS} />)
    expect(screen.getAllByRole('progressbar')).toHaveLength(3)
  })

  it('shows the answered/total count for each segment', () => {
    render(<PartProgress segments={SEGMENTS} />)
    expect(screen.getByText('2/4')).toBeInTheDocument()
    expect(screen.getByText('0/3')).toBeInTheDocument()
    expect(screen.getByText('5/5')).toBeInTheDocument()
  })

  it('sets the fill width proportional to the answered ratio', () => {
    const { container } = render(
      <PartProgress segments={[{ label: 'P', answered: 1, total: 4 }]} />,
    )
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement
    expect(fill.style.width).toBe('25%')
  })

  it('renders a zero-width fill when nothing is answered', () => {
    const { container } = render(
      <PartProgress segments={[{ label: 'P', answered: 0, total: 3 }]} />,
    )
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })

  it('exposes the answered count via aria-valuenow', () => {
    render(<PartProgress segments={[{ label: 'P', answered: 3, total: 5 }]} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  })
})
