import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Eyebrow, Heading, PageHeader } from './heading'

describe('PageHeader', () => {
  it('renders the title as the level-1 heading', () => {
    render(<PageHeader title="Dashboard" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders description and actions when given', () => {
    render(<PageHeader title="T" description="Desc" actions={<button type="button">Go</button>} />)
    expect(screen.getByText('Desc').tagName).toBe('P')
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

  it('merges a caller className onto the header root', () => {
    const { container } = render(<PageHeader title="T" className="sm:justify-center" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('sm:justify-center')
    expect(root.className).not.toContain('sm:justify-between')
  })

  it('omits the description when not given', () => {
    const { container } = render(<PageHeader title="T" />)
    expect(container.querySelector('p')).toBeNull()
  })
})

describe('Heading', () => {
  it('takes the title and heading weights from the type tokens', () => {
    render(
      <>
        <PageHeader title="Page" />
        <Heading level={2}>Section</Heading>
      </>,
    )
    for (const name of ['Page', 'Section']) {
      const el = screen.getByRole('heading', { name })
      expect(el).not.toHaveClass('font-semibold')
      expect(el).not.toHaveClass('tracking-tight')
    }
  })

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
    expect(h.className).toMatch(/(?<![\w-])text-label-strong(?![\w-])/)
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
    expect(el.className).not.toMatch(/(^|\s)uppercase(\s|$)/)
  })
})
