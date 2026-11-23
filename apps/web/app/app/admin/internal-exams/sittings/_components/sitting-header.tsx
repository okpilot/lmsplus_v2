import Link from 'next/link'
import { StatusNote } from '@/components/kit/status-note'
import { PageHeader } from '@/components/ui/heading'
import { fmtDate, formatTitleDate } from '../_utils/format-dates'
import { sittingListScope } from '../_utils/scope-url'
import type { InvigilatorOption, SittingRow, SittingSummary } from '../types'
import { SittingEditDialog } from './sitting-edit-dialog'
import { modeLabel, statusLabel } from './sitting-labels'
import { SittingLifecycleButtons } from './sitting-lifecycle-buttons'

type Props = {
  sitting: SittingRow
  summary: SittingSummary
  invigilators: InvigilatorOption[]
  notDue: boolean
  dayEnded: boolean
}

function doneText(s: SittingRow): string {
  if (s.status === 'closed') {
    return s.endedAutomatically ? 'Closed automatically at the end of its day.' : 'Closed.'
  }
  return s.endedAutomatically ? 'Cancelled automatically: never started.' : 'Cancelled.'
}

function subtitle(s: SittingRow): string {
  const parts = [
    statusLabel(s.status),
    modeLabel(s.mode),
    `Invigilator ${s.invigilatorName}${s.invigilatorActive ? '' : ' (inactive)'}`,
  ]
  if (s.permittedMaterials) parts.push(`Materials: ${s.permittedMaterials}`)
  return parts.join(' · ')
}

function Notice({
  sitting,
  notDue,
  dayEnded,
}: Readonly<Pick<Props, 'sitting' | 'notDue' | 'dayEnded'>>) {
  if (sitting.status === 'closed' || sitting.status === 'cancelled') {
    return <p className="text-caption text-muted-foreground">{doneText(sitting)}</p>
  }
  if (dayEnded) return <StatusNote tone="caution">This sitting's day has ended.</StatusNote>
  if (sitting.status === 'scheduled' && notDue) {
    return (
      <p className="text-caption text-muted-foreground">
        Can start on {fmtDate(sitting.scheduledAt)} (UTC).
      </p>
    )
  }
  return null
}

export function SittingHeader({
  sitting,
  summary,
  invigilators,
  notDue,
  dayEnded,
}: Readonly<Props>) {
  const editable = (sitting.status === 'scheduled' || sitting.status === 'open') && !dayEnded
  return (
    <div className="space-y-stack">
      <nav className="text-caption text-muted-foreground">
        <Link
          href={`/app/admin/internal-exams?tab=sittings&scope=${sittingListScope(sitting.status, dayEnded)}`}
          className="hover:text-foreground hover:underline"
        >
          Internal Exams
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">Sitting</span>
      </nav>
      <PageHeader
        title={formatTitleDate(sitting.scheduledAt)}
        description={subtitle(sitting)}
        actions={
          <SittingLifecycleButtons
            sitting={sitting}
            summary={summary}
            notDue={notDue}
            dayEnded={dayEnded}
          />
        }
      />
      <Notice sitting={sitting} notDue={notDue} dayEnded={dayEnded} />
      <SittingEditDialog sitting={sitting} invigilators={invigilators} editable={editable} />
    </div>
  )
}
