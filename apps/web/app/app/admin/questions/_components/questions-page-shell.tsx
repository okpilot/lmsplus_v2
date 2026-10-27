'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { PaginationBar } from '../../../_components/pagination-bar'
import type { SyllabusTree } from '../../syllabus/types'
import { useScopedSelection } from '../_hooks/use-scoped-selection'
import type { QuestionFilters, QuestionRow } from '../types'
import { BulkActionsBar } from './bulk-actions-bar'
import { QuestionFiltersBar } from './question-filters'
import { QuestionFormDialog } from './question-form-dialog'
import { QuestionTable } from './question-table'

type Props = {
  questions: QuestionRow[]
  tree: SyllabusTree
  filters: QuestionFilters
  page: number
  totalCount: number
  pageSize: number
}

export function QuestionsPageShell({
  questions,
  tree,
  filters,
  page,
  totalCount,
  pageSize,
}: Readonly<Props>) {
  const { selectedIds, toggle, toggleAll, clear } = useScopedSelection(
    JSON.stringify({ ...filters, page }),
    questions.map((q) => q.id),
  )

  return (
    <div className="space-y-4">
      <QuestionFiltersBar tree={tree} filters={filters} />

      <BulkActionsBar selectedIds={selectedIds} onClear={clear} />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {totalCount} question{totalCount === 1 ? '' : 's'}
        </p>
        <QuestionFormDialog
          tree={tree}
          trigger={
            <Button size="sm">
              <Plus className="mr-1.5 size-4" />
              New Question
            </Button>
          }
        />
      </div>

      {questions.length === 0 ? (
        <Empty>
          <EmptyDescription>
            No questions found. Adjust filters or create a new question.
          </EmptyDescription>
        </Empty>
      ) : (
        <QuestionTable
          questions={questions}
          tree={tree}
          selectedIds={selectedIds}
          onToggleSelect={toggle}
          onToggleAll={toggleAll}
        />
      )}

      <PaginationBar page={page} totalCount={totalCount} pageSize={pageSize} />
    </div>
  )
}
