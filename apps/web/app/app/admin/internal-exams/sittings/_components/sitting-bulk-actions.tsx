'use client'

import { Button } from '@/components/ui/button'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { MAX_TICKS } from '../parse-sitting-params'

type Props = {
  onRemove: (ids: string[]) => void
  /** Ids of the shown page that can be ticked. */
  pageIds: readonly string[]
  /** Ids of the shown page whose person needs a code. */
  needsCodeIds: ReadonlySet<string>
  /** A search or Show filter is active. */
  filtered: boolean
  /** People in the whole sitting. */
  candidates: number
  /** Rows shown on this page. */
  shown: number
}

function removeHint(selectAll: boolean, filtered: boolean): string {
  if (selectAll) return 'Clear select-all to remove people.'
  return filtered ? `Tick at most ${MAX_TICKS}.` : `Tick at most ${MAX_TICKS}, or select all.`
}

/** `Select all {n}`: only for the whole unfiltered sitting once the page is fully ticked. */
function SelectAllLink({ pageIds, filtered, candidates, shown }: Readonly<Props>) {
  const { rosterIds, selectAll, setSelectAll } = useSittingUi()
  const pageTicked = pageIds.length > 0 && pageIds.every((id) => rosterIds.includes(id))
  if (selectAll || filtered || !pageTicked || candidates <= shown) return null
  return (
    <Button size="sm" variant="ghost" onClick={() => setSelectAll(true)}>
      Select all {candidates}
    </Button>
  )
}

/** Issue is pointless only when every tick is on this page and none of them needs a code. */
function nothingToIssue(ticks: readonly string[], p: Pick<Props, 'pageIds' | 'needsCodeIds'>) {
  return ticks.every((id) => p.pageIds.includes(id)) && !ticks.some((id) => p.needsCodeIds.has(id))
}

/** Bulk bar for ticked people; replaces the toolbar while anything is ticked. */
export function SittingBulkActions(p: Readonly<Props>) {
  const { rosterIds, selectAll, clearRoster, open, isRefreshing } = useSittingUi()
  const tooMany = rosterIds.length > MAX_TICKS
  const params: Record<string, string> = selectAll
    ? { all: '1' }
    : { ids: rosterIds.slice(0, MAX_TICKS + 1).join(',') }
  const issueOff = !selectAll && nothingToIssue(rosterIds, p)
  return (
    <>
      <span className="text-label tabular-nums">
        {selectAll ? `All ${p.candidates} selected` : `${rosterIds.length} selected`}
      </span>
      <SelectAllLink {...p} />
      <Button
        size="sm"
        variant="outline"
        disabled={isRefreshing}
        onClick={(e) => open('exams', e.currentTarget, params)}
      >
        Add exams
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isRefreshing || issueOff}
        onClick={(e) => open('issue', e.currentTarget, params)}
      >
        Issue codes
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={tooMany || selectAll}
        onClick={() => p.onRemove(rosterIds)}
      >
        Remove
      </Button>
      <Button size="sm" variant="ghost" onClick={clearRoster}>
        Clear
      </Button>
      {(tooMany || selectAll) && (
        <span
          className={tooMany ? 'text-caption text-danger' : 'text-caption text-muted-foreground'}
        >
          {removeHint(selectAll, p.filtered)}
        </span>
      )}
    </>
  )
}
