'use client'

import { Download, Pencil, UserCheck, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { CourseOption, GroupOption, StudentRow } from '../types'
import { selectionSummary } from './is-selectable-student'
import { LoginInstructionsCell } from './login-instructions-cell'
import { ActivityCells, MembershipCells, SelectCell } from './student-row-cells'
import { StudentTableHeader } from './student-table-header'

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
      <SelectCell student={s} selected={selected} onToggle={onToggle} />
      <TableCell className="font-medium">{s.full_name ?? '—'}</TableCell>
      <TableCell className="text-caption text-muted-foreground">{s.email}</TableCell>
      <TableCell>
        <Badge tone={roleTone(s.role)} className="capitalize">
          {s.role}
        </Badge>
      </TableCell>
      <MembershipCells student={s} courses={courses} groups={groups} />
      <ActivityCells student={s} />
      <TableCell>
        <LoginInstructionsCell student={s} />
      </TableCell>
      <TableCell>
        <RowActionButtons student={s} {...actions} />
      </TableCell>
    </TableRow>
  )
}

type BodyProps = RowActions & {
  students: StudentRow[]
  courses: CourseOption[]
  groups: GroupOption[]
  selectedIds: string[]
  onToggle: (id: string) => void
}

function StudentTableBody({
  students,
  courses,
  groups,
  selectedIds,
  onToggle,
  ...actions
}: Readonly<BodyProps>) {
  return (
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
  )
}

export function StudentTable({ onToggleAll, ...body }: Readonly<Props>) {
  const { selectableCount, allSelected } = selectionSummary(body.students, body.selectedIds)
  return (
    <Table>
      <StudentTableHeader
        allSelected={allSelected}
        selectableCount={selectableCount}
        onToggleAll={onToggleAll}
      />
      <StudentTableBody {...body} />
    </Table>
  )
}
