'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { bulkUpdateCalculations } from '../actions/bulk-update-calculations'
import { bulkUpdateStatus } from '../actions/bulk-update-status'

type Props = {
  selectedIds: string[]
  onClear: () => void
}

export function BulkActionsBar({ selectedIds, onClear }: Readonly<Props>) {
  const [isPending, startTransition] = useTransition()
  const count = selectedIds.length

  function handleBulkAction(status: 'active' | 'draft') {
    startTransition(async () => {
      try {
        const result = await bulkUpdateStatus({ ids: selectedIds, status })
        if (result.success) {
          toast.success(`${count} question${count === 1 ? '' : 's'} set to ${status}`)
          onClear()
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Bulk update failed')
      }
    })
  }

  function handleBulkCalculations(hasCalculations: boolean) {
    startTransition(async () => {
      try {
        const result = await bulkUpdateCalculations({
          ids: selectedIds,
          has_calculations: hasCalculations,
        })
        if (result.success) {
          toast.success(
            `${count} question${count === 1 ? '' : 's'} ${
              hasCalculations ? 'marked as calculation' : 'unmarked as calculation'
            }`,
          )
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
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background/95 px-4 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleBulkCalculations(true)}
        disabled={isPending}
      >
        Mark as calculation
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleBulkCalculations(false)}
        disabled={isPending}
      >
        Unmark as calculation
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} disabled={isPending}>
        Clear
      </Button>
    </div>
  )
}
