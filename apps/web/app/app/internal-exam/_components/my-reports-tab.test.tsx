import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
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

  it('renders the subject short as a link to the report page with the session id', () => {
    render(<MyReportsTab rows={[baseRow]} />)
    const link = screen.getByRole('link', { name: '010' })
    expect(link.getAttribute('href')).toBe('/app/quiz/report?id=sess-1')
  })

  it('falls back to the subject name when there is no short code', () => {
    render(<MyReportsTab rows={[{ ...baseRow, subjectShort: '' }]} />)
    const link = screen.getByRole('link', { name: 'Air Law' })
    expect(link.getAttribute('href')).toBe('/app/quiz/report?id=sess-1')
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
