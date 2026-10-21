'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PaginationBar } from '../../../_components/pagination-bar'
import type { SyllabusTree } from '../../syllabus/types'
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
  const scope = JSON.stringify({ ...filters, page })
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({
    scope,
    ids: [],
  })
  const selectedIds = selection.scope === scope ? selection.ids : []

  function handleToggleSelect(id: string) {
    setSelection((prev) => {
      const ids = prev.scope === scope ? prev.ids : []
      return { scope, ids: ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id] }
    })
  }

  function handleToggleAll() {
    setSelection((prev) => {
      const ids = prev.scope === scope ? prev.ids : []
      return { scope, ids: ids.length === questions.length ? [] : questions.map((q) => q.id) }
    })
  }

  return (
    <div className="space-y-4">
      <QuestionFiltersBar tree={tree} filters={filters} />

      <BulkActionsBar selectedIds={selectedIds} onClear={() => setSelection({ scope, ids: [] })} />

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
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No questions found. Adjust filters or create a new question.
          </p>
        </div>
      ) : (
        <QuestionTable
          questions={questions}
          tree={tree}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleAll={handleToggleAll}
        />
      )}

      <PaginationBar page={page} totalCount={totalCount} pageSize={pageSize} />
    </div>
  )
}
