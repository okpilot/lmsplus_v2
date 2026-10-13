import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Eyebrow, Heading, PageHeader } from './heading'

describe('PageHeader', () => {
  it('renders the title as the level-1 heading', () => {
    render(<PageHeader title="Dashboard" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders description, eyebrow and actions when given', () => {
    render(
      <PageHeader
        title="T"
        description="Desc"
        eyebrow="Overline"
        actions={<button type="button">Go</button>}
      />,
    )
    expect(screen.getByText('Desc').tagName).toBe('P')
    expect(screen.getByText('Overline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
  })

  it('renders a zero description', () => {
    render(<PageHeader title="T" description={0} />)
    expect(screen.getByText('0').tagName).toBe('P')
  })

  it('omits the description paragraph when it is an empty string', () => {
    const { container } = render(<PageHeader title="T" description="" />)
    expect(container.querySelector('p')).toBeNull()
  })

  it('places the eyebrow before the title in the document', () => {
    render(<PageHeader title="T" eyebrow="Over" />)
    const eyebrow = screen.getByText('Over')
    const title = screen.getByRole('heading', { level: 1 })
    expect(eyebrow.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('omits description and eyebrow when not given', () => {
    const { container } = render(<PageHeader title="T" />)
    expect(container.querySelector('p')).toBeNull()
  })
})

describe('Heading', () => {
  it('renders level 2 as an h2', () => {
    render(<Heading level={2}>Sec</Heading>)
    expect(screen.getByRole('heading', { level: 2, name: 'Sec' }).className).toContain(
      'text-heading',
    )
  })

  it('renders level 3 as an h3 with the label size', () => {
    render(
      <Heading level={3} id="h" className="extra">
        Sub
      </Heading>,
    )
    const h = screen.getByRole('heading', { level: 3, name: 'Sub' })
    expect(h.className).toContain('text-label')
    expect(h.className).toContain('extra')
    expect(h).toHaveAttribute('id', 'h')
  })
})

describe('Eyebrow', () => {
  it('renders a paragraph by default', () => {
    render(<Eyebrow>Over</Eyebrow>)
    const el = screen.getByText('Over')
    expect(el.tagName).toBe('P')
    expect(el.className).toContain('text-overline')
  })

  it.each(['span', 'h2', 'h3'] as const)('renders as %s when asked', (as) => {
    render(<Eyebrow as={as}>Over</Eyebrow>)
    expect(screen.getByText('Over').tagName).toBe(as.toUpperCase())
  })
})
