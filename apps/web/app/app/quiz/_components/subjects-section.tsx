import { getSubjectsWithCounts } from '@/lib/queries/quiz'
import { QuizConfigForm } from './quiz-config-form'

export async function SubjectsSection() {
  const subjects = await getSubjectsWithCounts()
  return <QuizConfigForm subjects={subjects} />
}
