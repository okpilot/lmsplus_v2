'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FLOATING_SURFACE } from '@/components/ui/floating-surface'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { addGroupMembers } from '../actions/add-group-members'
import type { GroupMembersResult } from '../actions/group-action-result'
import { removeGroupMembers } from '../actions/remove-group-members'
import type { GroupOption } from '../types'

type Props = {
  selectedIds: string[]
  groups: GroupOption[]
  onClear: () => void
}

type Mode = 'add' | 'remove'

function successMessage(mode: Mode, count: number, groupName: string): string {
  if (mode === 'add') {
    return count > 0
      ? `Added ${count} ${count === 1 ? 'student' : 'students'} to ${groupName}`
      : `Selected students are already in ${groupName}`
  }
  return count > 0
    ? `Removed ${count} ${count === 1 ? 'student' : 'students'} from ${groupName}`
    : `None of the selected students are in ${groupName}`
}

function runMode(
  mode: Mode,
  input: { groupId: string; userIds: string[] },
): Promise<GroupMembersResult> {
  return mode === 'add' ? addGroupMembers(input) : removeGroupMembers(input)
}

export function StudentsBulkBar({ selectedIds, groups, onClear }: Readonly<Props>) {
  const router = useRouter()
  const [groupId, setGroupId] = useState('')
  const [isPending, startTransition] = useTransition()
  const groupName = groups.find((g) => g.id === groupId)?.name ?? ''

  function run(mode: Mode) {
    startTransition(async () => {
      try {
        const result = await runMode(mode, { groupId, userIds: selectedIds })
        if (!result.success) {
          toast.error(result.error)
          return
        }
        toast.success(successMessage(mode, result.count, groupName))
        onClear()
        router.refresh()
      } catch {
        toast.error('Group update failed')
      }
    })
  }

  if (selectedIds.length === 0) return null

  return (
    <div
      className={cn(
        FLOATING_SURFACE,
        'sticky bottom-0 z-sticky flex flex-wrap items-center gap-3 rounded-control px-4 py-2',
      )}
    >
      <span className="text-label">{selectedIds.length} selected</span>
      <Select
        value={groupId}
        onValueChange={(v) => setGroupId(v ?? '')}
        items={groups.map((g) => ({ value: g.id, label: g.name }))}
      >
        <SelectTrigger className="w-col-md" aria-label="Target group">
          <SelectValue placeholder="Choose group" />
        </SelectTrigger>
        <SelectContent>
          {groups.map((g) => (
            <SelectItem key={g.id} value={g.id} label={g.name}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        onClick={() => run('add')}
        disabled={isPending || !groupId}
      >
        Add to group
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => run('remove')}
        disabled={isPending || !groupId}
      >
        Remove from group
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} disabled={isPending}>
        Clear
      </Button>
    </div>
  )
}
