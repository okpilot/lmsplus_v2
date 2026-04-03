import { getSyllabusTree } from '../../syllabus/queries'
import { getQuestionsList, PAGE_SIZE } from '../queries'
import type { QuestionFilters } from '../types'
import { QuestionsPageShell } from './questions-page-shell'

type Props = { filters: QuestionFilters }

export async function QuestionsContent({ filters }: Readonly<Props>) {
  const [result, tree] = await Promise.all([getQuestionsList(filters), getSyllabusTree()])

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/50 p-8 text-center">
        <p className="text-sm text-destructive">Failed to load questions. Please try again.</p>
      </div>
    )
  }

  return (
    <QuestionsPageShell
      questions={result.questions}
      tree={tree}
      filters={filters}
      page={filters.page ?? 1}
      totalCount={result.totalCount}
      pageSize={PAGE_SIZE}
    />
  )
}
