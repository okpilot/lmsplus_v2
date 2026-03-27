import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrivacyPolicyContent } from './privacy-policy-content'

describe('PrivacyPolicyContent', () => {
  it('renders the Privacy Policy heading', () => {
    render(<PrivacyPolicyContent />)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
  })

  it('renders all 11 sections', () => {
    render(<PrivacyPolicyContent />)
    const h2s = screen.getAllByRole('heading', { level: 2 })
    expect(h2s).toHaveLength(11)
  })

  it('renders the DPO contact email', () => {
    render(<PrivacyPolicyContent />)
    expect(screen.getByRole('link', { name: 'dpo@lmsplus.eu' })).toHaveAttribute(
      'href',
      'mailto:dpo@lmsplus.eu',
    )
  })
})
