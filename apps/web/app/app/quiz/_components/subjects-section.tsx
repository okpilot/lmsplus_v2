import { getMockExamSubjects } from '@/lib/queries/exam-subjects'
import { loadQuizSetupPreload } from '@/lib/queries/quiz-setup-preload'
import { getSubjectsWithCounts } from '@/lib/queries/quiz-subject-queries'
import { QuizConfigForm } from './quiz-config-form'

export async function SubjectsSection({ userId }: Readonly<{ userId: string }>) {
  const [subjects, examSubjects] = await Promise.all([
    getSubjectsWithCounts(),
    getMockExamSubjects(),
  ])
  // Unawaited on purpose: the form renders on the subjects alone and the preload streams in.
  const preload = loadQuizSetupPreload()
  return (
    <QuizConfigForm
      userId={userId}
      subjects={subjects}
      examSubjects={examSubjects}
      preload={preload}
    />
  )
}
