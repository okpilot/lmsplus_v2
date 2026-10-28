import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthShell } from './auth-shell'

describe('AuthShell', () => {
  it('renders main > card with no md-only border/ring classes', () => {
    const { container } = render(<AuthShell>child</AuthShell>)
    const card = container.querySelector('main [data-slot=card]')
    expect(card).not.toBeNull()
    expect(card?.className).not.toMatch(/md:(border|ring)/)
  })

  it('renders the LMS Plus h1 with text-title', () => {
    render(<AuthShell>child</AuthShell>)
    expect(screen.getByRole('heading', { level: 1, name: 'LMS Plus' })).toHaveClass('text-title')
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
