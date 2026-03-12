import { getSubjectsWithCounts } from '@/lib/queries/quiz'
import { QuizConfigForm } from './_components/quiz-config-form'
import { ResumeDraftBanner } from './_components/resume-draft-banner'
import { loadDraft } from './actions/draft'

export const dynamic = 'force-dynamic'

export default async function QuizPage() {
  const [subjects, { draft }] = await Promise.all([getSubjectsWithCounts(), loadDraft()])

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Test your knowledge with a randomized quiz on any subject.
        </p>
      </div>

      {draft && <ResumeDraftBanner draft={draft} />}

      <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6">
        <QuizConfigForm subjects={subjects} />
      </div>
    </main>
  )
}
