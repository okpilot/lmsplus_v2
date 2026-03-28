import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrivacyPolicyContent } from './privacy-policy-content'

describe('PrivacyPolicyContent', () => {
  it('renders the Privacy Policy heading', () => {
    render(<PrivacyPolicyContent />)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
  })

  it('renders all 10 sections', () => {
    render(<PrivacyPolicyContent />)
    const h2s = screen.getAllByRole('heading', { level: 2 })
    expect(h2s).toHaveLength(10)
  })

  it('renders the DPO contact email', () => {
    render(<PrivacyPolicyContent />)
    const dpoLinks = screen.getAllByRole('link', { name: 'dpo@lmsplus.eu' })
    expect(dpoLinks.length).toBeGreaterThanOrEqual(1)
    expect(dpoLinks[0]).toHaveAttribute('href', 'mailto:dpo@lmsplus.eu')
  })
})
