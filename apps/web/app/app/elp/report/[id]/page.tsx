import { redirect } from 'next/navigation'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { getOralExamReport } from '@/lib/queries/oral-exam-report'
import { getOralExamSession } from '@/lib/queries/oral-exam-session'
import { OralExamPending } from '../_components/oral-exam-pending'
import { OralReportCard } from '../_components/oral-report-card'

export default async function OralExamReportPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireAuthUser()
  const { id } = await params

  const session = await getOralExamSession(id)
  if (!session) redirect('/app/elp')

  if (session.status === 'graded') {
    const report = await getOralExamReport(id)
    if (!report) redirect('/app/elp')

    return (
      <main className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Oral Exam Results</h1>
        <OralReportCard report={report} />
      </main>
    )
  }

  const hasFailedResponse = session.responses.some((r) => r.status === 'failed')

  return (
    <main className="space-y-6">
      {hasFailedResponse ? (
        <OralExamPending state="failed" sessionId={id} />
      ) : (
        <OralExamPending state="grading" sessionId={id} />
      )}
    </main>
  )
}
