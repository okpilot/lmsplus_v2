'use client'

import { Download, Pencil, UserCheck, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatUtc } from '@/lib/utils/format-utc'
import type { CourseOption, GroupOption, StudentRow } from '../types'
import { isSelectableStudent } from './is-selectable-student'
import { LoginInstructionsCell } from './login-instructions-cell'

type RowActions = {
  onEdit: (student: StudentRow) => void
  onToggleStatus: (student: StudentRow) => void
  onExport: (student: StudentRow) => void
}

type Props = RowActions & {
  students: StudentRow[]
  courses: CourseOption[]
  groups: GroupOption[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onToggleAll: () => void
}

function roleTone(role: StudentRow['role']) {
  return role === 'admin' ? ('info' as const) : ('neutral' as const)
}

function formatDate(iso: string) {
  return formatUtc(
    iso,
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
    { label: false },
  )
}

function TagBadges({ names }: Readonly<{ names: string[] }>) {
  if (names.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <Badge key={name} tone="neutral">
          {name}
        </Badge>
      ))}
    </div>
  )
}

type IconActionProps = {
  label: string
  onClick: () => void
  children: React.ReactNode
}

function IconAction({ label, onClick, children }: Readonly<IconActionProps>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function RowActionButtons({
  student: s,
  onEdit,
  onToggleStatus,
  onExport,
}: Readonly<RowActions & { student: StudentRow }>) {
  const active = s.deleted_at === null
  const ToggleIcon = active ? UserX : UserCheck
  return (
    <div className="flex items-center gap-1">
      <IconAction label="Edit student" onClick={() => onEdit(s)}>
        <Pencil className="size-icon-sm text-muted-foreground" />
      </IconAction>
      <IconAction
        label={active ? 'Deactivate student' : 'Reactivate student'}
        onClick={() => onToggleStatus(s)}
      >
        <ToggleIcon className="size-icon-sm text-muted-foreground" />
      </IconAction>
      <IconAction label="Export data" onClick={() => onExport(s)}>
        <Download className="size-icon-sm text-muted-foreground" />
      </IconAction>
    </div>
  )
}

type RowProps = RowActions & {
  student: StudentRow
  courses: CourseOption[]
  groups: GroupOption[]
  selected: boolean
  onToggle: (id: string) => void
}

function StudentRowView({
  student: s,
  courses,
  groups,
  selected,
  onToggle,
  ...actions
}: Readonly<RowProps>) {
  return (
    <TableRow data-state={selected ? 'selected' : undefined}>
      <TableCell>
        {isSelectableStudent(s) ? (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggle(s.id)}
            aria-label={`Select ${s.full_name ?? s.email}`}
          />
        ) : null}
      </TableCell>
      <TableCell className="font-medium">{s.full_name ?? '—'}</TableCell>
      <TableCell className="text-caption text-muted-foreground">{s.email}</TableCell>
      <TableCell>
        <Badge tone={roleTone(s.role)} className="capitalize">
          {s.role}
        </Badge>
      </TableCell>
      <TableCell>
        <TagBadges names={courses.filter((c) => s.course_ids.includes(c.id)).map((c) => c.short)} />
      </TableCell>
      <TableCell>
        <TagBadges names={groups.filter((g) => s.group_ids.includes(g.id)).map((g) => g.name)} />
      </TableCell>
      <TableCell>
        {s.deleted_at === null ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="neutral">Inactive</Badge>
        )}
      </TableCell>
      <TableCell className="text-caption tabular-nums text-muted-foreground">
        {s.last_active_at ? formatDate(s.last_active_at) : 'Never'}
      </TableCell>
      <TableCell className="text-caption tabular-nums text-muted-foreground">
        {formatDate(s.created_at)}
      </TableCell>
      <TableCell>
        <LoginInstructionsCell student={s} />
      </TableCell>
      <TableCell>
        <RowActionButtons student={s} {...actions} />
      </TableCell>
    </TableRow>
  )
}

export function StudentTable({
  students,
  courses,
  groups,
  selectedIds,
  onToggle,
  onToggleAll,
  ...actions
}: Readonly<Props>) {
  const selectableCount = students.filter(isSelectableStudent).length
  const allSelected = selectableCount > 0 && selectedIds.length === selectableCount

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              render={<Button variant="bare" />}
              nativeButton
              checked={allSelected}
              disabled={selectableCount === 0}
              onCheckedChange={() => onToggleAll()}
              aria-label="Select all students on this page"
            />
          </TableHead>
          <TableHead className="min-w-col-md">Name</TableHead>
          <TableHead className="min-w-col-lg">Email</TableHead>
          <TableHead className="w-col-sm">Role</TableHead>
          <TableHead className="w-col-md">Courses</TableHead>
          <TableHead className="w-col-md">Groups</TableHead>
          <TableHead className="w-col-code">Status</TableHead>
          <TableHead className="w-menu-min">Last Active (UTC)</TableHead>
          <TableHead className="w-col-sm">Created (UTC)</TableHead>
          <TableHead className="w-col-lg">Login</TableHead>
          <TableHead className="w-col-xs">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((s) => (
          <StudentRowView
            key={s.id}
            student={s}
            courses={courses}
            groups={groups}
            selected={selectedIds.includes(s.id)}
            onToggle={onToggle}
            {...actions}
          />
        ))}
      </TableBody>
    </Table>
  )
}
