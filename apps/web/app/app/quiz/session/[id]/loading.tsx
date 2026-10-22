import { Skeleton } from '@/components/ui/skeleton'

const OPTION_PLACEHOLDER_KEYS = ['a', 'b', 'c', 'd'] as const
const NAV_LABEL_CLASS =
  'rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground'

export default function QuizSessionLoading() {
  return (
    <div aria-busy="true" data-session-frame="" className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span role="status" className="text-sm font-medium text-muted-foreground">
          Loading quiz…
        </span>
      </div>
      <div className="px-4 pt-4 pb-32 md:px-8 md:pb-24">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          {OPTION_PLACEHOLDER_KEYS.map((key) => (
            <Skeleton key={key} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-4 pb-[env(safe-area-inset-bottom)] md:px-8"
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between py-3">
            <span className={NAV_LABEL_CLASS}>‹ Previous</span>
            <span className={NAV_LABEL_CLASS}>Next ›</span>
          </div>
        </div>
      </div>
    </div>
  )
}
