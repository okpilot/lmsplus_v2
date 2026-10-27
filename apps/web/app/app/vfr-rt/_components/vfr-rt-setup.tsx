import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
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
      <Empty>
        <EmptyHeader>
          <EmptyTitle as="h2">You are not enrolled in this course.</EmptyTitle>
          <EmptyDescription>
            Ask your instructor to enrol you in VFR Radiotelephony.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  const { id, subjects, topics, exam } = data

  return <VfrRtConfigForm subjectId={id} subjects={subjects} initialTopics={topics} exam={exam} />
}
