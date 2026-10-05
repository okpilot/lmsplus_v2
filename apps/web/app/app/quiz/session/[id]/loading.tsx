import { Skeleton } from '@/components/ui/skeleton'

export default function QuizSessionLoading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-2xl space-y-6">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-20 w-full rounded-md" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  )
}
