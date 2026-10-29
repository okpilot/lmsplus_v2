import { buttonVariants } from '@/components/ui/button-variants'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const NAV_PLACEHOLDER_CLASS = cn(
  buttonVariants({ variant: 'outline' }),
  'pointer-events-none text-muted-foreground',
)
const OPTION_PLACEHOLDER_KEYS = ['a', 'b', 'c', 'd'] as const

export default function QuizSessionLoading() {
  return (
    <main aria-busy="true" className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-label leading-8 text-muted-foreground">Loading questions…</span>
      </div>
      <div className="px-4 pt-4 pb-32 md:px-8 md:pb-24">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-24 w-full rounded-card" />
          {OPTION_PLACEHOLDER_KEYS.map((key) => (
            <Skeleton key={key} className="h-12 w-full rounded-control" />
          ))}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-background px-4 pb-(--safe-bottom) md:px-8"
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between py-3">
            <span className={NAV_PLACEHOLDER_CLASS}>‹ Previous</span>
            <span className={NAV_PLACEHOLDER_CLASS}>Next ›</span>
          </div>
        </div>
      </div>
    </main>
  )
}
