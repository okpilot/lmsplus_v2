'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionFilters, QuestionRow } from '../types'
import { QuestionFiltersBar } from './question-filters'
import { QuestionFormDialog } from './question-form-dialog'
import { QuestionTable } from './question-table'

type Props = {
  questions: QuestionRow[]
  tree: SyllabusTree
  filters: QuestionFilters
}

export function QuestionsPageShell({ questions, tree, filters }: Props) {
  return (
    <div className="space-y-4">
      <QuestionFiltersBar tree={tree} filters={filters} />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {questions.length} question{questions.length !== 1 ? 's' : ''}
          {questions.length === 100 ? ' (limit reached)' : ''}
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
        <QuestionTable questions={questions} tree={tree} />
      )}
    </div>
  )
}
