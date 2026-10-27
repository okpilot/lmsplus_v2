import { Skeleton } from '@/components/ui/skeleton'

export function InternalExamsFallback() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  )
}
