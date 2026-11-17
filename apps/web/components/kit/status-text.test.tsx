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

  it('renders a muted caption below the label', () => {
    render(<StatusText label="Closed" caption="2 days ago" />)
    expect(screen.getByText('2 days ago')).toHaveClass('text-muted-foreground')
  })

  it('applies className to the wrapper', () => {
    const { container } = render(<StatusText label="Expired" className="text-muted-foreground" />)
    expect(container.firstElementChild).toHaveClass('text-muted-foreground')
  })
})
