import { Skeleton } from '@/components/ui/skeleton'
import { QuizSessionLayout } from '../_components/quiz-session-layout'

export default function QuizSessionLoading() {
  return (
    <main aria-busy="true" className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-gutter py-2">
        <span className="text-label leading-8 text-muted-foreground">Loading questions…</span>
      </div>
      <div className="px-gutter py-section">
        <QuizSessionLayout
          tabs={
            <div className="lg:hidden">
              <Skeleton className="h-skeleton-row w-full rounded-control" />
            </div>
          }
          question={
            <>
              <Skeleton className="h-skeleton-card w-full rounded-card" />
              <Skeleton className="h-skeleton-row w-full rounded-control" />
              <Skeleton className="h-skeleton-row w-full rounded-control" />
              <Skeleton className="h-skeleton-row w-full rounded-control" />
              <Skeleton className="h-skeleton-row w-full rounded-control" />
            </>
          }
          panel={<Skeleton className="h-skeleton-card-lg w-full rounded-control" />}
        />
      </div>
    </main>
  )
}
