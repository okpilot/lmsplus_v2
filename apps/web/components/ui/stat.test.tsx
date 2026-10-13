import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Stat, StatGroup } from './stat'

describe('Stat', () => {
  it('shows label before value in the document', () => {
    render(<Stat label="Score" value="82%" />)
    const label = screen.getByText('Score')
    const value = screen.getByText('82%')
    expect(label.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(value.className).toContain('text-stat')
    expect(value.className).toContain('tabular-nums')
    expect(value.className).toContain('text-foreground')
  })

  it.each(['success', 'danger', 'caution', 'info'] as const)('colours the value for %s', (tone) => {
    render(<Stat label="L" value="1" tone={tone} />)
    expect(screen.getByText('1').className).toContain(`text-${tone}`)
  })

  it('renders trend and hint when given', () => {
    render(<Stat label="L" value="1" trend={<span>+3</span>} hint="vs last week" />)
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.getByText('vs last week').className).toContain('text-caption')
  })

  it('omits the hint when not given', () => {
    const { container } = render(<Stat label="L" value="1" />)
    expect(container.querySelector('.text-caption')).toBeNull()
  })

  it('merges a custom className on the card', () => {
    render(<Stat label="L" value="1" className="custom" />)
    expect(document.querySelector('[data-slot="card"]')?.className).toContain('custom')
  })
})

describe('StatGroup', () => {
  it('lays children out in a two-column grid by default', () => {
    render(<StatGroup data-testid="g">x</StatGroup>)
    const cls = screen.getByTestId('g').className
    expect(cls).toContain('gap-grid')
    expect(cls).toContain('sm:grid-cols-2')
    expect(cls).not.toContain('lg:grid-cols')
  })

  it.each([
    [3, 'lg:grid-cols-3'],
    [4, 'lg:grid-cols-4'],
  ] as const)('adds the large-screen column class for %i columns', (columns, cls) => {
    render(
      <StatGroup columns={columns} data-testid="g">
        x
      </StatGroup>,
    )
    expect(screen.getByTestId('g').className).toContain(cls)
  })
})

describe('Stat variants', () => {
  it('renders on a card by default', () => {
    const { container } = render(<Stat label="Sessions" value={3} />)
    expect(container.querySelector('[data-slot="card"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="stat"]')).not.toBeNull()
  })

  it('renders without a card when plain, for use inside another surface', () => {
    const { container } = render(<Stat variant="plain" label="Sessions" value={3} />)
    expect(container.querySelector('[data-slot="card"]')).toBeNull()
    expect(screen.getByText('Sessions').closest('[data-slot="stat"]')).toHaveTextContent('3')
  })
})
