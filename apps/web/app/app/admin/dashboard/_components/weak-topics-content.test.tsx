import { render, screen } from '@testing-library/react'
import { notFound, redirect } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Hoisted mocks ----------------------------------------------------------

const mockGetWeakTopics = vi.hoisted(() => vi.fn())
// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getWeakTopics: mockGetWeakTopics,
}))

vi.mock('./weak-topics-list', () => ({
  WeakTopicsList: () => <div data-testid="weak-topics-list" />,
}))

// ---- Subject under test -----------------------------------------------------

import { WeakTopicsContent } from './weak-topics-content'

// ---- Tests ------------------------------------------------------------------

describe('WeakTopicsContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the weak topics list when data loads successfully', async () => {
    mockGetWeakTopics.mockResolvedValue([])

    const element = await WeakTopicsContent()
    render(element)

    expect(screen.getByTestId('weak-topics-list')).toBeInTheDocument()
  })

  it('renders the error fallback when getWeakTopics throws a regular error', async () => {
    mockGetWeakTopics.mockRejectedValue(new Error('query timeout'))

    const element = await WeakTopicsContent()
    render(element)

    expect(
      screen.getByText('Failed to load weak topics. Please refresh the page.'),
    ).toBeInTheDocument()
  })

  it('propagates a redirect() navigation error instead of showing the fallback', async () => {
    const error = capture(() => redirect('/auth/login'))
    mockGetWeakTopics.mockRejectedValue(error)

    await expect(WeakTopicsContent()).rejects.toBe(error)
  })

  it('propagates a notFound() navigation error instead of showing the fallback', async () => {
    const error = capture(() => notFound())
    mockGetWeakTopics.mockRejectedValue(error)

    await expect(WeakTopicsContent()).rejects.toBe(error)
  })
})

function capture(fn: () => never): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('navigation helper did not throw')
}
