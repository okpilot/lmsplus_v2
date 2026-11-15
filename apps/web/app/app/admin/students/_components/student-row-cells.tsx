'use client'

import { Badge } from '@/components/ui/badge'
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

function TagBadges({ tags }: Readonly<{ tags: { id: string; label: string }[] }>) {
  if (tags.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge key={tag.id} tone="neutral">
          {tag.label}
        </Badge>
      ))}
    </div>
  )
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
        <TagBadges tags={courseTags} />
      </TableCell>
      <TableCell>
        <TagBadges tags={groupTags} />
      </TableCell>
    </>
  )
}

export function ActivityCells({ student: s }: Readonly<{ student: StudentRow }>) {
  return (
    <>
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
    </>
  )
}
