'use client'

import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { groupAddLabel } from '../_utils/popup-copy'
import { PopupFooter } from './popup-parts'

/** Most people one Add people call may send. */
export const MAX_ADD = 500

export type AddGroup = { id: string; name: string; activeNew: number; deactivatedNew: number }

type Props = {
  ticked: number
  group: AddGroup | null
  pending: boolean
  /** Pending, or the page is refreshing: no Add may start. */
  busy: boolean
  onAddSelected: () => void
  onAddGroup: () => void
  onClear: () => void
}

/** Footer of the Add people popup: tick count (always rendered), Add whole group, Add selected. */
export function PeopleFooter(p: Readonly<Props>) {
  const none = p.ticked === 0
  return (
    <PopupFooter className="sm:flex-wrap sm:items-center sm:justify-between">
      <span className="flex min-h-control items-center gap-2 text-caption" role="status">
        {none ? 'No one selected' : `${p.ticked} selected`}
        <Button
          size="sm"
          variant="ghost"
          className={none ? 'invisible' : undefined}
          aria-hidden={none}
          tabIndex={none ? -1 : undefined}
          onClick={p.onClear}
        >
          Clear
        </Button>
        {p.ticked > MAX_ADD && (
          <span className="text-destructive">Add at most {MAX_ADD} at once</span>
        )}
      </span>
      <span className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
        {p.group && (
          <LoadingButton
            variant="outline"
            className="h-auto min-h-control max-w-full whitespace-normal"
            loading={p.pending}
            disabled={p.busy || p.group.activeNew === 0}
            onClick={p.onAddGroup}
          >
            {groupAddLabel(p.group.name, p.group.activeNew, p.group.deactivatedNew)}
          </LoadingButton>
        )}
        <LoadingButton
          loading={p.pending}
          disabled={none || p.ticked > MAX_ADD || p.busy}
          onClick={p.onAddSelected}
        >
          Add selected ({p.ticked})
        </LoadingButton>
      </span>
    </PopupFooter>
  )
}
