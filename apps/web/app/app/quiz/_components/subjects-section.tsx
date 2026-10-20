import { getDiscoveryCounts } from '@/lib/queries/discovery-counts'
import { getMockExamSubjects } from '@/lib/queries/exam-subjects'
import { getSubjectsWithCounts } from '@/lib/queries/quiz-subject-queries'
import { getAllTopicTrees } from '@/lib/queries/quiz-topic-trees'
import { QuizConfigForm } from './quiz-config-form'

export async function SubjectsSection({ userId }: Readonly<{ userId: string }>) {
  // Preload failure degrades to the per-subject actions, never an error page.
  const [subjects, examSubjects, topicsBySubject, discoveryCounts] = await Promise.all([
    getSubjectsWithCounts(),
    getMockExamSubjects(),
    getAllTopicTrees().catch(() => ({})),
    getDiscoveryCounts().catch(() => ({})),
  ])
  return (
    <QuizConfigForm
      userId={userId}
      subjects={subjects}
      examSubjects={examSubjects}
      preload={{ topicsBySubject, discoveryCounts }}
    />
  )
}
