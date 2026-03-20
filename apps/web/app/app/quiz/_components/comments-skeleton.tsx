export function CommentsSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <div className="flex gap-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}
