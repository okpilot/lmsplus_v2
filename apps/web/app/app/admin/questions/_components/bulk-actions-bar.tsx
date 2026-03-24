'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { bulkUpdateStatus } from '../actions/bulk-update-status'

type Props = {
  selectedIds: string[]
  onClear: () => void
}

export function BulkActionsBar({ selectedIds, onClear }: Props) {
  const [isPending, startTransition] = useTransition()
  const count = selectedIds.length

  function handleBulkAction(status: 'active' | 'draft') {
    startTransition(async () => {
      try {
        const result = await bulkUpdateStatus({ ids: selectedIds, status })
        if (result.success) {
          toast.success(`${count} question${count !== 1 ? 's' : ''} set to ${status}`)
          onClear()
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Bulk update failed')
      }
    })
  }

  if (count === 0) return null

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
      <span className="text-sm font-medium">{count} selected</span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleBulkAction('active')}
        disabled={isPending}
      >
        Activate
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleBulkAction('draft')}
        disabled={isPending}
      >
        Deactivate
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} disabled={isPending}>
        Clear
      </Button>
    </div>
  )
}
