import Link from 'next/link'

export function QuickActions() {
  return (
    <div className="flex gap-3">
      <Link
        href="/app/quiz"
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Start Quiz
      </Link>
      <Link
        href="/app/review"
        className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
      >
        Start Review
      </Link>
    </div>
  )
}
