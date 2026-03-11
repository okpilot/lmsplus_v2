import { getSubjectsWithCounts } from '@/lib/queries/quiz'
import { QuizConfigForm } from './_components/quiz-config-form'

export const dynamic = 'force-dynamic'

export default async function QuizPage() {
  const subjects = await getSubjectsWithCounts()

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Test your knowledge with a randomized quiz on any subject.
        </p>
      </div>

      <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6">
        <QuizConfigForm subjects={subjects} />
      </div>
    </main>
  )
}
