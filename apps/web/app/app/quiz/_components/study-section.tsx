import { getSubjectsWithCounts } from '@/lib/queries/quiz-subject-queries'
import { StudyConfigForm } from './study-config-form'

// `userId` is accepted for parity with SubjectsSection (the page passes it for
// every tab), but study mode needs no user-scoped server fetch: the flag feature
// resolves the caller server-side via auth.uid(), and there is no session handoff.
export async function StudySection(_props: { userId: string }) {
  const subjects = await getSubjectsWithCounts()
  return <StudyConfigForm subjects={subjects} />
}
