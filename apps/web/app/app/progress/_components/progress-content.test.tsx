import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectDetail } from '@/lib/queries/progress'
import { ProgressContent } from './progress-content'

const { mockGetProgressData } = vi.hoisted(() => ({
  mockGetProgressData: vi.fn(),
}))

vi.mock('@/lib/queries/progress', () => ({
  getProgressData: (...args: unknown[]) => mockGetProgressData(...args),
}))

// SubjectBreakdown is a client component — render a minimal stand-in
vi.mock('./subject-breakdown', () => ({
  SubjectBreakdown: ({ subjects }: { subjects: SubjectDetail[] }) => (
    <div data-testid="subject-breakdown" data-count={subjects.length} />
  ),
}))

function makeSubject(totalQuestions: number, answeredCorrectly: number): SubjectDetail {
  return {
    id: crypto.randomUUID(),
    code: 'TST',
    name: 'Test Subject',
    short: 'TST',
    totalQuestions,
    answeredCorrectly,
    masteryPercentage:
      totalQuestions > 0 ? Math.round((answeredCorrectly / totalQuestions) * 100) : 0,
    topics: [],
  }
}

describe('ProgressContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('displays overall mastery as a percentage across all subjects', async () => {
    // 40 correct out of 80 total = 50%
    mockGetProgressData.mockResolvedValue([makeSubject(50, 25), makeSubject(30, 15)])

    const jsx = await ProgressContent()
    render(jsx)

    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows zero mastery when there are no questions', async () => {
    mockGetProgressData.mockResolvedValue([])

    const jsx = await ProgressContent()
    render(jsx)

    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('rounds fractional mastery to the nearest integer', async () => {
    // 1 correct out of 3 total = 33.33... → rounds to 33%
    mockGetProgressData.mockResolvedValue([makeSubject(3, 1)])

    const jsx = await ProgressContent()
    render(jsx)

    expect(screen.getByText('33%')).toBeInTheDocument()
  })

  it('displays the correct / total question counts', async () => {
    mockGetProgressData.mockResolvedValue([makeSubject(10, 7), makeSubject(5, 3)])

    const jsx = await ProgressContent()
    render(jsx)

    expect(screen.getByText('10 / 15 questions mastered')).toBeInTheDocument()
  })

  it('passes subjects to SubjectBreakdown', async () => {
    const subjects = [makeSubject(10, 5), makeSubject(20, 15)]
    mockGetProgressData.mockResolvedValue(subjects)

    const jsx = await ProgressContent()
    render(jsx)

    expect(screen.getByTestId('subject-breakdown')).toHaveAttribute('data-count', '2')
  })
})
