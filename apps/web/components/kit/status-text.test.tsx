import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PassFailStatus, StatusText } from './status-text'

describe('StatusText', () => {
  it('renders the label as plain text with no symbol by default', () => {
    const { container } = render(<StatusText label="Active" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders a muted caption under the label', () => {
    render(<StatusText label="Needs codes" caption="1 of 2 have codes" />)
    expect(screen.getByText('Needs codes')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 have codes')).toHaveClass('text-muted-foreground')
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

  it('uses the small icon', () => {
    const { container } = render(<StatusText label="Passed" tone="success" />)
    expect(container.querySelector('svg')).toHaveClass('size-icon-sm')
  })
})

describe('PassFailStatus', () => {
  it('renders Passed with the success symbol', () => {
    const { container } = render(<PassFailStatus passed />)
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveClass('text-success')
  })

  it('renders Failed with the danger symbol', () => {
    const { container } = render(<PassFailStatus passed={false} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveClass('text-danger')
  })
})
