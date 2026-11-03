type SubjectTotals = Readonly<{ totalQuestions: number; answeredCorrectly: number }>

export type OverallMastery = {
  percentage: number
  masteredCount: number
  totalQuestions: number
}

export function getOverallMastery(subjects: ReadonlyArray<SubjectTotals>): OverallMastery {
  const totalQuestions = subjects.reduce((sum, s) => sum + s.totalQuestions, 0)
  const totalCorrect = subjects.reduce((sum, s) => sum + s.answeredCorrectly, 0)
  // totalCorrect counts orphan (now-draft) responses too, so it can exceed
  // totalQuestions — clamp both the bar percentage and the displayed count (#664).
  const percentage =
    totalQuestions > 0 ? Math.min(Math.round((totalCorrect / totalQuestions) * 100), 100) : 0
  return { percentage, masteredCount: Math.min(totalCorrect, totalQuestions), totalQuestions }
}
