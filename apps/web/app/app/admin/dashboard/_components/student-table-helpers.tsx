import { Badge } from '@/components/ui/badge'
import { TableCell, TableHead, TableRow } from '@/components/ui/table'
import type { DashboardFilters, DashboardStudent } from '../types'

export type SortField = DashboardFilters['sort']

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`
}

export function masteryColor(mastery: number): string {
  if (mastery >= 80) return 'text-green-600'
  if (mastery >= 50) return 'text-amber-600'
  return 'text-red-600'
}

type SortableHeadProps = {
  field: SortField
  label: string
  activeSort: SortField
  activeDir: 'asc' | 'desc'
  onSort: (field: SortField) => void
}

export function SortableHead({ field, label, activeSort, activeDir, onSort }: SortableHeadProps) {
  const indicator = activeSort === field ? (activeDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''
  return (
    <TableHead className="cursor-pointer select-none" onClick={() => onSort(field)}>
      {label}
      {indicator}
    </TableHead>
  )
}

type StudentRowProps = Readonly<{
  student: DashboardStudent
  onClick: () => void
}>

export function StudentRow({ student, onClick }: StudentRowProps) {
  return (
    <TableRow className="cursor-pointer" onClick={onClick}>
      <TableCell>
        <div className="font-medium">{student.fullName ?? '\u2014'}</div>
        <div className="text-xs text-muted-foreground">{student.email}</div>
      </TableCell>
      <TableCell>{formatRelativeTime(student.lastActiveAt)}</TableCell>
      <TableCell>{student.sessionCount}</TableCell>
      <TableCell>{student.avgScore !== null ? `${student.avgScore}%` : '\u2014'}</TableCell>
      <TableCell className={masteryColor(student.mastery)}>{student.mastery}%</TableCell>
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
