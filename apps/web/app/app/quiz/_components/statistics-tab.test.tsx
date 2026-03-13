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

  it('resets stats and shows load button when questionId changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })

    rerender(<StatisticsTab questionId="q-2" hasAnswered={true} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load Statistics' })).toBeInTheDocument()
    })
    expect(screen.queryByText('Times seen')).not.toBeInTheDocument()
  })

  it('clears error state and shows load button when questionId changes after a failed fetch', async () => {
    mockFetchQuestionStats.mockRejectedValue(new Error('network failure'))
    const user = userEvent.setup()
    const { rerender } = render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
    await waitFor(() => {
      expect(screen.getByText('Failed to load statistics.')).toBeInTheDocument()
    })

    rerender(<StatisticsTab questionId="q-2" hasAnswered={true} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load Statistics' })).toBeInTheDocument()
    })
    expect(screen.queryByText('Failed to load statistics.')).not.toBeInTheDocument()
  })

  it('hides the FSRS section when fsrsState is null', async () => {
    mockFetchQuestionStats.mockResolvedValue({ ...defaultStats, fsrsState: null })
    const user = userEvent.setup()
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
    await waitFor(() => {
      expect(screen.getByText('Times seen')).toBeInTheDocument()
    })
    expect(screen.queryByText('FSRS Data')).not.toBeInTheDocument()
    expect(screen.queryByText('State')).not.toBeInTheDocument()
  })

  it('formats a known lowercase fsrs state through the label map', async () => {
    mockFetchQuestionStats.mockResolvedValue({ ...defaultStats, fsrsState: 'review' })
    const user = userEvent.setup()
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
    await waitFor(() => {
      expect(screen.getByText('Review')).toBeInTheDocument()
    })
  })

  it('formats "learning" fsrs state as "Learning"', async () => {
    mockFetchQuestionStats.mockResolvedValue({ ...defaultStats, fsrsState: 'learning' })
    const user = userEvent.setup()
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
    await waitFor(() => {
      expect(screen.getByText('Learning')).toBeInTheDocument()
    })
  })

  it('capitalises unknown fsrs state via fallback', async () => {
    mockFetchQuestionStats.mockResolvedValue({ ...defaultStats, fsrsState: 'suspended' })
    const user = userEvent.setup()
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))
    await waitFor(() => {
      expect(screen.getByText('Suspended')).toBeInTheDocument()
    })
  })

  it('shows load button immediately when questionId changes during an in-flight fetch', async () => {
    // The question changes while isLoading is true. The reset block sets isLoading
    // to false synchronously on the next render, so the load button appears without
    // waiting for the stale fetch's finally block to run.
    let resolveQ1: (value: typeof defaultStats) => void = () => {}
    const staleFetchPromise = new Promise<typeof defaultStats>((resolve) => {
      resolveQ1 = resolve
    })
    mockFetchQuestionStats.mockReturnValueOnce(staleFetchPromise)

    const user = userEvent.setup()
    const { rerender } = render(<StatisticsTab questionId="q-1" hasAnswered={true} />)

    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))

    // Loading skeleton should be visible while in-flight.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load Statistics' })).not.toBeInTheDocument()
    })

    // Change question before the fetch resolves — the reset clears isLoading immediately.
    rerender(<StatisticsTab questionId="q-2" hasAnswered={true} />)

    // The load button must appear before we ever resolve the stale promise.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load Statistics' })).toBeInTheDocument()
    })

    // Resolve the stale fetch — the generation guard discards the result.
    resolveQ1(defaultStats)

    // Stats from the stale q-1 fetch must never appear.
    expect(screen.queryByText('Times seen')).not.toBeInTheDocument()
  })

  it('discards stale fetch result when questionId changes before the fetch resolves', async () => {
    // Controls when the q-1 fetch resolves so we can change questionId first.
    let resolveQ1: (value: typeof defaultStats) => void = () => {}
    const staleFetchPromise = new Promise<typeof defaultStats>((resolve) => {
      resolveQ1 = resolve
    })
    mockFetchQuestionStats.mockReturnValueOnce(staleFetchPromise)

    const user = userEvent.setup()
    const { rerender } = render(<StatisticsTab questionId="q-1" hasAnswered={true} />)

    // Start loading stats for q-1. Component enters isPending state.
    await user.click(screen.getByRole('button', { name: 'Load Statistics' }))

    // Change to q-2 before q-1 resolves — this bumps the generation counter.
    rerender(<StatisticsTab questionId="q-2" hasAnswered={true} />)

    // Resolve the stale q-1 fetch. The generation guard discards the result.
    // Resolving ends the useTransition pending state, so the component re-renders.
    resolveQ1(defaultStats)

    // Wait for the pending transition to clear. The component should show the
    // Load Statistics button for q-2 (stats was discarded, not set).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load Statistics' })).toBeInTheDocument()
    })

    // Stats from the stale q-1 fetch must never have been rendered.
    expect(screen.queryByText('Times seen')).not.toBeInTheDocument()
  })
})
