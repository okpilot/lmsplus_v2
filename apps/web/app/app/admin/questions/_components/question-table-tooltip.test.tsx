import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./question-form-dialog', () => ({
  QuestionFormDialog: ({ trigger }: { trigger: React.ReactElement }) => trigger,
}))
vi.mock('./delete-question-button', () => ({ DeleteQuestionButton: () => null }))

import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionRow } from '../types'
import { QuestionTable } from './question-table'

const TREE: SyllabusTree = []
const LONG = `ZZZZZ_UNIQUE_${'Z'.repeat(200)}`

function q(over: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id: 'q-1',
    question_number: 'Q001',
    question_text: 'What is the atmosphere?',
    difficulty: 'medium',
    status: 'active',
    ...over,
  } as QuestionRow
}

function renderTable(row: QuestionRow) {
  return render(
    <QuestionTable
      questions={[row]}
      tree={TREE}
      selectedIds={[]}
      onToggleSelect={vi.fn()}
      onToggleAll={vi.fn()}
    />,
  )
}

describe('QuestionTable tooltips', () => {
  it('keeps the long text truncated in the DOM with no title attribute', () => {
    renderTable(q({ question_text: LONG }))
    const el = screen.getByText(LONG)
    expect(el).not.toHaveAttribute('title')
    expect(el.className).toContain('truncate')
  })

  it('shows the full question text in a tooltip on hover', async () => {
    renderTable(q({ question_text: LONG }))
    await userEvent.setup().hover(screen.getByText(LONG))
    const tip = await screen.findByRole('tooltip', {}, { timeout: 1500 })
    expect(tip).toHaveTextContent(LONG)
  })

  it('shows "Edit question" tooltip on hover of the edit trigger', async () => {
    renderTable(q())
    const btn = screen.getByRole('button', { name: 'Edit question' })
    await userEvent.setup().hover(btn)
    const tip = await screen.findByRole('tooltip', {}, { timeout: 1500 })
    expect(tip).toHaveTextContent('Edit question')
  })
})
