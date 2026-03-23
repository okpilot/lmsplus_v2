import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectGrid } from './subject-grid'

const SUBJECT_MET = {
  id: 'sub-1',
  code: '050',
  name: 'Meteorology',
  short: 'MET',
  masteryPercentage: 75,
  answeredCorrectly: 15,
  totalQuestions: 20,
  lastPracticedAt: null,
} as const

const SUBJECT_ALW = {
  id: 'sub-2',
  code: '010',
  name: 'Air Law',
  short: 'ALW',
  masteryPercentage: 25,
  answeredCorrectly: 5,
  totalQuestions: 20,
  lastPracticedAt: '2026-03-15T10:00:00Z',
} as const

const SUBJECT_COM = {
  id: 'sub-3',
  code: '090',
  name: 'Communications',
  short: 'COM',
  masteryPercentage: 92,
  answeredCorrectly: 46,
  totalQuestions: 50,
  lastPracticedAt: null,
} as const

const SUBJECTS = [SUBJECT_MET, SUBJECT_ALW, SUBJECT_COM]

describe('SubjectGrid', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders an empty state when there are no subjects', () => {
    render(<SubjectGrid subjects={[]} />)
    expect(screen.getByText(/no subjects available/i)).toBeInTheDocument()
  })

  it('renders a card for each subject with name, code, and mastery', () => {
    render(<SubjectGrid subjects={SUBJECTS} />)
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
    expect(screen.getByText('050')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('uses bg-amber-500 for mastery between 50-89%', () => {
    render(<SubjectGrid subjects={[SUBJECT_MET]} />)
    // 75% => amber
    const bar = screen.getByText('Meteorology').closest('div')?.querySelector('.bg-amber-500')
    expect(bar).toBeInTheDocument()
  })

  it('uses bg-red-500 for mastery below 50%', () => {
    render(<SubjectGrid subjects={[SUBJECT_ALW]} />)
    // 25% => red
    const bar = screen.getByText('Air Law').closest('div')?.querySelector('.bg-red-500')
    expect(bar).toBeInTheDocument()
  })

  it('uses bg-green-500 for mastery at or above 90%', () => {
    render(<SubjectGrid subjects={[SUBJECT_COM]} />)
    // 92% => green
    const bar = screen.getByText('Communications').closest('div')?.querySelector('.bg-green-500')
    expect(bar).toBeInTheDocument()
  })

  it('shows "Never" for null lastPracticedAt', () => {
    render(<SubjectGrid subjects={[SUBJECT_MET]} />)
    expect(screen.getByText(/Last practiced: Never/)).toBeInTheDocument()
  })
})
