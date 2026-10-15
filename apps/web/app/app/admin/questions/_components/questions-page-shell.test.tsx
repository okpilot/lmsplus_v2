import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../_components/pagination-bar', () => ({ PaginationBar: () => null }))
vi.mock('./bulk-actions-bar', () => ({ BulkActionsBar: () => null }))
vi.mock('./question-filters', () => ({ QuestionFiltersBar: () => <div /> }))
vi.mock('./question-form-dialog', () => ({ QuestionFormDialog: () => null }))
vi.mock('./question-table', () => ({ QuestionTable: () => <div /> }))

import { QuestionsPageShell } from './questions-page-shell'

describe('QuestionsPageShell', () => {
  it('shows the no-results message in the shared empty part', () => {
    const { container } = render(
      <QuestionsPageShell
        questions={[]}
        tree={[]}
        filters={{}}
        page={1}
        totalCount={0}
        pageSize={25}
      />,
    )
    expect(container.querySelector('[data-slot="empty"]')).toHaveTextContent(
      'No questions found. Adjust filters or create a new question.',
    )
  })
})
