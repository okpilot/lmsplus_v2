import type { OralSectionReport } from '@/lib/queries/oral-exam-report'
import { DescriptorRow } from './descriptor-row'

type Props = Readonly<{ section: OralSectionReport }>

export function OralSection({ section }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Section {section.sectionNo}</h3>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {section.status}
        </span>
      </div>
      {section.transcriptText ? (
        <p className="mb-4 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">
          {section.transcriptText}
        </p>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">No transcript available.</p>
      )}
      {section.scores.length > 0 && (
        <div>
          {section.scores.map((score) => (
            <DescriptorRow key={score.descriptor} score={score} />
          ))}
        </div>
      )}
    </div>
  )
}
