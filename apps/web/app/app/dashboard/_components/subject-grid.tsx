import type { SubjectProgress } from '@/lib/queries/dashboard'

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

function getBarColor(mastery: number): string {
  if (mastery < 50) return 'bg-red-500'
  if (mastery < 90) return 'bg-amber-500'
  return 'bg-green-500'
}

export function SubjectGrid({ subjects }: SubjectGridProps) {
  if (subjects.length === 0) {
    return <p className="text-sm text-muted-foreground">No subjects available yet.</p>
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((subject) => (
        <SubjectCard key={subject.id} subject={subject} />
      ))}
    </div>
  )
}

function SubjectCard({ subject }: { subject: SubjectProgress }) {
  const barColor = getBarColor(subject.masteryPercentage)
  const relativeDate = getRelativeDate(subject.lastPracticedAt)

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{subject.code}</span>
        <span className="font-semibold tabular-nums">{subject.masteryPercentage}%</span>
      </div>
      <p className="mt-1 font-medium">{subject.name}</p>
      <div className="mt-3 h-1.5 w-full rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full transition-all ${barColor}`}
          style={{ width: `${subject.masteryPercentage}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Last practiced: {relativeDate}</p>
    </div>
  )
}
