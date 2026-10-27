import { redirect } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getSyllabusTree } from '../../syllabus/queries'
import { getQuestionsList, PAGE_SIZE } from '../queries'
import type { QuestionFilters } from '../types'
import { QuestionsPageShell } from './questions-page-shell'

type Props = { filters: QuestionFilters }

export async function QuestionsContent({ filters }: Readonly<Props>) {
  const [result, tree] = await Promise.all([getQuestionsList(filters), getSyllabusTree()])

  if (!result.ok) {
    return (
      <Alert tone="danger">
        <AlertDescription>Failed to load questions. Please try again.</AlertDescription>
      </Alert>
    )
  }

  const page = filters.page ?? 1
  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE))
  if (page > totalPages) {
    // KEEP IN SYNC WITH QuestionFilters — add, rename, or remove fields here to preserve them on redirect
    const params = new URLSearchParams()
    if (filters.subjectId) params.set('subjectId', filters.subjectId)
    if (filters.topicId) params.set('topicId', filters.topicId)
    if (filters.subtopicId) params.set('subtopicId', filters.subtopicId)
    if (filters.status) params.set('status', filters.status)
    if (filters.hasCalculations !== undefined)
      params.set('hasCalculations', String(filters.hasCalculations))
    if (filters.search) params.set('search', filters.search)
    if (totalPages > 1) params.set('page', String(totalPages))
    redirect(`/app/admin/questions?${params.toString()}`)
  }

  return (
    <QuestionsPageShell
      questions={result.questions}
      tree={tree}
      filters={filters}
      page={page}
      totalCount={result.totalCount}
      pageSize={PAGE_SIZE}
    />
  )
}
