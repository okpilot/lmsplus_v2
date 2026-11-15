'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteGroup } from '../actions/delete-group'
import type { GroupRow } from '../types'

type Props = {
  group: GroupRow | null
  onOpenChange: (open: boolean) => void
}

export function DeleteGroupDialog({ group, onOpenChange }: Readonly<Props>) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    if (!group) return
    startTransition(async () => {
      try {
        const result = await deleteGroup({ groupId: group.id })
        if (!result.success) {
          setError(result.error)
          return
        }
        toast.success('Group deleted')
        onOpenChange(false)
      } catch {
        setError('Service error. Please try again.')
      }
    })
  }

  return (
    <ConfirmDialog
      open={group !== null}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
      title={`Delete ${group?.name ?? 'group'}?`}
      description="Members are removed from this group. Membership history is kept."
      confirmLabel="Delete group"
      pending={isPending}
      onConfirm={handleConfirm}
      error={error}
    />
  )
}
