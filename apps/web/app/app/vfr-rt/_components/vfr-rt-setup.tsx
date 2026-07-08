import { getRtSubjectData } from '../actions/get-rt-subject'
import { VfrRtConfigForm } from './vfr-rt-config-form'

/**
 * Server component — fetches the RT subject id, its synthetic subject option,
 * and its topics, then renders the client-side VfrRtConfigForm seeded with
 * initial topic-tree state. Lives inside a Suspense boundary in page.tsx.
 */
export async function VfrRtSetup({ userId }: Readonly<{ userId: string }>) {
  const { id, subjects, topics } = await getRtSubjectData()

  return (
    <VfrRtConfigForm userId={userId} subjectId={id} subjects={subjects} initialTopics={topics} />
  )
}
