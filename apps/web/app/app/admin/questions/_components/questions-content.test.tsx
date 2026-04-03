import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Hoisted mocks ----------------------------------------------------------
// Must be hoisted so vi.mock factory closures can reference them.

const mockGetQuestionsList = vi.hoisted(() => vi.fn())
const mockGetSyllabusTree = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn())

// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getQuestionsList: mockGetQuestionsList,
  PAGE_SIZE: 25,
}))

vi.mock('../../syllabus/queries', () => ({
  getSyllabusTree: mockGetSyllabusTree,
}))

// next/navigation redirect throws in real Next.js — simulate that so callers stop.
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

// Stub QuestionsPageShell — QuestionsContent tests focus on routing logic,
// not the shell's own rendering.
vi.mock('./questions-page-shell', () => ({
  QuestionsPageShell: (props: Record<string, unknown>) => (
    <div data-testid="questions-page-shell" data-page={props.page} data-total={props.totalCount} />
  ),
}))

// ---- Subject under test -----------------------------------------------------

import { QuestionsContent } from './questions-content'

// ---- Fixtures ---------------------------------------------------------------

import type { QuestionFilters } from '../types'

const EMPTY_TREE = [] as const

function makeOkResult(totalCount: number, questions: [] = []) {
  return { ok: true as const, questions, totalCount }
}

const DEFAULT_FILTERS: QuestionFilters = { page: 1 }

// ---- Tests ------------------------------------------------------------------

describe('QuestionsContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    // next/navigation redirect throws so the component halts — mirrors Next.js runtime behaviour.
    mockRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`)
    })

    mockGetSyllabusTree.mockResolvedValue(EMPTY_TREE)
  })

  // --- Happy path ---

  it('renders the page shell when data loads successfully and page is valid', async () => {
    mockGetQuestionsList.mockResolvedValue(makeOkResult(25))

    const element = await QuestionsContent({ filters: DEFAULT_FILTERS })
    render(element)

    expect(screen.getByTestId('questions-page-shell')).not.toBeNull()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('passes the correct page and totalCount to the page shell', async () => {
    mockGetQuestionsList.mockResolvedValue(makeOkResult(100))

    const element = await QuestionsContent({ filters: { page: 3 } })
    render(element)

    const shell = screen.getByTestId('questions-page-shell')
    expect(shell.getAttribute('data-page')).toBe('3')
    expect(shell.getAttribute('data-total')).toBe('100')
  })

  it('defaults to page 1 when filters.page is undefined', async () => {
    mockGetQuestionsList.mockResolvedValue(makeOkResult(10))

    const element = await QuestionsContent({ filters: {} })
    render(element)

    expect(screen.getByTestId('questions-page-shell').getAttribute('data-page')).toBe('1')
  })

  // --- Error path ---

  it('renders an error message when getQuestionsList fails', async () => {
    mockGetQuestionsList.mockResolvedValue({ ok: false, error: 'DB error' })

    const element = await QuestionsContent({ filters: DEFAULT_FILTERS })
    render(element)

    expect(screen.getByText('Failed to load questions. Please try again.')).not.toBeNull()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  // --- Redirect: page > totalPages ---

  it('redirects when page exceeds totalPages with non-zero totalCount', async () => {
    // 25 questions → 1 page. Requesting page 2 should redirect.
    mockGetQuestionsList.mockResolvedValue(makeOkResult(25))

    await expect(QuestionsContent({ filters: { page: 2 } })).rejects.toThrow('NEXT_REDIRECT:')
    expect(mockRedirect).toHaveBeenCalledOnce()
  })

  it('redirects when page exceeds totalPages and totalCount is zero', async () => {
    // Key change from commit 5ac13d2: totalCount=0 → totalPages=1 via Math.max(1, ceil(0/25)).
    // A stale bookmark at page=2 must now redirect even when there are no results.
    // Previously the condition also required totalCount > 0, so page=2 with 0 results
    // would silently render instead of correcting the URL.
    mockGetQuestionsList.mockResolvedValue(makeOkResult(0))

    await expect(QuestionsContent({ filters: { page: 2 } })).rejects.toThrow('NEXT_REDIRECT:')
    expect(mockRedirect).toHaveBeenCalledOnce()
  })

  it('does not redirect when page equals totalPages', async () => {
    // 50 questions → 2 pages. Requesting page 2 is valid — no redirect.
    mockGetQuestionsList.mockResolvedValue(makeOkResult(50))

    const element = await QuestionsContent({ filters: { page: 2 } })
    render(element)

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('does not redirect when page is 1 and totalCount is zero', async () => {
    // totalCount=0 → totalPages=1. page=1 is the only valid page — no redirect.
    mockGetQuestionsList.mockResolvedValue(makeOkResult(0))

    const element = await QuestionsContent({ filters: { page: 1 } })
    render(element)

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('does not redirect when page is 1 and there are no filters', async () => {
    mockGetQuestionsList.mockResolvedValue(makeOkResult(0))

    const element = await QuestionsContent({ filters: {} })
    render(element)

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  // --- Redirect URL construction ---

  it('redirects without a page param when totalPages is 1', async () => {
    // 25 results → 1 page. Stale page=5 → redirect strips page param (totalPages > 1 is false).
    mockGetQuestionsList.mockResolvedValue(makeOkResult(25))

    await expect(QuestionsContent({ filters: { page: 5 } })).rejects.toThrow('NEXT_REDIRECT:')

    const redirectPath: string = mockRedirect.mock.calls[0]?.[0]
    expect(redirectPath).toBe('/app/admin/questions?')
  })

  it('includes the page param in the redirect URL when totalPages is greater than 1', async () => {
    // 75 results → 3 pages. Requesting page=10 redirects to page=3.
    mockGetQuestionsList.mockResolvedValue(makeOkResult(75))

    await expect(QuestionsContent({ filters: { page: 10 } })).rejects.toThrow('NEXT_REDIRECT:')

    const redirectPath: string = mockRedirect.mock.calls[0]?.[0]
    expect(redirectPath).toContain('page=3')
  })

  it('preserves all active filter params in the redirect URL', async () => {
    mockGetQuestionsList.mockResolvedValue(makeOkResult(25))

    await expect(
      QuestionsContent({
        filters: {
          page: 5,
          subjectId: 'subj-1',
          topicId: 'topic-2',
          subtopicId: 'sub-3',
          difficulty: 'hard',
          status: 'active',
          search: 'atmosphere',
        },
      }),
    ).rejects.toThrow('NEXT_REDIRECT:')

    const redirectPath: string = mockRedirect.mock.calls[0]?.[0]
    expect(redirectPath).toContain('subjectId=subj-1')
    expect(redirectPath).toContain('topicId=topic-2')
    expect(redirectPath).toContain('subtopicId=sub-3')
    expect(redirectPath).toContain('difficulty=hard')
    expect(redirectPath).toContain('status=active')
    expect(redirectPath).toContain('search=atmosphere')
  })

  it('omits undefined filter params from the redirect URL', async () => {
    mockGetQuestionsList.mockResolvedValue(makeOkResult(25))

    await expect(QuestionsContent({ filters: { page: 5 } })).rejects.toThrow('NEXT_REDIRECT:')

    const redirectPath: string = mockRedirect.mock.calls[0]?.[0]
    expect(redirectPath).not.toContain('subjectId')
    expect(redirectPath).not.toContain('topicId')
    expect(redirectPath).not.toContain('difficulty')
    expect(redirectPath).not.toContain('status')
    expect(redirectPath).not.toContain('search')
  })
})
