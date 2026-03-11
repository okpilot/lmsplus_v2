import { getDueCards } from '@/lib/queries/review'
import { ReviewExplainer } from './_components/review-explainer'
import { StartReviewButton } from './_components/start-review-button'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const dueCards = await getDueCards(20)

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
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums">{dueCards.length}</p>
          <p className="text-xs text-muted-foreground">Due for review</p>
        </div>
        <div className="mt-4">
          <StartReviewButton disabled={dueCards.length === 0} />
        </div>
      </div>
    </main>
  )
}
