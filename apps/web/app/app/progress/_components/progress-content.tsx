import { Meter } from '@/components/ui/meter'
import { Stat } from '@/components/ui/stat'
import { getProgressData } from '@/lib/queries/progress'
import { masteryMeterTone } from '@/lib/utils/mastery-tone'
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
            <Meter
              value={overallMastery}
              tone={masteryMeterTone(overallMastery)}
              label="Overall mastery"
              className="mt-2"
            />
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
