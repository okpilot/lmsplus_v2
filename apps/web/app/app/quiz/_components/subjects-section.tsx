import { getSubjectsWithCounts } from '@/lib/queries/quiz'
import { QuizConfigForm } from './quiz-config-form'

export async function SubjectsSection() {
  const subjects = await getSubjectsWithCounts()
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <QuizConfigForm subjects={subjects} />
    </div>
  )
}
