/** First letters of the first two words, upper-case; an email yields one letter; empty yields '?'. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1 || words[0]?.includes('@')) return (words[0]?.[0] ?? '?').toUpperCase()
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
}

function UserChipPlaceholder() {
  return (
    <div className="flex items-center gap-1 rounded-xl px-1 py-2">
      <span aria-hidden="true" className="size-7 shrink-0 rounded-full bg-muted" />
      <span aria-hidden="true" className="h-3 w-20 rounded bg-muted" />
      <span className="sr-only">Loading account</span>
    </div>
  )
}

export function UserChip({ displayName }: Readonly<{ displayName: string | null }>) {
  if (displayName === null) return <UserChipPlaceholder />
  return (
    <div className="flex items-center gap-1 rounded-xl px-1 py-2">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-overline tracking-normal font-semibold text-muted-foreground"
      >
        {initials(displayName)}
      </span>
      <span className="min-w-0 truncate text-caption font-medium">{displayName}</span>
    </div>
  )
}
