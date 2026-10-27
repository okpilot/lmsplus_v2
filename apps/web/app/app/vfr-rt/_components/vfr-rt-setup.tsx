import { EmptyState } from '@/components/kit/empty-state'
import { getRtSubjectData } from '../actions/get-rt-subject'
import { VfrRtConfigForm } from './vfr-rt-config-form'

/**
 * Server component — fetches the RT subject id, its synthetic subject option,
 * and its topics, then renders the client-side VfrRtConfigForm seeded with
 * initial topic-tree state. Lives inside a Suspense boundary in page.tsx.
 */
export async function VfrRtSetup() {
  const data = await getRtSubjectData()
  if (!data) {
    return (
      <EmptyState title="You are not enrolled in this course.">
        Ask your instructor to enrol you in VFR Radiotelephony.
      </EmptyState>
    )
  }
  const { id, subjects, topics, exam } = data

  return <VfrRtConfigForm subjectId={id} subjects={subjects} initialTopics={topics} exam={exam} />
}
