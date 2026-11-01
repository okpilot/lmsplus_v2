'use client'

import { Download, Pencil, UserCheck, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { CourseOption, StudentRow } from '../types'
import { LoginInstructionsCell } from './login-instructions-cell'

type Props = {
  students: StudentRow[]
  courses: CourseOption[]
  onEdit: (student: StudentRow) => void
  onToggleStatus: (student: StudentRow) => void
  onExport: (student: StudentRow) => void
}

function roleTone(role: StudentRow['role']) {
  return role === 'admin' ? ('info' as const) : ('neutral' as const)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function CourseBadges({
  student,
  courses,
}: Readonly<{ student: StudentRow; courses: CourseOption[] }>) {
  const active = courses.filter((c) => student.course_ids.includes(c.id))
  if (active.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {active.map((c) => (
        <Badge key={c.id} tone="neutral">
          {c.short}
        </Badge>
      ))}
    </div>
  )
}

export function StudentTable({
  students,
  courses,
  onEdit,
  onToggleStatus,
  onExport,
}: Readonly<Props>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-col-md">Name</TableHead>
          <TableHead className="min-w-col-lg">Email</TableHead>
          <TableHead className="w-col-sm">Role</TableHead>
          <TableHead className="w-col-md">Courses</TableHead>
          <TableHead className="w-col-code">Status</TableHead>
          <TableHead className="w-menu-min">Last Active</TableHead>
          <TableHead className="w-col-sm">Created</TableHead>
          <TableHead className="w-col-lg">Login</TableHead>
          <TableHead className="w-col-xs">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((s) => {
          const toggleLabel = s.deleted_at === null ? 'Deactivate student' : 'Reactivate student'
          return (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.full_name ?? '—'}</TableCell>
              <TableCell className="text-caption text-muted-foreground">{s.email}</TableCell>
              <TableCell>
                <Badge tone={roleTone(s.role)} className="capitalize">
                  {s.role}
                </Badge>
              </TableCell>
              <TableCell>
                <CourseBadges student={s} courses={courses} />
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
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Edit student"
                          onClick={() => onEdit(s)}
                        />
                      }
                    >
                      <Pencil className="size-icon-sm text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>Edit student</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={toggleLabel}
                          onClick={() => onToggleStatus(s)}
                        />
                      }
                    >
                      {s.deleted_at === null ? (
                        <UserX className="size-icon-sm text-muted-foreground" />
                      ) : (
                        <UserCheck className="size-icon-sm text-muted-foreground" />
                      )}
                    </TooltipTrigger>
                    <TooltipContent>{toggleLabel}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Export data"
                          onClick={() => onExport(s)}
                        />
                      }
                    >
                      <Download className="size-icon-sm text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>Export data</TooltipContent>
                  </Tooltip>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
