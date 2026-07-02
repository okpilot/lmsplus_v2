import { redirect } from 'next/navigation'
import { getOralExamReport } from '@/lib/queries/oral-exam-report'
import { OralReportCard } from '../_components/oral-report-card'

export default async function OralExamReportPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params
  const report = await getOralExamReport(id)
  if (!report) redirect('/app/elp')

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Oral Exam Results</h1>
      <OralReportCard report={report} />
    </main>
  )
}
