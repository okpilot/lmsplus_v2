'use client'

import { LoadingButton } from '@/components/ui/loading-button'
import { plural } from '../_utils/plural'
import { MAX_PAIRS, tooManyPairsText } from '../_utils/popup-copy'
import { CloseButton } from './close-button'
import { PopupFooter } from './popup-parts'

type Props = {
  /** Exams picked. */
  exams: number
  people: number
  singleDeactivated: boolean
  /** Pending, or the page is refreshing: no Add may start. */
  busy: boolean
  pending: boolean
  onSubmit: () => void
}

/** Footer of the Add exams popup: what will be added, Cancel, Add exams. */
export function AddExamsFooter({
  exams,
  people,
  singleDeactivated,
  busy,
  pending,
  onSubmit,
}: Readonly<Props>) {
  const tooMany = exams * people > MAX_PAIRS
  return (
    <PopupFooter className="sm:flex-wrap sm:items-center sm:justify-between">
      <span className="min-h-control text-caption" role="status">
        {exams === 0
          ? 'No exams selected'
          : `${plural(exams, 'exam')} for ${plural(people, 'person', 'people')}`}
        {tooMany && (
          <span className="block text-destructive">{tooManyPairsText(people, exams)}</span>
        )}
      </span>
      <span className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
        <CloseButton label="Cancel" />
        <LoadingButton
          loading={pending}
          disabled={exams === 0 || tooMany || singleDeactivated || busy}
          onClick={onSubmit}
        >
          Add exams
        </LoadingButton>
      </span>
    </PopupFooter>
  )
}
