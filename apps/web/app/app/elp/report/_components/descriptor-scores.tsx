import type { OralDescriptorScore } from '@/lib/queries/oral-exam-report'
import { DescriptorRow } from './descriptor-row'

type Props = Readonly<{ descriptors: OralDescriptorScore[] }>

export function DescriptorScores({ descriptors }: Props) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-2 font-semibold text-lg">Descriptor Breakdown</h2>
      {descriptors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No descriptor scores yet.</p>
      ) : (
        <div>
          {descriptors.map((score) => (
            <DescriptorRow key={score.descriptor} score={score} />
          ))}
        </div>
      )}
    </section>
  )
}
