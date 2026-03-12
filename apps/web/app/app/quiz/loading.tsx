import { Skeleton } from '@/components/ui/skeleton'

export default function QuizLoading() {
  return (
    <main className="space-y-6">
      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    </main>
  )
}
