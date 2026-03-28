'use client'

import { Download, Key, Pencil, UserCheck, UserX } from 'lucide-react'
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
import type { StudentRow } from '../types'

type Props = {
  students: StudentRow[]
  onEdit: (student: StudentRow) => void
  onToggleStatus: (student: StudentRow) => void
  onResetPassword: (student: StudentRow) => void
  onExport: (student: StudentRow) => void
}

function roleVariant(role: StudentRow['role']) {
  switch (role) {
    case 'admin':
      return 'default' as const
    case 'instructor':
      return 'secondary' as const
    default:
      return 'outline' as const
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function StudentTable({
  students,
  onEdit,
  onToggleStatus,
  onResetPassword,
  onExport,
}: Readonly<Props>) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[160px]">Name</TableHead>
            <TableHead className="min-w-[200px]">Email</TableHead>
            <TableHead className="w-28">Role</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-36">Last Active</TableHead>
            <TableHead className="w-32">Created</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.full_name ?? '\u2014'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{s.email}</TableCell>
              <TableCell>
                <Badge variant={roleVariant(s.role)} className="text-xs capitalize">
                  {s.role}
                </Badge>
              </TableCell>
              <TableCell>
                {s.deleted_at === null ? (
                  <Badge variant="default" className="bg-green-600 text-xs hover:bg-green-600">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    Inactive
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-xs tabular-nums text-muted-foreground">
                {s.last_active_at ? formatDate(s.last_active_at) : 'Never'}
              </TableCell>
              <TableCell className="text-xs tabular-nums text-muted-foreground">
                {formatDate(s.created_at)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Edit student"
                    aria-label="Edit student"
                    onClick={() => onEdit(s)}
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title={s.deleted_at === null ? 'Deactivate student' : 'Reactivate student'}
                    aria-label={s.deleted_at === null ? 'Deactivate student' : 'Reactivate student'}
                    onClick={() => onToggleStatus(s)}
                  >
                    {s.deleted_at === null ? (
                      <UserX className="size-3.5 text-muted-foreground" />
                    ) : (
                      <UserCheck className="size-3.5 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Reset password"
                    aria-label="Reset password"
                    onClick={() => onResetPassword(s)}
                  >
                    <Key className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Export data"
                    aria-label="Export data"
                    onClick={() => onExport(s)}
                  >
                    <Download className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
