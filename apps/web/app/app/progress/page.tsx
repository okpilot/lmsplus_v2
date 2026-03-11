import { getProgressData } from '@/lib/queries/progress'
import { SubjectBreakdown } from './_components/subject-breakdown'

export const dynamic = 'force-dynamic'

export default async function ProgressPage() {
  const subjects = await getProgressData()

  const totalQuestions = subjects.reduce((sum, s) => sum + s.totalQuestions, 0)
  const totalCorrect = subjects.reduce((sum, s) => sum + s.answeredCorrectly, 0)
  const overallMastery = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Detailed breakdown of your mastery across all EASA subjects.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Overall Mastery</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{overallMastery}%</p>
        <div className="mt-3 h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${overallMastery}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {totalCorrect} / {totalQuestions} questions mastered
        </p>
      </div>

      <SubjectBreakdown subjects={subjects} />
    </main>
  )
}
