import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { masteryTextClass } from '@/lib/utils/mastery-tone'
import type { DashboardStudent } from '../types'

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return 'Never'
  const diff = Math.max(0, Date.now() - ts)
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`
}

type StudentRowProps = Readonly<{
  student: DashboardStudent
  onClick: () => void
}>

export function StudentRow({ student, onClick }: Readonly<StudentRowProps>) {
  return (
    <TableRow
      className={`cursor-pointer focus-visible:outline focus-visible:outline-focus focus-visible:-outline-offset-focus focus-visible:outline-ring${student.isActive ? '' : ' text-muted-foreground'}`}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <TableCell>
        <div className="flex items-center gap-1.5">
          {student.hasRecentActivity && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    role="img"
                    aria-label="Active in last 7 days"
                    className="size-2 shrink-0 rounded-pill bg-success"
                  />
                }
              />
              <TooltipContent>Active in last 7 days</TooltipContent>
            </Tooltip>
          )}
          <span className="font-medium">{student.fullName ?? '\u2014'}</span>
        </div>
        <div className="text-caption text-muted-foreground">{student.email}</div>
      </TableCell>
      <TableCell suppressHydrationWarning>{formatRelativeTime(student.lastActiveAt)}</TableCell>
      <TableCell>{student.sessionCount}</TableCell>
      <TableCell>{student.avgScore !== null ? `${student.avgScore}%` : '\u2014'}</TableCell>
      <TableCell className={student.isActive ? masteryTextClass(student.mastery) : undefined}>
        {student.mastery}%
      </TableCell>
      <TableCell>
        {student.isActive ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="neutral">Inactive</Badge>
        )}
      </TableCell>
    </TableRow>
  )
}
