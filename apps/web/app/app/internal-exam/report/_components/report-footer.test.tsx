import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetAllMocks()
})

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

import { ReportFooter } from './report-footer'

describe('ReportFooter', () => {
  it('renders a link back to the internal exam reports tab', () => {
    render(<ReportFooter />)
    const link = screen.getByRole('link', { name: /back to internal exam reports/i })
    expect(link).toBeInTheDocument()
  })

  it('points to the internal exam reports tab URL', () => {
    render(<ReportFooter />)
    const link = screen.getByRole('link', { name: /back to internal exam reports/i })
    expect(link).toHaveAttribute('href', '/app/internal-exam?tab=reports')
  })
})
