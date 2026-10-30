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
          tabs={<Skeleton className="h-10 w-full rounded-control" />}
          question={
            <>
              <Skeleton className="h-24 w-full rounded-card" />
              <Skeleton className="h-12 w-full rounded-control" />
              <Skeleton className="h-12 w-full rounded-control" />
              <Skeleton className="h-12 w-full rounded-control" />
              <Skeleton className="h-12 w-full rounded-control" />
            </>
          }
          panel={<Skeleton className="h-48 w-full rounded-control" />}
        />
      </div>
    </main>
  )
}
