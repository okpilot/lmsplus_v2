import { Suspense } from 'react'
import type { PopupDlg, SittingParams } from '../parse-sitting-params'
import type { Selection, SittingRow } from '../types'
import { AddExamsContent } from './add-exams-content'
import { AddPeopleContent } from './add-people-content'
import { IssueCodesContent } from './issue-codes-content'
import { PopupFallback } from './popup-fallback'
import { PopupGate } from './popup-gate'

type Props = {
  sitting: Pick<SittingRow, 'id' | 'scheduledAt'>
  params: SittingParams
  editable: boolean
  selection: Selection
}

const TITLES: Readonly<Record<PopupDlg, string>> = {
  people: 'Add people',
  exams: 'Add exams',
  issue: 'Issue codes',
}

function OpenBody({ dlg, sitting, params, selection }: Readonly<Props & { dlg: PopupDlg }>) {
  if (dlg === 'people') {
    return <AddPeopleContent sittingId={sitting.id} filters={params.people} />
  }
  if (dlg === 'exams') return <AddExamsContent sittingId={sitting.id} selection={selection} />
  return (
    <IssueCodesContent
      sittingId={sitting.id}
      scheduledAt={sitting.scheduledAt}
      selection={selection}
    />
  )
}

/**
 * The Add people / Add exams / Issue codes popups. The server body renders only when the sitting is
 * editable and the URL names the popup; the client gate mounts it while the client URL still does.
 */
export function SittingPopups(props: Readonly<Props>) {
  const { editable, params } = props
  const dlg = params.dlg
  if (!editable || !dlg) return null
  return (
    <PopupGate name={dlg}>
      <Suspense fallback={<PopupFallback title={TITLES[dlg]} />}>
        <OpenBody {...props} dlg={dlg} />
      </Suspense>
    </PopupGate>
  )
}
