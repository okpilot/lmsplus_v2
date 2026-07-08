import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { getRtSubjectData } from '../actions/get-rt-subject'
import { VfrRtConfigForm } from './vfr-rt-config-form'

/**
 * Server component — fetches the RT subject id + topics, builds the
 * synthetic single-subject SubjectOption server-side, then renders the
 * client-side VfrRtConfigForm seeded with initial topic-tree state. Lives
 * inside a Suspense boundary in page.tsx.
 */
export async function VfrRtSetup({ userId }: Readonly<{ userId: string }>) {
  const { id, topics } = await getRtSubjectData()

  // Synthetic single-subject SubjectOption whose `id` MUST equal the real RT
  // subject uuid — the session handoff derives subjectName/subjectCode from
  // `subjects.find(s => s.id === subjectId)` inside useQuizStart.
  const subjects: SubjectOption[] = [
    {
      id,
      code: 'RT',
      name: 'VFR RT',
      short: 'RT',
      questionCount: topics.reduce((sum, t) => sum + t.questionCount, 0),
    },
  ]

  return (
    <VfrRtConfigForm userId={userId} subjectId={id} subjects={subjects} initialTopics={topics} />
  )
}
