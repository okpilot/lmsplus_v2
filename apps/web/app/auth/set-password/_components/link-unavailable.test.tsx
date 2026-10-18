import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LINK_INVALID_MESSAGE, LINK_MISSING_MESSAGE } from '@/lib/auth/set-password-link'
import { LinkUnavailable } from './link-unavailable'

describe('LinkUnavailable', () => {
  it('explains an expired or used link', () => {
    render(<LinkUnavailable reason="invalid" />)

    expect(screen.getByText(LINK_INVALID_MESSAGE)).toBeInTheDocument()
  })

  it('explains an incomplete link', () => {
    render(<LinkUnavailable reason="missing" />)

    expect(screen.getByText(LINK_MISSING_MESSAGE)).toBeInTheDocument()
  })

  it('lists the Forgot password steps in order', () => {
    render(<LinkUnavailable reason="invalid" />)

    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items[1]).toContain('Forgot password?')
    expect(items.at(-1)).toMatch(/choose a password/i)
  })

  it('links to the forgot-password page and the login page', () => {
    render(<LinkUnavailable reason="invalid" />)

    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/auth/forgot-password',
    )
    expect(screen.getByRole('link', { name: /login page/i })).toHaveAttribute('href', '/')
  })
})
