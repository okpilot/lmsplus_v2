import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Meter, Progress } from './meter'

function indicatorOf(el: HTMLElement) {
  return el.querySelector('[style*="width"]') as HTMLElement
}

describe('Meter', () => {
  it('exposes a meter named by its label', () => {
    render(<Meter value={40} label="Overall mastery" />)
    expect(screen.getByRole('meter', { name: 'Overall mastery' })).toBeInTheDocument()
  })

  it.each([
    [140, '100'],
    [-5, '0'],
    [42, '42'],
  ])('reports %i as %s to assistive tech', (value, now) => {
    render(<Meter value={value} label="Score" />)
    expect(screen.getByRole('meter', { name: 'Score' })).toHaveAttribute('aria-valuenow', now)
  })

  it('sizes the fill to the value as a percentage width', () => {
    render(<Meter value={65} label="Score" />)
    expect(indicatorOf(screen.getByRole('meter', { name: 'Score' })).style.width).toBe('65%')
  })

  it('fills with the primary colour by default', () => {
    render(<Meter value={65} label="Score" />)
    expect(indicatorOf(screen.getByRole('meter', { name: 'Score' }))).toHaveClass('bg-primary')
  })

  it.each([
    ['primary', 'bg-primary'],
    ['data', 'bg-data'],
    ['goal', 'bg-data-goal'],
  ] as const)('fills a %s meter with %s', (tone, fill) => {
    render(<Meter value={50} tone={tone} label="Score" />)
    expect(indicatorOf(screen.getByRole('meter', { name: 'Score' }))).toHaveClass(fill)
  })

  it('is 6px tall (h-1.5) by default', () => {
    render(<Meter value={50} label="Score" />)
    expect(screen.getByRole('meter', { name: 'Score' })).toHaveClass('h-1.5')
  })

  it('draws the track in the muted colour and applies the caller classes to the root', () => {
    render(<Meter value={50} label="Score" className="mt-2" />)
    const root = screen.getByRole('meter', { name: 'Score' })
    expect(root).toHaveClass('mt-2')
    expect(root.querySelector('.bg-muted')).not.toBeNull()
  })
})

describe('Progress', () => {
  it('exposes a progressbar named by its label', () => {
    render(<Progress value={25} label="Quiz progress" />)
    expect(screen.getByRole('progressbar', { name: 'Quiz progress' })).toBeInTheDocument()
  })

  it('sizes the fill to the value as a percentage width', () => {
    render(<Progress value={25} label="Quiz progress" />)
    expect(
      indicatorOf(screen.getByRole('progressbar', { name: 'Quiz progress' })).style.width,
    ).toBe('25%')
  })

  it('fills with the primary colour', () => {
    render(<Progress value={25} label="Quiz progress" />)
    expect(indicatorOf(screen.getByRole('progressbar', { name: 'Quiz progress' }))).toHaveClass(
      'bg-primary',
    )
  })

  it('is 6px tall (h-1.5) by default', () => {
    render(<Progress value={25} label="Quiz progress" />)
    expect(screen.getByRole('progressbar', { name: 'Quiz progress' })).toHaveClass('h-1.5')
  })

  it('applies the caller size classes to the root', () => {
    render(<Progress value={25} label="Quiz progress" className="h-1 flex-1" />)
    expect(screen.getByRole('progressbar', { name: 'Quiz progress' })).toHaveClass('h-1', 'flex-1')
  })
})
