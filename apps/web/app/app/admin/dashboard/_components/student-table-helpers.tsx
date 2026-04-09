import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import { getMasteryColor } from '../_lib/constants'
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

export function StudentRow({ student, onClick }: StudentRowProps) {
  return (
    <TableRow
      className={`cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring${student.isActive ? '' : ' opacity-60'}`}
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
            <span
              className="size-2 shrink-0 rounded-full bg-green-500"
              title="Active in last 7 days"
            />
          )}
          <span className="font-medium">{student.fullName ?? '\u2014'}</span>
        </div>
        <div className="text-xs text-muted-foreground">{student.email}</div>
      </TableCell>
      <TableCell>{formatRelativeTime(student.lastActiveAt)}</TableCell>
      <TableCell>{student.sessionCount}</TableCell>
      <TableCell>{student.avgScore !== null ? `${student.avgScore}%` : '\u2014'}</TableCell>
      <TableCell className={getMasteryColor(student.mastery)}>{student.mastery}%</TableCell>
      <TableCell>
        {student.isActive ? (
          <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>
        ) : (
          <Badge variant="destructive">Inactive</Badge>
        )}
      </TableCell>
    </TableRow>
  )
}
