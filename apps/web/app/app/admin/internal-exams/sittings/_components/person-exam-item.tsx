import { StatusText } from '@/components/kit/status-text'
import { CardListRow } from '@/components/ui/card'
import { entryFacts, entryStatusText, showsCode } from '../_utils/entry-text'
import type { RosterEntry } from '../types'
import { CopyCodeButton } from './copy-code-button'
import { ExamRowMenu } from './exam-row-menu'

type Props = {
  sittingId: string
  personName: string
  deactivated: boolean
  entry: RosterEntry
  editable: boolean
  /** The header line already states the shared validity. */
  sharedExpiry: boolean
}

function Code({ entry, who }: Readonly<{ entry: RosterEntry; who: string }>) {
  if (!showsCode(entry) || entry.code === null)
    return <span className="text-muted-foreground">—</span>
  return (
    <>
      <code className="font-medium tracking-code">{entry.code}</code>
      <CopyCodeButton code={entry.code} label={`Copy code for ${who}`} />
    </>
  )
}

/** One exam of an expanded person: subject, code, status, ⋯. */
export function PersonExamItem({ entry, personName, sharedExpiry, ...menu }: Readonly<Props>) {
  const status = entryStatusText(entry)
  const caption = entryFacts(entry, { sharedExpiry })
  return (
    <CardListRow className="flex items-start gap-2 lg:items-center lg:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-row lg:items-center lg:gap-4">
        <div className="min-w-0 lg:flex-1">
          <span className="text-muted-foreground">{entry.subjectShort}</span>{' '}
          <span>{entry.subjectName}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:contents">
          <div className="flex w-col-md shrink-0 items-center gap-1">
            <Code entry={entry} who={`${entry.subjectShort}, ${personName}`} />
          </div>
          <div className="lg:w-col-xl lg:shrink-0">
            <StatusText label={status.label} tone={status.tone} caption={caption || undefined} />
          </div>
        </div>
      </div>
      <div className="shrink-0">
        <ExamRowMenu {...menu} entry={entry} personName={personName} />
      </div>
    </CardListRow>
  )
}
