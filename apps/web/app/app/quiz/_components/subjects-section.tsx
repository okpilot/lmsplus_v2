import { getExamEnabledSubjects } from '@/lib/queries/exam-subjects'
import { getSubjectsWithCounts } from '@/lib/queries/quiz'
import { QuizConfigForm } from './quiz-config-form'

export async function SubjectsSection({ userId }: { userId: string }) {
  const [subjects, examSubjects] = await Promise.all([
    getSubjectsWithCounts(),
    getExamEnabledSubjects(),
  ])
  return <QuizConfigForm userId={userId} subjects={subjects} examSubjects={examSubjects} />
}
