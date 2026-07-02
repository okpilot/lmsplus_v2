import { redirect } from 'next/navigation'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { deriveOralReportView } from '@/lib/elp/report-view'
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

  const view = deriveOralReportView(session)
  if (view === 'incomplete') redirect(`/app/elp/session/${id}`)

  if (view === 'graded') {
    const report = await getOralExamReport(id)
    if (!report) redirect('/app/elp')

    return (
      <main className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Oral Exam Results</h1>
        <OralReportCard report={report} />
      </main>
    )
  }

  return (
    <main className="space-y-6">
      <OralExamPending state={view} sessionId={id} />
    </main>
  )
}
