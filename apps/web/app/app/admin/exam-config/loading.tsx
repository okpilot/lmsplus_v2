export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  )
}
