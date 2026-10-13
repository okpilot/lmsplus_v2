import { Stat } from '@/components/ui/stat'
import { getProgressData } from '@/lib/queries/progress'
import { getOverallMastery } from '../_lib/overall-mastery'
import { SubjectBreakdown } from './subject-breakdown'

export async function ProgressContent() {
  const subjects = await getProgressData()

  const { percentage: overallMastery, masteredCount, totalQuestions } = getOverallMastery(subjects)

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
