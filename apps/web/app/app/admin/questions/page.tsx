import { getSyllabusTree } from '../syllabus/queries'
import { QuestionsPageShell } from './_components/questions-page-shell'
import { getQuestionsList } from './queries'
import type { QuestionFilters } from './types'

function parseFilters(params: Record<string, string | string[] | undefined>): QuestionFilters {
  return {
    subjectId: typeof params.subjectId === 'string' ? params.subjectId : undefined,
    topicId: typeof params.topicId === 'string' ? params.topicId : undefined,
    subtopicId: typeof params.subtopicId === 'string' ? params.subtopicId : undefined,
    difficulty:
      typeof params.difficulty === 'string'
        ? (params.difficulty as QuestionFilters['difficulty'])
        : undefined,
    status:
      typeof params.status === 'string' ? (params.status as QuestionFilters['status']) : undefined,
    search: typeof params.search === 'string' ? params.search.trim() || undefined : undefined,
  }
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function QuestionsPage({ searchParams }: PageProps) {
  const filters = parseFilters(await searchParams)
  const [questions, tree] = await Promise.all([getQuestionsList(filters), getSyllabusTree()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Question Editor</h1>
        <p className="text-sm text-muted-foreground">
          Manage questions in the EASA PPL question bank.
        </p>
      </div>
      <QuestionsPageShell questions={questions} tree={tree} filters={filters} />
    </div>
  )
}
