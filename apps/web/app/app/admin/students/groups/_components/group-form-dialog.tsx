'use client'

import type { ReactElement } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LoadingButton } from '@/components/ui/loading-button'
import { useGroupForm } from '../_hooks/use-group-form'
import type { GroupRow } from '../types'
import { GroupFormFields } from './group-form-fields'

type Props = {
  group?: GroupRow
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function GroupFormDialog({ group, trigger, open, onOpenChange }: Readonly<Props>) {
  const form = useGroupForm({ group, open, onOpenChange })
  return (
    <Dialog open={form.open} onOpenChange={form.handleOpenChange}>
      {open === undefined && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-dialog-md">
        <DialogHeader>
          <DialogTitle>{group ? 'Edit Group' : 'New Group'}</DialogTitle>
          <DialogDescription>
            {group ? 'Update the group details below.' : 'Name the group and add an optional note.'}
          </DialogDescription>
        </DialogHeader>
        <GroupFormFields
          name={form.name}
          description={form.description}
          disabled={form.isPending}
          onNameChange={form.setName}
          onDescriptionChange={form.setDescription}
        />
        <DialogFooter showCloseButton>
          <LoadingButton
            onClick={form.handleSubmit}
            loading={form.isPending}
            disabled={form.name.trim().length === 0}
            loadingText="Saving..."
          >
            {group ? 'Save Changes' : 'Create Group'}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
