import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatDay } from '../_utils/format-dates'
import { isGone } from '../_utils/is-ended'
import { plural } from '../_utils/plural'
import { getIssuePreview } from '../people-queries'
import type { Selection } from '../types'
import { MAX_TICKS } from '../types'
import { IssueCodesPanel } from './issue-codes-panel'
import { PopupEnded, PopupMessage } from './popup-message'
import { PopupHeader } from './popup-parts'

type Props = { sittingId: string; scheduledAt: string; selection: Selection }

const TITLE = 'Issue codes'

function who(selection: Selection): string {
  if (selection.kind !== 'ids') return 'Everyone in this sitting.'
  const n = plural(selection.ids.length, 'person', 'people')
  return `${n} selected.${selection.truncated ? ` Only the first ${MAX_TICKS} people were used.` : ''}`
}

/** Server body of the Issue popup. Never widens: ids that match nobody show a message, not the whole sitting. */
export async function IssueCodesContent({ sittingId, scheduledAt, selection }: Readonly<Props>) {
  if (selection.kind === 'empty') {
    return <PopupMessage title={TITLE} message="No valid people to issue codes for." />
  }
  const userIds = selection.kind === 'ids' ? selection.ids : undefined
  const preview = await getIssuePreview(sittingId, userIds)
  if (isGone(preview)) return <PopupEnded title={TITLE} />
  return (
    <>
      <PopupHeader>
        <DialogTitle>{TITLE}</DialogTitle>
        <DialogDescription>
          {who(selection)} Codes work until {formatDay(scheduledAt)}, 23:59 UTC.
        </DialogDescription>
      </PopupHeader>
      <IssueCodesPanel sittingId={sittingId} userIds={userIds} preview={preview} />
    </>
  )
}
