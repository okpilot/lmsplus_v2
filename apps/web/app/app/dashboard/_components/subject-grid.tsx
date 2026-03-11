import type { SubjectProgress } from '@/lib/queries/dashboard'

type SubjectGridProps = {
  subjects: SubjectProgress[]
}

export function SubjectGrid({ subjects }: SubjectGridProps) {
  if (subjects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No subjects available yet. Questions need to be imported first.
      </p>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((subject) => (
        <SubjectCard key={subject.id} subject={subject} />
      ))}
    </div>
  )
}

function SubjectCard({ subject }: { subject: SubjectProgress }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{subject.code}</p>
          <p className="mt-0.5 text-sm font-medium">{subject.name}</p>
        </div>
        <span className="text-lg font-semibold tabular-nums">{subject.masteryPercentage}%</span>
      </div>
      <div className="mt-3">
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-all"
            style={{ width: `${subject.masteryPercentage}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {subject.answeredCorrectly} / {subject.totalQuestions} questions mastered
        </p>
      </div>
    </div>
  )
}
