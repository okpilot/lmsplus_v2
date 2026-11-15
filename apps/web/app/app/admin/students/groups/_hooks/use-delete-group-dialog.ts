import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { deleteGroup } from '../actions/delete-group'
import type { GroupRow } from '../types'

type Opts = {
  group: GroupRow | null
  onOpenChange: (open: boolean) => void
}

async function runDelete(groupId: string, onError: (msg: string) => void, onDone: () => void) {
  try {
    const result = await deleteGroup({ groupId })
    if (!result.success) {
      onError(result.error)
      return
    }
    toast.success('Group deleted')
    onDone()
  } catch {
    onError('Service error. Please try again.')
  }
}

/** Delete confirmation state: pending flag, error text, open-change handler that clears the error. */
export function useDeleteGroupDialog({ group, onOpenChange }: Readonly<Opts>) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) setError(null)
    onOpenChange(next)
  }

  function handleConfirm() {
    if (!group) return
    const groupId = group.id
    startTransition(() => runDelete(groupId, setError, () => handleOpenChange(false)))
  }

  return { isPending, error, handleOpenChange, handleConfirm }
}
