import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { SubjectRowView } from '../_utils/subject-state'
import type { SubjectEligibility } from '../types'

type Props = {
  row: Pick<SubjectEligibility, 'subjectId' | 'subjectShort' | 'subjectName'>
  view: SubjectRowView
  checked: boolean
  busy: boolean
  onToggle: (subjectId: string) => void
}

function Head({ row, view }: Readonly<Pick<Props, 'row' | 'view'>>) {
  return (
    <span className="block min-w-0 flex-1">
      <span className="font-medium">{row.subjectShort}</span>{' '}
      <span className="text-muted-foreground">{row.subjectName}</span>
      {view.text && <span className="block text-caption text-muted-foreground">{view.text}</span>}
      {view.reasons && (
        <span className="block text-caption text-muted-foreground">{view.reasons}</span>
      )}
    </span>
  )
}

/** One exam of the Add exams popup; a row nobody can sit has no checkbox. */
export function SubjectRow({ row, view, checked, busy, onToggle }: Readonly<Props>) {
  return (
    <li className="py-2">
      {view.tickable ? (
        <Label className="items-start text-body text-foreground">
          <Checkbox
            className="mt-1"
            aria-label={`Add ${row.subjectShort}`}
            checked={checked}
            disabled={busy}
            onCheckedChange={() => onToggle(row.subjectId)}
          />
          <Head row={row} view={view} />
        </Label>
      ) : (
        <div className="flex items-start gap-2 text-muted-foreground">
          <Head row={row} view={view} />
        </div>
      )}
    </li>
  )
}
