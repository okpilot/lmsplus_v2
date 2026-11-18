import { requireAdmin } from '@/lib/auth/require-admin'
import { ResultBanner } from '../_components/result-banner'
import { SittingCounts } from '../_components/sitting-counts'
import { SittingHeader } from '../_components/sitting-header'
import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { loadSittingPage } from '../_utils/load-sitting-page'

type PageProps = { params: Promise<{ sittingId: string }> }

export default async function SittingPage({ params }: Readonly<PageProps>) {
  await requireAdmin()
  const { sitting, summary, invigilators, notDue } = await loadSittingPage((await params).sittingId)
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
        <SittingCounts summary={summary} />
      </div>
    </SittingUiProvider>
  )
}
