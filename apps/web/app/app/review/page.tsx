import { getDueCards, getNewQuestionIds } from '@/lib/queries/review'
import { StartReviewButton } from './_components/start-review-button'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const dueCards = await getDueCards(20)
  const newIds = dueCards.length < 10 ? await getNewQuestionIds(20 - dueCards.length) : []
  const totalAvailable = dueCards.length + newIds.length

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Smart Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          FSRS-powered spaced repetition. Review due cards and learn new questions.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums">{dueCards.length}</p>
            <p className="text-xs text-muted-foreground">Due for review</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums">{newIds.length}</p>
            <p className="text-xs text-muted-foreground">New questions</p>
          </div>
        </div>
        <div className="mt-4">
          <StartReviewButton disabled={totalAvailable === 0} />
        </div>
      </div>
    </main>
  )
}
