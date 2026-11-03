import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { AdminReportHeader } from './admin-report-header'

describe('AdminReportHeader', () => {
  it('renders the title as a page title', () => {
    render(<AdminReportHeader studentId="s1" studentName="Alice" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Quiz Results' })).toHaveClass(
      'text-title',
    )
  })

  it('links back to the student breadcrumb', () => {
    render(<AdminReportHeader studentId="s1" studentName="Alice" />)
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute(
      'href',
      '/app/admin/dashboard/students/s1',
    )
  })
})
