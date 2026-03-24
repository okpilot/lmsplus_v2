'use client'

import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionFilters, QuestionRow } from '../types'
import { QuestionFiltersBar } from './question-filters'
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
      {questions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No questions found. Adjust filters or create a new question.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            {questions.length} question{questions.length !== 1 ? 's' : ''}
            {questions.length === 100 ? ' (limit reached)' : ''}
          </p>
          <QuestionTable questions={questions} />
        </div>
      )}
    </div>
  )
}
