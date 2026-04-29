import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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

import type { InternalExamHistoryEntry } from '../queries'
import { MyReportsTab } from './my-reports-tab'

const baseRow: InternalExamHistoryEntry = {
  id: 'sess-1',
  subjectId: 'subj-1',
  subjectName: 'Air Law',
  subjectShort: '010',
  startedAt: '2026-04-28T09:00:00.000Z',
  endedAt: '2026-04-28T09:30:00.000Z',
  scorePercentage: 87.5,
  passed: true,
  totalQuestions: 16,
  answeredCount: 15,
  attemptNumber: 2,
}

describe('MyReportsTab', () => {
  it('renders the empty state when there are no rows', () => {
    render(<MyReportsTab rows={[]} />)
    expect(screen.getByTestId('reports-empty')).toHaveTextContent(/no internal exam attempts yet/i)
  })

  it('renders the full subject name as a link to the report page with the session id', () => {
    render(<MyReportsTab rows={[baseRow]} />)
    const link = screen.getByRole('link', { name: 'Air Law' })
    expect(link.getAttribute('href')).toBe('/app/internal-exam/report?session=sess-1')
  })

  it('falls back to the subject short code when there is no full name', () => {
    render(<MyReportsTab rows={[{ ...baseRow, subjectName: '' }]} />)
    const link = screen.getByRole('link', { name: '010' })
    expect(link.getAttribute('href')).toBe('/app/internal-exam/report?session=sess-1')
  })

  it('navigates to the report when the row is clicked', () => {
    mockPush.mockClear()
    render(<MyReportsTab rows={[baseRow]} />)
    const row = screen.getByTestId('report-row-sess-1')
    fireEvent.click(row)
    expect(mockPush).toHaveBeenCalledWith('/app/internal-exam/report?session=sess-1')
  })

  it('navigates to the report when Enter is pressed on a focused row', () => {
    mockPush.mockClear()
    render(<MyReportsTab rows={[baseRow]} />)
    const row = screen.getByTestId('report-row-sess-1')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(mockPush).toHaveBeenCalledWith('/app/internal-exam/report?session=sess-1')
  })

  it('renders the attempt number prefixed with #', () => {
    render(<MyReportsTab rows={[baseRow]} />)
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('renders the score rounded to a whole percent', () => {
    render(<MyReportsTab rows={[baseRow]} />)
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('renders the Pass badge when passed is true', () => {
    render(<MyReportsTab rows={[baseRow]} />)
    expect(screen.getByLabelText('Passed')).toBeInTheDocument()
  })

  it('renders the Fail badge when passed is false', () => {
    render(<MyReportsTab rows={[{ ...baseRow, passed: false }]} />)
    expect(screen.getByLabelText('Failed')).toBeInTheDocument()
  })

  it('renders neither pass nor fail badge when passed is null', () => {
    render(<MyReportsTab rows={[{ ...baseRow, passed: null }]} />)
    expect(screen.queryByLabelText('Passed')).toBeNull()
    expect(screen.queryByLabelText('Failed')).toBeNull()
  })

  it('renders the answered/total count', () => {
    render(<MyReportsTab rows={[baseRow]} />)
    expect(screen.getByText('15/16')).toBeInTheDocument()
  })

  it('renders a dash when the score is null', () => {
    render(<MyReportsTab rows={[{ ...baseRow, scorePercentage: null }]} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
