import { Skeleton } from '@/components/ui/skeleton'

export default function QuizLoading() {
  return (
    <main className="space-y-6">
      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
    </main>
  )
}
