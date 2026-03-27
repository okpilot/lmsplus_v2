import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TermsPage from './page'

describe('TermsPage', () => {
  it('renders the Terms of Service heading', () => {
    render(<TermsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
  })

  it('renders all 8 sections', () => {
    render(<TermsPage />)
    const h2s = screen.getAllByRole('heading', { level: 2 })
    expect(h2s).toHaveLength(8)
  })

  it('renders the support contact email', () => {
    render(<TermsPage />)
    expect(screen.getByRole('link', { name: 'support@lmsplus.eu' })).toHaveAttribute(
      'href',
      'mailto:support@lmsplus.eu',
    )
  })
})
