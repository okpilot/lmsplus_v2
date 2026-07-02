import type { OralDescriptorScore } from '@/lib/queries/oral-exam-report'
import { LevelBadge } from './level-badge'

const DESCRIPTOR_LABELS: Record<string, string> = {
  pronunciation: 'Pronunciation',
  structure: 'Structure',
  vocabulary: 'Vocabulary',
  fluency: 'Fluency',
  comprehension: 'Comprehension',
  interaction: 'Interaction',
}

function labelFor(descriptor: string): string {
  return DESCRIPTOR_LABELS[descriptor] ?? descriptor
}

type Props = Readonly<{ score: OralDescriptorScore }>

export function DescriptorRow({ score }: Props) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-sm">{labelFor(score.descriptor)}</span>
        <LevelBadge level={score.level} />
      </div>
      {score.rationale && <p className="text-sm text-muted-foreground">{score.rationale}</p>}
    </div>
  )
}
