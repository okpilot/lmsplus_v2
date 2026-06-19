import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VfrRtResults } from '@/lib/queries/vfr-rt-results'
import { VfrRtResultsBreakdown } from './vfr-rt-results-breakdown'

// Stub child components to isolate breakdown rendering logic
vi.mock('./vfr-rt-part-bar', () => ({
  VfrRtPartBar: ({ label, pct, passed }: { label: string; pct: number; passed: boolean }) => (
    <div data-testid="part-bar" data-label={label} data-pct={pct} data-passed={String(passed)} />
  ),
}))

vi.mock('./vfr-rt-review-row', () => ({
  VfrRtReviewRow: ({ row, index }: { row: { questionId: string }; index: number }) => (
    <div data-testid="review-row" data-id={row.questionId} data-index={index} />
  ),
}))

const makeResults = (overrides: Partial<VfrRtResults['summary']> = {}): VfrRtResults => ({
  summary: {
    part1Pct: 80,
    part2Pct: 75,
    part3Pct: 100,
    passedOverall: true,
    passedPerPart: { part1: true, part2: true, part3: true },
    correctCount: 22,
    totalQuestions: 25,
    ...overrides,
  },
  rows: [
    {
      questionId: 'q-1',
      questionType: 'short_answer',
      questionText: 'What is QNH?',
      questionImageUrl: null,
      options: null,
      answers: [
        { blank_index: null, selected_option_id: null, response_text: 'NH', is_correct: true },
      ],
      key: { canonical_answer: 'NH', accepted_synonyms: [] },
      explanationText: '',
      explanationImageUrl: null,
      isCorrect: true,
    },
  ],
})

describe('VfrRtResultsBreakdown', () => {
  it('renders three part bars with the correct labels', () => {
    render(<VfrRtResultsBreakdown results={makeResults()} />)
    const bars = screen.getAllByTestId('part-bar')
    expect(bars).toHaveLength(3)
    const labels = bars.map((b) => b.getAttribute('data-label'))
    expect(labels).toContain('Part 1 — Short Answer')
    expect(labels).toContain('Part 2 — Dialog Fill')
    expect(labels).toContain('Part 3 — Multiple Choice')
  })

  it('passes the correct pct and passed props to each part bar', () => {
    const results = makeResults({ part1Pct: 80, part2Pct: 75, part3Pct: 100 })
    render(<VfrRtResultsBreakdown results={results} />)
    const bars = screen.getAllByTestId('part-bar')
    const byLabel = (label: string) => bars.find((b) => b.getAttribute('data-label') === label)
    expect(byLabel('Part 1 — Short Answer')?.getAttribute('data-pct')).toBe('80')
    expect(byLabel('Part 2 — Dialog Fill')?.getAttribute('data-pct')).toBe('75')
    expect(byLabel('Part 3 — Multiple Choice')?.getAttribute('data-pct')).toBe('100')
  })

  it('shows PASSED badge when passedOverall is true', () => {
    render(<VfrRtResultsBreakdown results={makeResults({ passedOverall: true })} />)
    expect(screen.getByText('PASSED')).toBeInTheDocument()
    expect(screen.queryByText('FAILED')).not.toBeInTheDocument()
  })

  it('shows FAILED badge when passedOverall is false', () => {
    render(<VfrRtResultsBreakdown results={makeResults({ passedOverall: false })} />)
    expect(screen.getByText('FAILED')).toBeInTheDocument()
    expect(screen.queryByText('PASSED')).not.toBeInTheDocument()
  })

  it('renders the correct answer row count in the summary', () => {
    render(
      <VfrRtResultsBreakdown results={makeResults({ correctCount: 22, totalQuestions: 25 })} />,
    )
    expect(screen.getByText('22 answer rows correct')).toBeInTheDocument()
  })

  it('renders one review row per result row', () => {
    const results = makeResults()
    results.rows.push({
      questionId: 'q-2',
      questionType: 'multiple_choice',
      questionText: 'Which call?',
      questionImageUrl: null,
      options: null,
      answers: [
        {
          blank_index: null,
          selected_option_id: 'opt-a',
          response_text: null,
          is_correct: true,
        },
      ],
      key: { correct_option_id: 'opt-a' },
      explanationText: '',
      explanationImageUrl: null,
      isCorrect: true,
    })
    render(<VfrRtResultsBreakdown results={results} />)
    expect(screen.getAllByTestId('review-row')).toHaveLength(2)
  })
})
