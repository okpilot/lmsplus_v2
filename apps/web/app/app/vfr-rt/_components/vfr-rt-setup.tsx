import { getRtSubjectData } from '../actions/get-rt-subject'
import { VfrRtConfigForm } from './vfr-rt-config-form'

/**
 * Server component — fetches the RT subject id, then renders the client-side
 * VfrRtConfigForm. Lives inside a Suspense boundary in page.tsx.
 */
export async function VfrRtSetup({ userId }: Readonly<{ userId: string }>) {
  const { id: subjectId } = await getRtSubjectData()

  return <VfrRtConfigForm userId={userId} subjectId={subjectId} />
}
