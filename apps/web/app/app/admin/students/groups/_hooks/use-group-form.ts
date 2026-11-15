import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createGroup } from '../actions/create-group'
import { updateGroup } from '../actions/update-group'
import type { GroupRow } from '../types'

type Opts = {
  group?: GroupRow
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function saveGroup(group: GroupRow | undefined, name: string, description: string) {
  if (group) return updateGroup({ groupId: group.id, name, description })
  return createGroup({ name, ...(description.trim() ? { description } : {}) })
}

type Draft = { name: string; description: string }

async function submitGroup(group: GroupRow | undefined, draft: Draft, onSaved: () => void) {
  try {
    const result = await saveGroup(group, draft.name, draft.description)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(group ? 'Group updated' : 'Group created')
    onSaved()
  } catch {
    toast.error('Service error. Please try again.')
  }
}

function useGroupDraft(group: GroupRow | undefined) {
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  function reset() {
    setName(group?.name ?? '')
    setDescription(group?.description ?? '')
  }
  return { name, description, setName, setDescription, reset }
}

/** Create/edit form state. Open state is controlled when `open` is given, else internal. */
export function useGroupForm({ group, open: controlledOpen, onOpenChange }: Readonly<Opts>) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const [isPending, startTransition] = useTransition()
  const { reset, ...draft } = useGroupDraft(group)

  function setOpen(next: boolean) {
    if (next) reset()
    ;(onOpenChange ?? setInternalOpen)(next)
  }

  function handleSubmit() {
    startTransition(() => submitGroup(group, draft, () => setOpen(false)))
  }

  function handleOpenChange(next: boolean) {
    if (!next && isPending) return
    setOpen(next)
  }

  return { open, isPending, ...draft, handleSubmit, handleOpenChange }
}
