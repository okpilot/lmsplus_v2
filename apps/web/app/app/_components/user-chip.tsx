/** First letters of the first two words, upper-case; an email yields one letter; empty yields '?'. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1 || words[0]?.includes('@')) return (words[0]?.[0] ?? '?').toUpperCase()
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
}

export function UserChip({ displayName }: Readonly<{ displayName: string }>) {
  return (
    <div className="flex items-center gap-1 rounded-xl px-1 py-2">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background"
      >
        {initials(displayName)}
      </span>
      <span className="min-w-0 truncate text-[13px] font-medium">{displayName}</span>
    </div>
  )
}
