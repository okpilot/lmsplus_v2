'use client'

import { Button } from '@/components/ui/button'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { MAX_TICKS } from '../parse-sitting-params'

/** Bulk bar for ticked people; replaces the toolbar while anything is ticked. */
export function SittingBulkActions({ onRemove }: Readonly<{ onRemove: (ids: string[]) => void }>) {
  const { rosterIds, clearRoster, isRefreshing } = useSittingUi()
  const tooMany = rosterIds.length > MAX_TICKS
  return (
    <>
      <span className="text-label tabular-nums">{rosterIds.length} selected</span>
      <Button
        size="sm"
        variant="destructive"
        disabled={tooMany || isRefreshing}
        onClick={() => onRemove(rosterIds)}
      >
        Remove
      </Button>
      <Button size="sm" variant="ghost" onClick={clearRoster}>
        Clear
      </Button>
      {tooMany && <span className="text-caption text-danger">Tick at most {MAX_TICKS}.</span>}
    </>
  )
}
