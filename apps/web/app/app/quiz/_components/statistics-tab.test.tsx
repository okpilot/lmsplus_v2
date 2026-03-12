import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../actions/fetch-stats', () => ({
  fetchQuestionStats: vi.fn().mockResolvedValue({
    timesSeen: 5,
    correctCount: 3,
    incorrectCount: 2,
    lastAnswered: '2026-03-11T00:00:00Z',
    fsrsState: 'Review',
    fsrsStability: 10.5,
    fsrsDifficulty: 3.2,
    fsrsInterval: 7,
  }),
}))

import { StatisticsTab } from './statistics-tab'

describe('StatisticsTab', () => {
  it('prompts to answer first when hasAnswered is false', () => {
    render(<StatisticsTab questionId="q-1" hasAnswered={false} />)
    expect(screen.getByText('Answer the question to see your statistics.')).toBeInTheDocument()
  })

  it('shows stats after loading when hasAnswered is true', async () => {
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('3 (60%)')).toBeInTheDocument()
  })
})
