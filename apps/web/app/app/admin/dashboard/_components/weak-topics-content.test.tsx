import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Hoisted mocks ----------------------------------------------------------

const mockGetWeakTopics = vi.hoisted(() => vi.fn())
const mockRethrowRedirect = vi.hoisted(() => vi.fn())

// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getWeakTopics: mockGetWeakTopics,
}))

vi.mock('@/lib/next/rethrow-redirect', () => ({
  rethrowRedirect: mockRethrowRedirect,
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

  it('re-throws redirect errors instead of showing the fallback', async () => {
    const redirectError = new Error('NEXT_REDIRECT:/auth/login')
    mockGetWeakTopics.mockRejectedValue(redirectError)
    mockRethrowRedirect.mockImplementation((err: unknown) => {
      throw err
    })

    await expect(WeakTopicsContent()).rejects.toThrow('NEXT_REDIRECT:/auth/login')
  })
})
