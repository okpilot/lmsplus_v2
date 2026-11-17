'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { TableCell } from '@/components/ui/table'
import { formatUtc } from '@/lib/utils/format-utc'
import type { CourseOption, GroupOption, StudentRow } from '../types'
import { isSelectableStudent } from './is-selectable-student'

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

function TagList({ tags }: Readonly<{ tags: { id: string; label: string }[] }>) {
  if (tags.length === 0) return <span className="text-muted-foreground">—</span>
  return <span className="text-muted-foreground">{tags.map((tag) => tag.label).join(', ')}</span>
}

type SelectProps = {
  student: StudentRow
  selected: boolean
  onToggle: (id: string) => void
}

export function SelectCell({ student: s, selected, onToggle }: Readonly<SelectProps>) {
  return (
    <TableCell>
      {isSelectableStudent(s) ? (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(s.id)}
          aria-label={`Select ${s.full_name ?? s.email}`}
        />
      ) : null}
    </TableCell>
  )
}

type MembershipProps = {
  student: StudentRow
  courses: CourseOption[]
  groups: GroupOption[]
}

export function MembershipCells({ student: s, courses, groups }: Readonly<MembershipProps>) {
  const courseTags = courses
    .filter((c) => s.course_ids.includes(c.id))
    .map((c) => ({ id: c.id, label: c.short }))
  const groupTags = groups
    .filter((g) => s.group_ids.includes(g.id))
    .map((g) => ({ id: g.id, label: g.name }))
  return (
    <>
      <TableCell>
        <TagList tags={courseTags} />
      </TableCell>
      <TableCell>
        <TagList tags={groupTags} />
      </TableCell>
    </>
  )
}

export function ActivityCells({ student: s }: Readonly<{ student: StudentRow }>) {
  return (
    <>
      <TableCell>
        {s.deleted_at === null ? 'Active' : <span className="text-muted-foreground">Inactive</span>}
      </TableCell>
      <TableCell className="text-caption tabular-nums text-muted-foreground">
        {s.last_active_at ? formatDate(s.last_active_at) : 'Never'}
      </TableCell>
      <TableCell className="text-caption tabular-nums text-muted-foreground">
        {formatDate(s.created_at)}
      </TableCell>
    </>
  )
}
