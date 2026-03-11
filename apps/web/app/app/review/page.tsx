import { getSubjectsWithCounts } from '@/lib/queries/quiz'
import { getDueCards } from '@/lib/queries/review'
import { ReviewConfigForm } from './_components/review-config-form'
import { ReviewExplainer } from './_components/review-explainer'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const [dueCards, subjects] = await Promise.all([getDueCards(), getSubjectsWithCounts()])

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Smart Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          FSRS-powered spaced repetition. Review your previously answered questions.
        </p>
      </div>

      <ReviewExplainer />

      <div className="rounded-lg border border-border bg-card p-6">
        <ReviewConfigForm subjects={subjects} dueCount={dueCards.length} />
      </div>
    </main>
  )
}
