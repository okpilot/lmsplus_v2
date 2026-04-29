import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { InternalExamAttemptRow } from '../types'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string
    children: React.ReactNode
    onClick?: (e: React.MouseEvent) => void
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}))

import { AttemptsTable } from './attempts-table'

const baseRow: InternalExamAttemptRow = {
  sessionId: 'sess-1',
  studentId: 'stu-1',
  studentName: 'Alice',
  studentEmail: 'alice@example.com',
  subjectId: 'subj-1',
  subjectName: 'Air Law',
  startedAt: '2026-04-28T10:00:00.000Z',
  endedAt: '2026-04-28T10:30:00.000Z',
  totalQuestions: 16,
  correctCount: 14,
  scorePercentage: 87.5,
  passed: true,
  voidReason: null,
}

describe('AttemptsTable', () => {
  it('renders empty state when no rows', () => {
    render(<AttemptsTable rows={[]} />)
    expect(screen.getByText('No attempts yet')).toBeInTheDocument()
  })

  it('renders student name as a link to the report page with sessionId', () => {
    render(<AttemptsTable rows={[baseRow]} />)
    const link = screen.getByRole('link', { name: 'Alice' })
    expect(link.getAttribute('href')).toBe('/app/admin/internal-exams/report?session=sess-1')
  })

  it('renders subject name', () => {
    render(<AttemptsTable rows={[baseRow]} />)
    expect(screen.getByText('Air Law')).toBeInTheDocument()
  })

  it('renders score rounded to whole percent', () => {
    render(<AttemptsTable rows={[baseRow]} />)
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('renders Pass badge when passed is true', () => {
    render(<AttemptsTable rows={[baseRow]} />)
    expect(screen.getByLabelText('Passed')).toBeInTheDocument()
    expect(screen.getByText('Pass')).toBeInTheDocument()
  })

  it('renders Fail badge when passed is false', () => {
    render(<AttemptsTable rows={[{ ...baseRow, passed: false }]} />)
    expect(screen.getByLabelText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Fail')).toBeInTheDocument()
  })

  it('renders dash for passed when null', () => {
    render(<AttemptsTable rows={[{ ...baseRow, passed: null }]} />)
    expect(screen.queryByLabelText('Passed')).toBeNull()
    expect(screen.queryByLabelText('Failed')).toBeNull()
  })

  it('renders correct/total count', () => {
    render(<AttemptsTable rows={[baseRow]} />)
    expect(screen.getByText('14/16')).toBeInTheDocument()
  })

  it('falls back to email when student name is empty', () => {
    render(<AttemptsTable rows={[{ ...baseRow, studentName: '' }]} />)
    const link = screen.getByRole('link', { name: 'alice@example.com' })
    expect(link.getAttribute('href')).toBe('/app/admin/internal-exams/report?session=sess-1')
  })

  it('renders dash for null score', () => {
    render(<AttemptsTable rows={[{ ...baseRow, scorePercentage: null }]} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('navigates to the admin report when the row is clicked', () => {
    mockPush.mockClear()
    render(<AttemptsTable rows={[baseRow]} />)
    fireEvent.click(screen.getByRole('link', { name: 'Alice' }).closest('tr') as HTMLElement)
    expect(mockPush).toHaveBeenCalledWith('/app/admin/internal-exams/report?session=sess-1')
  })
})
