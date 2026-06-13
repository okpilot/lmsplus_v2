import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

// Stub heavy child components so tests focus on QuestionTable's own behaviour.
vi.mock('./question-form-dialog', () => ({
  QuestionFormDialog: ({ question }: { question: { id: string } }) => (
    <button type="button" data-testid={`edit-dialog-${question.id}`}>
      Edit
    </button>
  ),
}))

vi.mock('./delete-question-button', () => ({
  DeleteQuestionButton: ({ id }: { id: string }) => (
    <button type="button" data-testid={`delete-btn-${id}`}>
      Delete
    </button>
  ),
}))

// ---- Subject under test ----------------------------------------------------

import { QuestionTable } from './question-table'

// ---- Fixtures --------------------------------------------------------------

import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionRow } from '../types'

const TREE: SyllabusTree = [
  {
    id: 'subj-1',
    code: '050',
    name: 'Meteorology',
    short: 'MET',
    sort_order: 1,
    questionCount: 10,
    topics: [],
  },
]

function makeQuestion(overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id: 'q-1',
    question_number: 'Q001',
    question_text: 'What is the atmosphere?',
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
    explanation_text: 'The atmosphere is a layer of gases.',
    question_image_url: null,
    explanation_image_url: null,
    lo_reference: null,
    has_calculations: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

const DEFAULT_PROPS = {
  tree: TREE,
  selectedIds: [] as string[],
  onToggleSelect: vi.fn(),
  onToggleAll: vi.fn(),
}

// ---- Tests -----------------------------------------------------------------

describe('QuestionTable', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders one table row per question', () => {
    const questions = [
      makeQuestion({ id: 'q-1', question_number: 'Q001' }),
      makeQuestion({ id: 'q-2', question_number: 'Q002' }),
      makeQuestion({ id: 'q-3', question_number: 'Q003' }),
    ]
    render(<QuestionTable questions={questions} {...DEFAULT_PROPS} />)

    // Each question gets its own edit and delete stub — check for all three.
    expect(screen.getByTestId('edit-dialog-q-1')).toBeInTheDocument()
    expect(screen.getByTestId('edit-dialog-q-2')).toBeInTheDocument()
    expect(screen.getByTestId('edit-dialog-q-3')).toBeInTheDocument()
  })

  it('keeps the full question text in the DOM and exposes it via a title tooltip', () => {
    // Visual overflow is handled by the CSS `truncate` class (not measurable in jsdom);
    // the full text must stay in the DOM and be surfaced on hover via `title`.
    const longText = `ZZZZZ_UNIQUE_${'Z'.repeat(200)}`
    const question = makeQuestion({ question_text: longText })
    render(<QuestionTable questions={[question]} {...DEFAULT_PROPS} />)

    const textEl = screen.getByText(longText)
    expect(textEl).toBeInTheDocument()
    expect(textEl).toHaveAttribute('title', longText)
  })

  it('displays the status badge', () => {
    const question = makeQuestion({ status: 'draft' })
    render(<QuestionTable questions={[question]} {...DEFAULT_PROPS} />)

    expect(screen.getByText('draft')).toBeInTheDocument()
  })

  it('shows a calc badge when the question involves calculations', () => {
    const question = makeQuestion({ has_calculations: true })
    render(<QuestionTable questions={[question]} {...DEFAULT_PROPS} />)

    expect(screen.getByText('calc')).toBeInTheDocument()
  })

  it('does not show a calc badge when the question has no calculations', () => {
    const question = makeQuestion({ has_calculations: false })
    render(<QuestionTable questions={[question]} {...DEFAULT_PROPS} />)

    expect(screen.queryByText('calc')).not.toBeInTheDocument()
  })

  it('displays the subject code from the joined subject relation', () => {
    const question = makeQuestion({ subject: { code: '062', name: 'Radio Navigation' } })
    render(<QuestionTable questions={[question]} {...DEFAULT_PROPS} />)

    expect(screen.getByText('062')).toBeInTheDocument()
  })

  it('renders an em dash when subject is null', () => {
    const question = makeQuestion({ subject: null })
    render(<QuestionTable questions={[question]} {...DEFAULT_PROPS} />)

    // At least one em dash cell should be present.
    const dashes = screen.getAllByText('\u2014')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('renders an empty table body when the questions array is empty', () => {
    render(<QuestionTable questions={[]} {...DEFAULT_PROPS} />)

    // No edit or delete stubs should be present.
    expect(screen.queryByTestId(/^edit-dialog-/)).not.toBeInTheDocument()
    expect(screen.queryByTestId(/^delete-btn-/)).not.toBeInTheDocument()
  })

  it('renders the formatted updated_at date for each question', () => {
    const question = makeQuestion({ updated_at: '2026-03-15T00:00:00Z' })
    render(<QuestionTable questions={[question]} {...DEFAULT_PROPS} />)

    // en-GB locale: "15 Mar 2026"
    expect(screen.getByText('15 Mar 2026')).toBeInTheDocument()
  })

  it('marks the select-all checkbox as checked when all questions are selected', () => {
    const questions = [makeQuestion({ id: 'q-1' }), makeQuestion({ id: 'q-2' })]
    render(<QuestionTable questions={questions} {...DEFAULT_PROPS} selectedIds={['q-1', 'q-2']} />)

    const selectAllCheckbox = screen.getByRole('checkbox', { name: 'Select all questions' })
    expect(selectAllCheckbox).toBeChecked()
  })

  it('marks the select-all checkbox as unchecked when no questions are selected', () => {
    const questions = [makeQuestion({ id: 'q-1' })]
    render(<QuestionTable questions={questions} {...DEFAULT_PROPS} selectedIds={[]} />)

    const selectAllCheckbox = screen.getByRole('checkbox', { name: 'Select all questions' })
    expect(selectAllCheckbox).not.toBeChecked()
  })
})
