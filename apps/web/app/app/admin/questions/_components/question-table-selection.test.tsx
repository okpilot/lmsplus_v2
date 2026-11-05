import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./question-form-dialog', () => ({ QuestionFormDialog: () => null }))
vi.mock('./delete-question-button', () => ({ DeleteQuestionButton: () => null }))

import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionRow } from '../types'
import { QuestionTable } from './question-table'

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
    explanation_text: 'x',
    question_image_url: null,
    explanation_image_url: null,
    lo_reference: null,
    has_calculations: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  } as QuestionRow
}

const QUESTIONS = [makeQuestion('q-1', 'Q001'), makeQuestion('q-2', 'Q002')]

function renderTable(selectedIds: string[], onToggleSelect = vi.fn(), onToggleAll = vi.fn()) {
  render(
    <QuestionTable
      questions={QUESTIONS}
      tree={TREE}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      onToggleAll={onToggleAll}
    />,
  )
  return { onToggleSelect, onToggleAll }
}

function rowOf(number: string) {
  const row = screen.getByRole('checkbox', { name: `Select question ${number}` }).closest('tr')
  if (!row) throw new Error('row not found')
  return row
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('QuestionTable selection', () => {
  it('marks a selected row with data-state="selected" and leaves unselected rows without data-state', () => {
    renderTable(['q-1'])
    expect(rowOf('Q001')).toHaveAttribute('data-state', 'selected')
    expect(rowOf('Q002')).not.toHaveAttribute('data-state')
  })

  it('calls onToggleSelect with exactly the row id when a row checkbox is clicked', async () => {
    const { onToggleSelect } = renderTable([])
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select question Q002' }))
    expect(onToggleSelect).toHaveBeenCalledTimes(1)
    expect(onToggleSelect.mock.calls[0]).toEqual(['q-2'])
  })

  it('calls onToggleAll with no arguments when the header checkbox is clicked', async () => {
    const { onToggleAll } = renderTable([])
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all questions' }))
    expect(onToggleAll).toHaveBeenCalledTimes(1)
    expect(onToggleAll.mock.calls[0]).toEqual([])
  })

  it('checks the header checkbox when every question is selected', () => {
    renderTable(['q-1', 'q-2'])
    expect(screen.getByRole('checkbox', { name: 'Select all questions' })).toBeChecked()
  })

  it('leaves the header checkbox unchecked when only some questions are selected', () => {
    renderTable(['q-1'])
    expect(screen.getByRole('checkbox', { name: 'Select question Q001' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select all questions' })).not.toBeChecked()
  })
})
