'use client'

import { FLOATING_SURFACE } from '@/components/ui/floating-surface'
import { cn } from '@/lib/utils'
import { useBulkGroupAction } from '../_hooks/use-bulk-group-action'
import type { GroupOption } from '../types'
import { BulkActionButtons } from './bulk-action-buttons'
import { GroupPicker } from './group-picker'

type Props = {
  selectedIds: string[]
  groups: GroupOption[]
  onClear: () => void
}

export function StudentsBulkBar({ selectedIds, groups, onClear }: Readonly<Props>) {
  const { groupId, setPicked, isPending, run } = useBulkGroupAction({
    selectedIds,
    groups,
    onClear,
  })

  if (selectedIds.length === 0) return null

  return (
    <div
      className={cn(
        FLOATING_SURFACE,
        'sticky bottom-0 z-sticky flex flex-wrap items-center gap-3 rounded-control px-4 py-2',
      )}
    >
      <span className="text-label">{selectedIds.length} selected</span>
      <GroupPicker groups={groups} value={groupId} onChange={setPicked} />
      <BulkActionButtons
        canRun={groupId !== ''}
        isPending={isPending}
        onRun={run}
        onClear={onClear}
      />
    </div>
  )
}
