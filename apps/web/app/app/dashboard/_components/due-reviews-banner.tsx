import Link from 'next/link'

type DueReviewsBannerProps = {
  dueCount: number
}

export function DueReviewsBanner({ dueCount }: DueReviewsBannerProps) {
  if (dueCount === 0) {
    return (
      <div className="rounded-lg border border-border bg-accent/30 p-4">
        <p className="text-sm font-medium text-accent-foreground">
          You're all caught up! No reviews due right now.
        </p>
      </div>
    )
  }

  return (
    <Link
      href="/app/review"
      className="block rounded-lg border border-primary/20 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            {dueCount} {dueCount === 1 ? 'review' : 'reviews'} due
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Start a Smart Review session to strengthen your memory
          </p>
        </div>
        <span className="text-sm font-medium text-primary">Start Review →</span>
      </div>
    </Link>
  )
}
