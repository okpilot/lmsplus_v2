import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TileLabel } from '@/app/app/dashboard/_components/tile-label'
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

  it('renders the hint when given', () => {
    render(<Stat label="L" value="1" hint="vs last week" />)
    expect(screen.getByText('vs last week').className).toContain('text-caption')
  })

  it('omits the hint when not given', () => {
    const { container } = render(<Stat label="L" value="1" />)
    expect(container.querySelector('.text-caption')).toBeNull()
  })

  it('lets the card variant shrink inside a grid track', () => {
    render(<Stat label="L" value="1" />)
    expect(document.querySelector('[data-slot="card"]')?.className).toContain('min-w-0')
  })

  it('merges a custom className on the card', () => {
    render(<Stat label="L" value="1" className="custom" />)
    expect(document.querySelector('[data-slot="card"]')?.className).toContain('custom')
  })
})

describe('Stat label markup', () => {
  it('wraps the label in a block element so block children stay valid HTML', () => {
    render(<Stat label="Score" value="1" />)
    expect(screen.getByText('Score').tagName).toBe('DIV')
  })

  it('never nests a div or p inside a span when the label is a TileLabel', () => {
    const { container } = render(
      <Stat label={<TileLabel short="S" full="Score" description="Tip" />} value="1" />,
    )
    expect(container.querySelectorAll('span div, span p')).toHaveLength(0)
  })
})

describe('StatGroup', () => {
  it('lays children out in a two-column grid by default', () => {
    render(<StatGroup data-testid="g">x</StatGroup>)
    const cls = screen.getByTestId('g').className
    expect(cls).toContain('gap-cards')
    expect(cls).toContain('grid-cols-2')
    expect(cls).not.toContain('sm:grid-cols-2')
  })

  it.each([
    [1, 'grid-cols-1'],
    [2, 'grid-cols-2'],
    [3, 'grid-cols-3'],
    [4, 'grid-cols-4'],
  ] as const)('sets the column count at every width for %i columns', (columns, cls) => {
    render(
      <StatGroup columns={columns} data-testid="g">
        x
      </StatGroup>,
    )
    const cls_ = screen.getByTestId('g').className
    expect(cls_).toContain(cls)
    expect(cls_).not.toMatch(/(sm|md|lg):grid-cols/)
  })

  it('lets a caller className override the column count at a breakpoint', () => {
    render(
      <StatGroup columns={1} className="md:grid-cols-3" data-testid="g">
        x
      </StatGroup>,
    )
    expect(screen.getByTestId('g').className).toContain('grid-cols-1')
    expect(screen.getByTestId('g').className).toContain('md:grid-cols-3')
  })
})

describe('Stat label row', () => {
  it('renders the label alone, so it inherits the parent text alignment', () => {
    render(<Stat label="Correct" value="7" />)
    const label = screen.getByText('Correct')
    expect(label.parentElement?.getAttribute('data-slot')).toBe('stat')
    expect(document.querySelector('.justify-between')).toBeNull()
  })

  it('applies hintClassName to the hint wrapper', () => {
    render(<Stat label="L" value="1" hint="vs last week" hintClassName="hidden md:flex" />)
    const cls = screen.getByText('vs last week').className
    expect(cls).toContain('hidden')
    expect(cls).toContain('md:flex')
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

describe('Stat size and overflow', () => {
  it('lets overlays escape the card instead of clipping them', () => {
    render(<Stat label="L" value="1" />)
    const cls = document.querySelector('[data-slot="card"]')?.className ?? ''
    expect(cls).toContain('overflow-visible')
    expect(cls).not.toMatch(/(^|\s)overflow-hidden/)
  })

  it('uses the full stat size for the default value', () => {
    render(<Stat label="L" value="1" />)
    const cls = screen.getByText('1').className
    expect(cls).toContain('text-stat')
    expect(cls).not.toContain('text-heading')
  })

  it('shrinks the value on phones when compact', () => {
    render(<Stat label="L" value="1" size="compact" />)
    const cls = screen.getByText('1').className.split(/\s+/)
    expect(cls).toContain('text-heading')
    expect(cls).toContain('sm:text-stat')
    expect(cls).not.toContain('text-stat')
  })
})

describe('Stat sizes and padding', () => {
  it('shrinks a compact value below the sm breakpoint', () => {
    render(<Stat label="L" value="30 min" size="compact" />)
    expect(screen.getByText('30 min').className).toContain('text-heading')
    expect(screen.getByText('30 min').className).toContain('sm:text-stat')
  })

  it('sets free-text values body-size bold and wraps whole words', () => {
    render(<Stat label="L" value="Principles of Flight" size="text" />)
    const value = screen.getByText('Principles of Flight')
    expect(value.className).toContain('text-body')
    expect(value.className).toContain('font-semibold')
    expect(value.className).toContain('break-words')
    expect(value.className).not.toContain('text-stat')
    expect(value.className).not.toContain('text-heading')
  })

  it('applies contentClassName to the card content', () => {
    render(<Stat label="L" value="1" contentClassName="px-3" />)
    expect(document.querySelector('[data-slot="card-content"]')?.className).toContain('px-3')
  })
})
