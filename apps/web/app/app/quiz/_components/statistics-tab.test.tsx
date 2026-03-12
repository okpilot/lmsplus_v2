import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFetchQuestionStats } = vi.hoisted(() => ({
  mockFetchQuestionStats: vi.fn(),
}))

vi.mock('../actions/fetch-stats', () => ({
  fetchQuestionStats: mockFetchQuestionStats,
}))

const defaultStats = {
  timesSeen: 5,
  correctCount: 3,
  incorrectCount: 2,
  lastAnswered: '2026-03-11T00:00:00Z',
  fsrsState: 'Review',
  fsrsStability: 10.5,
  fsrsDifficulty: 3.2,
  fsrsInterval: 7,
}

import { StatisticsTab } from './statistics-tab'

describe('StatisticsTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockFetchQuestionStats.mockResolvedValue(defaultStats)
  })

  it('prompts to answer first when hasAnswered is false', () => {
    render(<StatisticsTab questionId="q-1" hasAnswered={false} />)
    expect(screen.getByText('Answer the question to see your statistics.')).toBeInTheDocument()
  })

  it('shows load button when hasAnswered is true', () => {
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    expect(screen.getByRole('button', { name: 'Load Statistics' })).toBeInTheDocument()
  })

  it('shows stats after clicking load button', async () => {
    const user = userEvent.setup()
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('3 (60%)')).toBeInTheDocument()
  })

  it('shows error message and retry button when fetch fails', async () => {
    mockFetchQuestionStats.mockRejectedValue(new Error('network failure'))
    const user = userEvent.setup()
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
    await waitFor(() => {
      expect(screen.getByText('Failed to load statistics.')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('retries fetch and shows stats when retry button is clicked after an error', async () => {
    mockFetchQuestionStats
      .mockRejectedValueOnce(new Error('transient error'))
      .mockResolvedValueOnce(defaultStats)

    const user = userEvent.setup()
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)

    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })
  })

  it('does not show load button when hasAnswered is false', () => {
    render(<StatisticsTab questionId="q-1" hasAnswered={false} />)
    expect(screen.queryByRole('button', { name: 'Load Statistics' })).not.toBeInTheDocument()
  })
})
