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

import { AdminInternalExamReportFooter } from './admin-internal-exam-report-footer'

describe('AdminInternalExamReportFooter', () => {
  it('renders a link back to internal exams', () => {
    render(<AdminInternalExamReportFooter />)
    const link = screen.getByRole('link', { name: /back to internal exams/i })
    expect(link).toBeInTheDocument()
  })

  it('points to the internal exams attempts tab URL', () => {
    render(<AdminInternalExamReportFooter />)
    const link = screen.getByRole('link', { name: /back to internal exams/i })
    expect(link).toHaveAttribute('href', '/app/admin/internal-exams?tab=attempts')
  })
})
