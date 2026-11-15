'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Props = {
  allSelected: boolean
  selectableCount: number
  onToggleAll: () => void
}

export function StudentTableHeader({ allSelected, selectableCount, onToggleAll }: Readonly<Props>) {
  return (
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
  )
}
