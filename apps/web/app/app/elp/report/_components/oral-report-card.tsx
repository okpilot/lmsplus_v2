import type { OralExamReport } from '@/lib/queries/oral-exam-report'
import { DescriptorScores } from './descriptor-scores'
import { FinalLevelRing } from './final-level-ring'
import { OralSection } from './oral-section'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

type Props = Readonly<{ report: OralExamReport }>

export function OralReportCard({ report }: Props) {
  const dateStr = report.endedAt ?? report.startedAt

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-4 md:flex-row md:gap-6">
          <div className="shrink-0">
            <FinalLevelRing level={report.totalFinalLevel} size={120} />
          </div>
          <div className="flex-1 text-center md:text-left">
            <p className="font-semibold text-lg">Final ICAO Level</p>
            <p className="text-sm text-muted-foreground">
              Weakest-link across six descriptors · {formatDate(dateStr)}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              Status: {report.status}
            </p>
          </div>
        </div>
      </div>

      <DescriptorScores descriptors={report.descriptors} />

      {report.sections.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-semibold text-lg">Section Transcripts &amp; Scores</h2>
          {report.sections.map((section) => (
            <OralSection key={section.sectionNo} section={section} />
          ))}
        </section>
      )}
    </div>
  )
}
