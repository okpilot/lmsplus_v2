'use client'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeleteGroupDialog } from '../_hooks/use-delete-group-dialog'
import type { GroupRow } from '../types'

type Props = {
  group: GroupRow | null
  onOpenChange: (open: boolean) => void
}

export function DeleteGroupDialog({ group, onOpenChange }: Readonly<Props>) {
  const { isPending, error, handleOpenChange, handleConfirm } = useDeleteGroupDialog({
    group,
    onOpenChange,
  })
  return (
    <ConfirmDialog
      open={group !== null}
      onOpenChange={handleOpenChange}
      title={`Delete ${group?.name ?? 'group'}?`}
      description="Members are removed from this group. Membership history is kept."
      confirmLabel="Delete group"
      pending={isPending}
      onConfirm={handleConfirm}
      error={error}
    />
  )
}
