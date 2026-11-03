import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthShell } from './auth-shell'

describe('AuthShell', () => {
  it('renders main > card with no breakpoint-only border/ring classes', () => {
    const { container } = render(<AuthShell>child</AuthShell>)
    const card = container.querySelector('main [data-slot=card]')
    expect(card).not.toBeNull()
    expect(card?.className).not.toMatch(/(sm|md|lg|xl|2xl):(border|ring)/)
  })

  it('renders the LMS Plus h1 with text-title', () => {
    render(<AuthShell>child</AuthShell>)
    expect(screen.getByRole('heading', { level: 1, name: 'LMS Plus' })).toHaveClass('text-title')
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('gap-2')
  })

  it('shows the lmsplus wordmark with a muted "plus" and tracking-logo', () => {
    render(<AuthShell>child</AuthShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('lmsplus')
    expect(h1).toHaveClass('tracking-logo')
    const plus = h1.querySelector('span')
    expect(plus?.textContent).toBe('plus')
    expect(plus).toHaveClass('text-muted-foreground')
  })

  it('keeps the accessible name LMS Plus on the heading', () => {
    render(<AuthShell>child</AuthShell>)
    expect(screen.getByRole('heading', { level: 1, name: 'LMS Plus' })).toBeInTheDocument()
  })

  it('renders no placeholder badge in the card header', () => {
    const { container } = render(<AuthShell>child</AuthShell>)
    const header = container.querySelector('[data-slot=card-header]')
    expect(header).not.toBeNull()
    expect(header?.querySelector('.bg-primary')).toBeNull()
  })

  it('renders the subtitle muted when given', () => {
    render(<AuthShell subtitle="Sign in to your account">child</AuthShell>)
    expect(screen.getByText('Sign in to your account')).toHaveClass('text-muted-foreground')
  })

  it('renders no subtitle when omitted', () => {
    const { container } = render(<AuthShell>child</AuthShell>)
    expect(container.querySelectorAll('[data-slot=card-header] p')).toHaveLength(0)
  })

  it('renders its children', () => {
    render(<AuthShell>hello child</AuthShell>)
    expect(screen.getByText('hello child')).toBeInTheDocument()
  })
})
