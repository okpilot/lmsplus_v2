import { getSubjectsWithCounts } from '@/lib/queries/quiz'
import { QuizConfigForm } from './quiz-config-form'

export async function SubjectsSection({ userId }: { userId: string }) {
  const subjects = await getSubjectsWithCounts()
  return <QuizConfigForm userId={userId} subjects={subjects} />
}
