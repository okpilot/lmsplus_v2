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
    </div>
  )
}
