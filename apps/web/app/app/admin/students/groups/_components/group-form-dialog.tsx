'use client'

import type { ReactElement } from 'react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Textarea } from '@/components/ui/textarea'
import { createGroup } from '../actions/create-group'
import { updateGroup } from '../actions/update-group'
import type { GroupRow } from '../types'

type Props = {
  group?: GroupRow
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function saveGroup(group: GroupRow | undefined, name: string, description: string) {
  if (group) return updateGroup({ groupId: group.id, name, description })
  return createGroup({ name, ...(description.trim() ? { description } : {}) })
}

export function GroupFormDialog({
  group,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: Readonly<Props>) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')

  function setOpen(next: boolean) {
    if (next) {
      setName(group?.name ?? '')
      setDescription(group?.description ?? '')
    }
    ;(onOpenChange ?? setInternalOpen)(next)
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        const result = await saveGroup(group, name, description)
        if (!result.success) {
          toast.error(result.error)
          return
        }
        toast.success(group ? 'Group updated' : 'Group created')
        setOpen(false)
      } catch {
        toast.error('Service error. Please try again.')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && isPending) return
        setOpen(v)
      }}
    >
      {controlledOpen === undefined && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-dialog-md">
        <DialogHeader>
          <DialogTitle>{group ? 'Edit Group' : 'New Group'}</DialogTitle>
          <DialogDescription>
            {group ? 'Update the group details below.' : 'Name the group and add an optional note.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              maxLength={80}
              disabled={isPending}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-description">Description</Label>
            <Textarea
              id="group-description"
              value={description}
              maxLength={500}
              disabled={isPending}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter showCloseButton>
          <LoadingButton
            onClick={handleSubmit}
            loading={isPending}
            disabled={name.trim().length === 0}
            loadingText="Saving..."
          >
            {group ? 'Save Changes' : 'Create Group'}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
