import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Hoisted mocks ----------------------------------------------------------

const { mockReplace, mockUseSearchParams } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockUseSearchParams: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: mockUseSearchParams,
}))

// Stub QuestionFilterSelects to expose each filter prop as a data attribute and
// a corresponding native <select> driven by onFilterChange.  This keeps the test
// focused on QuestionFiltersBar wiring (URL param logic) rather than on the
// inner Select rendering of QuestionFilterSelects, which has its own test file.
vi.mock('./question-filter-selects', () => ({
  QuestionFilterSelects: (props: {
    hasCalculations: string
    subjectId: string
    topicId: string
    subtopicId: string
    status: string
    onFilterChange: (key: string, value: string | null | undefined) => void
    tree: unknown
  }) => (
    <div data-testid="filter-selects" data-has-calculations={props.hasCalculations}>
      {/* Native selects let userEvent drive each filter */}
      <select
        aria-label="hasCalculations-select"
        value={props.hasCalculations}
        onChange={(e) => props.onFilterChange('hasCalculations', e.target.value)}
      >
        <option value="__all__">Any calculations</option>
        <option value="true">Has calculations</option>
        <option value="false">No calculations</option>
      </select>
      <select
        aria-label="subjectId-select"
        value={props.subjectId}
        onChange={(e) => props.onFilterChange('subjectId', e.target.value)}
      >
        <option value="__all__">All subjects</option>
        <option value="s1">Subject 1</option>
      </select>
    </div>
  ),
}))

// Stub Input to a native input element.
vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

// ---- Subject under test -----------------------------------------------------

import type { SyllabusTree } from '../../syllabus/types'
import { QuestionFiltersBar } from './question-filters'

// ---- Helpers ----------------------------------------------------------------

const EMPTY_TREE: SyllabusTree = []

function renderBar(
  filters: React.ComponentProps<typeof QuestionFiltersBar>['filters'] = {},
  searchParamsInit: Record<string, string> = {},
) {
  mockUseSearchParams.mockReturnValue(new URLSearchParams(searchParamsInit))
  return render(<QuestionFiltersBar tree={EMPTY_TREE} filters={filters} />)
}

// ---- Tests ------------------------------------------------------------------

describe('QuestionFiltersBar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // --- hasCalculations prop passthrough ---

  it("passes '__all__' to filter selects when hasCalculations filter is undefined", () => {
    renderBar({})
    expect(screen.getByTestId('filter-selects').getAttribute('data-has-calculations')).toBe(
      '__all__',
    )
  })

  it("passes 'true' to filter selects when hasCalculations filter is true", () => {
    renderBar({ hasCalculations: true })
    expect(screen.getByTestId('filter-selects').getAttribute('data-has-calculations')).toBe('true')
  })

  it("passes 'false' to filter selects when hasCalculations filter is false", () => {
    renderBar({ hasCalculations: false })
    expect(screen.getByTestId('filter-selects').getAttribute('data-has-calculations')).toBe('false')
  })

  // --- hasCalculations URL param updates ---

  it("sets hasCalculations=true in the URL when the 'Has calculations' option is selected", async () => {
    const user = userEvent.setup()
    renderBar({})
    await user.selectOptions(screen.getByLabelText('hasCalculations-select'), 'true')
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('hasCalculations=true'))
  })

  it("sets hasCalculations=false in the URL when the 'No calculations' option is selected", async () => {
    const user = userEvent.setup()
    renderBar({})
    await user.selectOptions(screen.getByLabelText('hasCalculations-select'), 'false')
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('hasCalculations=false'))
  })

  it("removes hasCalculations from the URL when '__all__' is selected", async () => {
    const user = userEvent.setup()
    renderBar({}, { hasCalculations: 'true' })
    await user.selectOptions(screen.getByLabelText('hasCalculations-select'), '__all__')
    const url: string = mockReplace.mock.calls[0]?.[0]
    expect(url).not.toContain('hasCalculations')
  })

  it('removes the page param whenever any filter changes', async () => {
    const user = userEvent.setup()
    renderBar({}, { page: '3', hasCalculations: 'false' })
    await user.selectOptions(screen.getByLabelText('hasCalculations-select'), '__all__')
    const url: string = mockReplace.mock.calls[0]?.[0]
    expect(url).not.toContain('page')
  })

  it('cascades subjectId change by removing topicId and subtopicId from the URL', async () => {
    const user = userEvent.setup()
    renderBar({}, { topicId: 't1', subtopicId: 'st1' })
    await user.selectOptions(screen.getByLabelText('subjectId-select'), 's1')
    const url: string = mockReplace.mock.calls[0]?.[0]
    expect(url).not.toContain('topicId')
    expect(url).not.toContain('subtopicId')
    expect(url).toContain('subjectId=s1')
  })
})
