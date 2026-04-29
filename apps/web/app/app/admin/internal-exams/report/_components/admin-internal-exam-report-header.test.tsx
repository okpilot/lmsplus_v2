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

import { AdminInternalExamReportHeader } from './admin-internal-exam-report-header'

describe('AdminInternalExamReportHeader', () => {
  it('renders the student name as the current breadcrumb segment', () => {
    render(<AdminInternalExamReportHeader studentName="Alice Aviator" />)
    expect(screen.getByText('Alice Aviator')).toBeInTheDocument()
  })

  it('falls back to "Student" when studentName is null', () => {
    render(<AdminInternalExamReportHeader studentName={null} />)
    expect(screen.getByText('Student')).toBeInTheDocument()
  })

  it('renders an Internal Exams breadcrumb link pointing to the attempts tab', () => {
    render(<AdminInternalExamReportHeader studentName="Alice Aviator" />)
    const link = screen.getByRole('link', { name: 'Internal Exams' })
    expect(link).toHaveAttribute('href', '/app/admin/internal-exams?tab=attempts')
  })
})
