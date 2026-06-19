import { redirect } from 'next/navigation'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { getActiveVfrRtSession, getVfrRtSubject } from '@/lib/queries/vfr-rt-exam'
import { VfrRtExamBriefing } from './_components/vfr-rt-exam-briefing'

export const dynamic = 'force-dynamic'

export default async function VfrRtExamPage() {
  await requireAuthUser()

  const activeSession = await getActiveVfrRtSession()
  if (activeSession) {
    redirect(`/app/vfr-rt-exam/in-progress/${activeSession.sessionId}`)
  }

  const subject = await getVfrRtSubject()
  if (!subject) {
    return (
      <main className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">VFR Radiotelephony Mock Exam</h1>
        <p className="text-sm text-muted-foreground">VFR RT mock exam is not available yet.</p>
      </main>
    )
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">VFR Radiotelephony Mock Exam</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subject.name}</p>
      </div>
      <VfrRtExamBriefing subjectId={subject.id} subjectName={subject.name} />
    </main>
  )
}
