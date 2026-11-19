import { requireAdmin } from '@/lib/auth/require-admin'
import { PendingNoticesBanner } from '../_components/pending-notices-banner'
import { PeopleSection } from '../_components/people-section'
import { RemovedEntriesList } from '../_components/removed-entries-list'
import { ResultBanner } from '../_components/result-banner'
import { SittingCounts } from '../_components/sitting-counts'
import { SittingHeader } from '../_components/sitting-header'
import { SittingPopups } from '../_components/sitting-popups'
import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { loadSittingPage } from '../_utils/load-sitting-page'
import { parseSittingParams } from '../parse-sitting-params'

type PageProps = {
  params: Promise<{ sittingId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SittingPage({ params, searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const sp = parseSittingParams(await searchParams)
  const { sitting, summary, invigilators, notDue, roster, removed, editable, selection } =
    await loadSittingPage((await params).sittingId, sp)
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
        <PendingNoticesBanner count={summary.pendingRemovalNotices} sittingId={sitting.id} />
        <ResultBanner />
        <SittingCounts summary={summary} />
        <PeopleSection
          sittingId={sitting.id}
          status={summary.status}
          editable={editable}
          summary={summary}
          rows={roster.rows}
          total={roster.total}
          q={sp.q ?? ''}
          show={sp.show}
          page={sp.page}
        />
        <RemovedEntriesList rows={removed.rows} total={removed.total} />
        <SittingPopups sitting={sitting} params={sp} editable={editable} selection={selection} />
      </div>
    </SittingUiProvider>
  )
}
