import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { isGone } from '../_utils/is-ended'
import { plural } from '../_utils/plural'
import { readUserName } from '../people-lookup'
import { getSameDayPeople, getSubjectEligibility } from '../people-queries'
import type { Selection } from '../types'
import { MAX_TICKS } from '../types'
import { PopupEnded, PopupMessage } from './popup-message'
import { PopupHeader } from './popup-parts'
import { SubjectPicker } from './subject-picker'

type Props = { sittingId: string; selection: Selection }

const TITLE = 'Add exams'

function titleOf(all: boolean, count: number, name: string | null): string {
  if (all) return `${TITLE} for all ${plural(count, 'person', 'people')}`
  return `${TITLE} for ${name ?? plural(count, 'person', 'people')}`
}

/** Server body of the Add exams popup; the selection was validated and resolved server-side. */
export async function AddExamsContent({ sittingId, selection }: Readonly<Props>) {
  if (selection.kind === 'empty' || selection.kind === 'whole') {
    return <PopupMessage title={TITLE} message="No valid people to add exams for." />
  }
  const userIds = selection.kind === 'ids' ? selection.ids : undefined
  const [rows, sameDay, single] = await Promise.all([
    getSubjectEligibility(sittingId, userIds),
    getSameDayPeople(sittingId, userIds),
    userIds?.length === 1 ? readUserName(userIds[0] ?? '') : Promise.resolve(null),
  ])
  if (isGone(rows) || isGone(sameDay)) return <PopupEnded title={TITLE} />
  const count = userIds?.length ?? rows[0]?.people ?? 0
  if (rows.length === 0) return <PopupMessage title={TITLE} message="No exams to add." />
  const deactivated = count === 1 && rows.some((r) => r.deactivated > 0)
  return (
    <>
      <PopupHeader>
        <DialogTitle>{titleOf(selection.kind === 'all', count, single)}</DialogTitle>
        <DialogDescription>
          {deactivated ? 'Deactivated. ' : ''}Pick exams. People who cannot sit an exam are skipped
          and named afterwards.
          {selection.kind === 'ids' && selection.truncated
            ? ` Only the first ${MAX_TICKS} people were used.`
            : ''}
        </DialogDescription>
      </PopupHeader>
      <SubjectPicker
        sittingId={sittingId}
        rows={rows}
        userIds={userIds}
        peopleCount={count}
        singleDeactivated={deactivated}
        sameDay={sameDay}
      />
    </>
  )
}
