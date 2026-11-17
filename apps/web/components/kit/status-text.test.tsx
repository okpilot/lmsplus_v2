import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusText } from './status-text'

describe('StatusText', () => {
  it('renders the label as plain text with no symbol by default', () => {
    const { container } = render(<StatusText label="Active" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('adds a success-coloured symbol for success', () => {
    const { container } = render(<StatusText label="Passed" tone="success" />)
    expect(container.querySelector('svg')).toHaveClass('text-success')
  })

  it('adds a danger-coloured symbol for danger', () => {
    const { container } = render(<StatusText label="Failed" tone="danger" />)
    expect(container.querySelector('svg')).toHaveClass('text-danger')
  })

  it('hides the symbol from assistive tech and leaves the label text only', () => {
    const { container } = render(<StatusText label="Passed" tone="success" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Passed')).toBeInTheDocument()
  })

  it('renders a single inline-flex span carrying className', () => {
    const { container } = render(<StatusText label="Expired" className="text-muted-foreground" />)
    const root = container.firstElementChild
    expect(root?.tagName).toBe('SPAN')
    expect(root).toHaveClass('inline-flex', 'items-center', 'gap-1', 'text-muted-foreground')
    expect(container.children).toHaveLength(1)
  })

  it('lg size uses text-stat and the larger icon', () => {
    const { container } = render(<StatusText label="Passed" tone="success" size="lg" />)
    expect(container.firstElementChild).toHaveClass('text-stat')
    expect(container.querySelector('svg')).toHaveClass('size-icon-lg')
  })

  it('default size has no text-stat and the small icon', () => {
    const { container } = render(<StatusText label="Passed" tone="success" />)
    expect(container.firstElementChild).not.toHaveClass('text-stat')
    expect(container.querySelector('svg')).toHaveClass('size-icon-sm')
  })
})
