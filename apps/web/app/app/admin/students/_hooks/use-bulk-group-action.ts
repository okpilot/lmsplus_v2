import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { addGroupMembers } from '../actions/add-group-members'
import type { GroupMembersResult } from '../actions/group-action-result'
import { removeGroupMembers } from '../actions/remove-group-members'
import type { GroupOption } from '../types'

export type BulkMode = 'add' | 'remove'

type Opts = {
  selectedIds: string[]
  groups: GroupOption[]
  onDone: (ids: string[]) => void
}

function successMessage(mode: BulkMode, count: number, groupName: string): string {
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
  mode: BulkMode,
  input: { groupId: string; userIds: string[] },
): Promise<GroupMembersResult> {
  return mode === 'add' ? addGroupMembers(input) : removeGroupMembers(input)
}

/** Bulk add/remove of the selected students for the picked group. A picked group no longer in `groups` reads as unpicked. */
export function useBulkGroupAction({ selectedIds, groups, onDone }: Readonly<Opts>) {
  const router = useRouter()
  const [picked, setPicked] = useState('')
  const [isPending, startTransition] = useTransition()
  const group = groups.find((g) => g.id === picked)
  const groupId = group ? picked : ''
  const groupName = group?.name ?? ''

  async function execute(mode: BulkMode) {
    try {
      const submittedIds = selectedIds
      const result = await runMode(mode, { groupId, userIds: submittedIds })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(successMessage(mode, result.count, groupName))
      onDone(submittedIds)
      router.refresh()
    } catch {
      toast.error('Group update failed')
    }
  }

  function run(mode: BulkMode) {
    if (!groupId) return
    startTransition(() => execute(mode))
  }

  return { groupId, setPicked, isPending, run }
}
