import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { ResultBanner } from '../_components/result-banner'
import { SittingHeader } from '../_components/sitting-header'
import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { plural } from '../_utils/plural'
import { getSitting, getSummary, listInvigilatorOptions } from '../queries'

type PageProps = { params: Promise<{ sittingId: string }> }

const isoDay = (iso: string) => new Date(iso).toISOString().slice(0, 10)

export default async function SittingPage({ params }: Readonly<PageProps>) {
  await requireAdmin()
  const id = z.uuid().safeParse((await params).sittingId)
  if (!id.success) notFound()
  const summary = await getSummary(id.data)
  if (!summary) notFound()
  const [sitting, invigilators] = await Promise.all([getSitting(id.data), listInvigilatorOptions()])
  if (!sitting) notFound()
  const notDue = new Date().toISOString().slice(0, 10) < isoDay(sitting.scheduledAt)
  return (
    <SittingUiProvider key={sitting.id}>
      <div className="space-y-section">
        <SittingHeader
          sitting={sitting}
          summary={summary}
          invigilators={invigilators}
          notDue={notDue}
          dayEnded={summary.dayEnded}
        />
        <ResultBanner />
        <p className="text-body text-muted-foreground">
          {plural(summary.candidates, 'person', 'people')} · {plural(summary.entries, 'exam')} ·{' '}
          {plural(summary.codesIssued, 'code')} issued
        </p>
      </div>
    </SittingUiProvider>
  )
}
