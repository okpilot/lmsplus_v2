import { getSyllabusTree } from '../../syllabus/queries'
import { getQuestionsList } from '../queries'
import type { QuestionFilters } from '../types'
import { QuestionsPageShell } from './questions-page-shell'

type Props = { filters: QuestionFilters }

export async function QuestionsContent({ filters }: Readonly<Props>) {
  const [questions, tree] = await Promise.all([getQuestionsList(filters), getSyllabusTree()])
  return <QuestionsPageShell questions={questions} tree={tree} filters={filters} />
}
