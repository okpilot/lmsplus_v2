import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

vi.mock('../actions/bulk-update-status', () => ({ bulkUpdateStatus: vi.fn() }))
vi.mock('../actions/bulk-update-calculations', () => ({ bulkUpdateCalculations: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./question-filters', () => ({ QuestionFiltersBar: () => null }))
vi.mock('./question-form-dialog', () => ({ QuestionFormDialog: () => null }))
vi.mock('./delete-question-button', () => ({ DeleteQuestionButton: () => null }))
vi.mock('../../../_components/pagination-bar', () => ({ PaginationBar: () => null }))

// ---- Subject under test ----------------------------------------------------

import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionFilters, QuestionRow } from '../types'
import { QuestionsPageShell } from './questions-page-shell'

// ---- Fixtures --------------------------------------------------------------

const TREE: SyllabusTree = []

function makeQuestion(id: string, number: string): QuestionRow {
  return {
    id,
    question_number: number,
    question_text: `Text ${number}`,
    difficulty: 'medium',
    status: 'active',
    subject_id: 'subj-1',
    topic_id: 'topic-1',
    subtopic_id: null,
    subject: { code: '050', name: 'Meteorology' },
    topic: { name: 'The Atmosphere' },
    subtopic: null,
    options: [],
    correct_option_id: null,
    explanation_text: 'Explanation',
    question_image_url: null,
    explanation_image_url: null,
    lo_reference: null,
    has_calculations: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  }
}

const QUESTIONS = [makeQuestion('a', 'QA'), makeQuestion('b', 'QB'), makeQuestion('c', 'QC')]

function shell(filters: QuestionFilters, page: number) {
  return (
    <QuestionsPageShell
      questions={QUESTIONS}
      tree={TREE}
      filters={filters}
      page={page}
      totalCount={3}
      pageSize={25}
    />
  )
}

function row(number: string) {
  return screen.getByRole('checkbox', { name: `Select question ${number}` })
}

describe('QuestionsPageShell bulk selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears the selection when the filters change', async () => {
    const user = userEvent.setup()
    const { rerender } = render(shell({ status: 'active' }, 1))
    await user.click(row('QA'))
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    rerender(shell({ status: 'draft' }, 1))

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    expect(row('QA')).not.toBeChecked()
  })

  it('clears the selection when the page changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(shell({ status: 'active' }, 1))
    await user.click(row('QA'))
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    rerender(shell({ status: 'active' }, 2))

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    expect(row('QA')).not.toBeChecked()
  })

  it('keeps the selection when the same filters and page are re-rendered', async () => {
    const user = userEvent.setup()
    const { rerender } = render(shell({ status: 'active' }, 1))
    await user.click(row('QA'))

    rerender(shell({ status: 'active' }, 1))

    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(row('QA')).toBeChecked()
  })

  it('selects only the toggled row after a filter change', async () => {
    const user = userEvent.setup()
    const { rerender } = render(shell({ status: 'active' }, 1))
    await user.click(row('QA'))
    await user.click(row('QB'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    rerender(shell({ status: 'draft' }, 1))
    await user.click(row('QC'))

    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(row('QC')).toBeChecked()
    expect(row('QA')).not.toBeChecked()
    expect(row('QB')).not.toBeChecked()
  })
})
