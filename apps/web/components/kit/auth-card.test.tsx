import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthCard } from './auth-card'

describe('AuthCard', () => {
  it('names the page heading LMS Plus and shows the lmsplus wordmark', () => {
    render(<AuthCard>form</AuthCard>)
    const heading = screen.getByRole('heading', { level: 1, name: 'LMS Plus' })
    expect(heading).toHaveTextContent('lmsplus')
  })

  it('does not link anywhere', () => {
    render(<AuthCard>form</AuthCard>)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders its content on a card surface', () => {
    render(
      <AuthCard>
        <p>Sign in to your account</p>
      </AuthCard>,
    )
    const card = screen.getByText('Sign in to your account').parentElement
    expect(card?.className).toContain('bg-card')
  })
})
