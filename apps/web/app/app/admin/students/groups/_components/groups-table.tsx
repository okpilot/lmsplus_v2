'use client'

import { Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatUtc } from '@/lib/utils/format-utc'
import type { GroupRow } from '../types'
import { DeleteGroupDialog } from './delete-group-dialog'
import { GroupFormDialog } from './group-form-dialog'

type Props = { groups: GroupRow[] }

function formatCreated(iso: string) {
  return formatUtc(iso, { day: '2-digit', month: 'short', year: 'numeric' }, { label: false })
}

type RowProps = {
  group: GroupRow
  onEdit: (group: GroupRow) => void
  onDelete: (group: GroupRow) => void
}

function GroupRowActions({ group, onEdit, onDelete }: Readonly<RowProps>) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/app/admin/students?group=${group.id}&status=active&role=student`}
        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
      >
        View students
      </Link>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Edit ${group.name}`}
        onClick={() => onEdit(group)}
      >
        <Pencil className="size-icon-sm text-muted-foreground" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${group.name}`}
        onClick={() => onDelete(group)}
      >
        <Trash2 className="size-icon-sm text-muted-foreground" />
      </Button>
    </div>
  )
}

function GroupRowView({ group, onEdit, onDelete }: Readonly<RowProps>) {
  return (
    <TableRow>
      <TableCell className="font-medium">{group.name}</TableCell>
      <TableCell className="text-caption text-muted-foreground">
        {group.description ?? '—'}
      </TableCell>
      <TableCell className="tabular-nums">{group.active_count}</TableCell>
      <TableCell className="tabular-nums">{group.deactivated_count}</TableCell>
      <TableCell className="text-caption tabular-nums text-muted-foreground">
        {formatCreated(group.created_at)}
      </TableCell>
      <TableCell>
        <GroupRowActions group={group} onEdit={onEdit} onDelete={onDelete} />
      </TableCell>
    </TableRow>
  )
}

type ListProps = Omit<RowProps, 'group'> & { groups: GroupRow[] }

function GroupsList({ groups, onEdit, onDelete }: Readonly<ListProps>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-col-md">Name</TableHead>
          <TableHead className="min-w-col-lg">Description</TableHead>
          <TableHead className="w-col-sm">Active</TableHead>
          <TableHead className="w-col-sm">Deactivated</TableHead>
          <TableHead className="w-col-sm">Created (UTC)</TableHead>
          <TableHead className="w-col-lg">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => (
          <GroupRowView key={g.id} group={g} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </TableBody>
    </Table>
  )
}

export function GroupsTable({ groups }: Readonly<Props>) {
  const [editGroup, setEditGroup] = useState<GroupRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GroupRow | null>(null)

  if (groups.length === 0) {
    return (
      <Empty>
        <EmptyDescription>No groups yet. Create one to organise students.</EmptyDescription>
      </Empty>
    )
  }

  return (
    <>
      <GroupsList groups={groups} onEdit={setEditGroup} onDelete={setDeleteTarget} />
      <GroupFormDialog
        key={editGroup?.id}
        group={editGroup ?? undefined}
        open={editGroup !== null}
        onOpenChange={(v) => {
          if (!v) setEditGroup(null)
        }}
      />
      <DeleteGroupDialog
        group={deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
      />
    </>
  )
}
