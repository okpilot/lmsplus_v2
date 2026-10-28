import { Card, CardContent } from '@/components/ui/card'
import { EmptyNote } from '@/components/ui/empty'
import { Meter } from '@/components/ui/meter'
import type { SubjectProgress } from '@/lib/queries/dashboard'
import { masteryMeterTone } from '@/lib/utils/mastery-tone'

type SubjectGridProps = {
  subjects: SubjectProgress[]
}

function getRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks === 1) return '1 week ago'
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`
  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`
}

export function SubjectGrid({ subjects }: Readonly<SubjectGridProps>) {
  if (subjects.length === 0) {
    return <EmptyNote>No subjects available yet.</EmptyNote>
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((subject) => (
        <SubjectCard key={subject.id} subject={subject} />
      ))}
    </div>
  )
}

function SubjectCard({ subject }: Readonly<{ subject: SubjectProgress }>) {
  const relativeDate = getRelativeDate(subject.lastPracticedAt)

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{subject.code}</span>
          <span className="font-semibold tabular-nums">{subject.masteryPercentage}%</span>
        </div>
        <p className="mt-1 font-medium">{subject.name}</p>
        <Meter
          value={subject.masteryPercentage}
          tone={masteryMeterTone(subject.masteryPercentage)}
          label={`${subject.name} mastery`}
          className="mt-3"
        />
        <p className="mt-2 text-xs text-muted-foreground">Last practiced: {relativeDate}</p>
      </CardContent>
    </Card>
  )
}
