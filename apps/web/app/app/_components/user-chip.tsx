import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/lib/utils/initials'

function UserChipPlaceholder() {
  return (
    <div className="flex items-center gap-1 rounded-card px-1 py-2">
      <Avatar size="sm" aria-hidden="true" />
      <span aria-hidden="true" className="h-3 w-20 rounded-control bg-muted" />
      <span className="sr-only">Loading account</span>
    </div>
  )
}

export function UserChip({ displayName }: Readonly<{ displayName: string | null }>) {
  if (displayName === null) return <UserChipPlaceholder />
  return (
    <div className="flex items-center gap-1 rounded-card px-1 py-2">
      <Avatar size="sm" aria-hidden="true">
        <AvatarFallback>{initials(displayName)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate text-caption-strong">{displayName}</span>
    </div>
  )
}
