import { Stat } from '@/components/ui/stat'
import { getProgressData } from '@/lib/queries/progress'
import { SubjectBreakdown } from './subject-breakdown'

export async function ProgressContent() {
  const subjects = await getProgressData()

  const totalQuestions = subjects.reduce((sum, s) => sum + s.totalQuestions, 0)
  const totalCorrect = subjects.reduce((sum, s) => sum + s.answeredCorrectly, 0)
  // totalCorrect counts orphan (now-draft) responses too, so it can exceed
  // totalQuestions — clamp both the bar percentage and the displayed count (#664).
  const overallMastery =
    totalQuestions > 0 ? Math.min(Math.round((totalCorrect / totalQuestions) * 100), 100) : 0
  const masteredCount = Math.min(totalCorrect, totalQuestions)

  return (
    <>
      <Stat
        label="Overall Mastery"
        value={`${overallMastery}%`}
        hint={
          <>
            <span className="mt-2 block h-2 w-full rounded-full bg-muted">
              <span
                className="block h-2 rounded-full bg-primary transition-all"
                style={{ width: `${overallMastery}%` }}
              />
            </span>
            <span className="mt-2 block">
              {masteredCount} / {totalQuestions} questions mastered
            </span>
          </>
        }
      />

      <SubjectBreakdown subjects={subjects} />
    </>
  )
}
