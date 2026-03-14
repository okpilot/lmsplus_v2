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
}

import { StatisticsTab } from './statistics-tab'

describe('StatisticsTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockFetchQuestionStats.mockResolvedValue(defaultStats)
  })

  it('auto-fetches stats on mount and shows them', async () => {
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('3 (60%)')).toBeInTheDocument()
  })

  it('shows loading skeleton while fetching', async () => {
    let resolve: (value: typeof defaultStats) => void = () => {}
    mockFetchQuestionStats.mockReturnValue(
      new Promise<typeof defaultStats>((res) => {
        resolve = res
      }),
    )
    render(<StatisticsTab questionId="q-1" hasAnswered={false} />)
    // Skeleton is visible while in-flight
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
    resolve(defaultStats)
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })
  })

  it('shows "answer this question" placeholder when fetch returns null and not answered', async () => {
    mockFetchQuestionStats.mockResolvedValue(null)
    render(<StatisticsTab questionId="q-1" hasAnswered={false} />)
    await waitFor(() => {
      expect(screen.getByText('Answer this question to see statistics.')).toBeInTheDocument()
    })
  })

  it('shows "no statistics available" placeholder when fetch returns null and already answered', async () => {
    mockFetchQuestionStats.mockResolvedValue(null)
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await waitFor(() => {
      expect(screen.getByText('No statistics available for this question yet.')).toBeInTheDocument()
    })
  })

  it('shows error message and retry button when fetch fails', async () => {
    mockFetchQuestionStats.mockRejectedValue(new Error('network failure'))
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })
  })

  it('resets stats and auto-fetches when questionId changes', async () => {
    const { rerender } = render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })

    mockFetchQuestionStats.mockResolvedValue(null)
    rerender(<StatisticsTab questionId="q-2" hasAnswered={false} />)
    await waitFor(() => {
      expect(screen.getByText('Answer this question to see statistics.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Times seen')).not.toBeInTheDocument()
  })

  it('clears error state and auto-fetches when questionId changes after a failed fetch', async () => {
    mockFetchQuestionStats.mockRejectedValue(new Error('network failure'))
    const { rerender } = render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await waitFor(() => {
      expect(screen.getByText('Failed to load statistics.')).toBeInTheDocument()
    })

    mockFetchQuestionStats.mockResolvedValue(defaultStats)
    rerender(<StatisticsTab questionId="q-2" hasAnswered={true} />)
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })
    expect(screen.queryByText('Failed to load statistics.')).not.toBeInTheDocument()
  })

  it('shows the previous quiz sessions note', async () => {
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })
    expect(screen.getByText('Statistics reflect your previous quiz sessions.')).toBeInTheDocument()
  })

  it('discards stale fetch result when questionId changes before the fetch resolves', async () => {
    let resolveQ1: (value: typeof defaultStats) => void = () => {}
    const staleFetchPromise = new Promise<typeof defaultStats>((resolve) => {
      resolveQ1 = resolve
    })
    mockFetchQuestionStats.mockReturnValueOnce(staleFetchPromise)

    const { rerender } = render(<StatisticsTab questionId="q-1" hasAnswered={true} />)

    // Change to q-2 before q-1 resolves — this bumps the generation counter.
    // Give the second call a null result so we get the placeholder.
    mockFetchQuestionStats.mockResolvedValue(null)
    rerender(<StatisticsTab questionId="q-2" hasAnswered={false} />)

    // Resolve the stale q-1 fetch. The generation guard discards the result.
    resolveQ1(defaultStats)

    // Wait for the pending transition to clear.
    await waitFor(() => {
      expect(screen.getByText('Answer this question to see statistics.')).toBeInTheDocument()
    })

    // Stats from the stale q-1 fetch must never have been rendered.
    expect(screen.queryByText('Times seen')).not.toBeInTheDocument()
  })

  it('never renders a "Load Statistics" button', async () => {
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    // Wait for fetch to settle so no async state update leaks outside act()
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Load Statistics' })).not.toBeInTheDocument()
  })
})
