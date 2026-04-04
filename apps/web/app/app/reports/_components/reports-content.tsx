import { redirect } from 'next/navigation'
import type { SortDir, SortKey } from '@/lib/queries/reports'
import { getSessionReports, PAGE_SIZE } from '@/lib/queries/reports'
import { ReportsList } from './reports-list'

type Props = { page: number; sort: SortKey; dir: SortDir }

export async function ReportsContent({ page, sort, dir }: Readonly<Props>) {
  const result = await getSessionReports({ page, sort, dir })

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/50 p-8 text-center">
        <p className="text-sm text-destructive">Failed to load reports. Please try again.</p>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE))
  if (page > totalPages) {
    const params = new URLSearchParams()
    if (sort !== 'date') params.set('sort', sort)
    if (dir !== 'desc') params.set('dir', dir)
    if (totalPages > 1) params.set('page', String(totalPages))
    const qs = params.toString()
    redirect(`/app/reports${qs ? `?${qs}` : ''}`)
  }

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        {result.totalCount} completed {result.totalCount === 1 ? 'session' : 'sessions'}
      </p>
      <ReportsList
        sessions={result.sessions}
        page={page}
        totalCount={result.totalCount}
        pageSize={PAGE_SIZE}
        sort={sort}
        dir={dir}
      />
    </>
  )
}
