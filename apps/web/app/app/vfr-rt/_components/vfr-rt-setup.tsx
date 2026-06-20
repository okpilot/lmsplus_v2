import { getRtSubjectData } from '../actions/get-rt-subject'
import { VfrRtConfigForm } from './vfr-rt-config-form'

/**
 * Server component — fetches RT subject + topic data, then renders the
 * client-side VfrRtConfigForm. Lives inside a Suspense boundary in page.tsx.
 */
export async function VfrRtSetup({ userId }: { userId: string }) {
  const { id: subjectId, parts } = await getRtSubjectData()

  return <VfrRtConfigForm userId={userId} subjectId={subjectId} parts={parts} />
}
