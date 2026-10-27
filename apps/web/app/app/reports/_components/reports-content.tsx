import { redirect } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { SortDir, SortKey } from '@/lib/queries/reports'
import { getSessionReports, PAGE_SIZE } from '@/lib/queries/reports'
import { ReportsList } from './reports-list'

type Props = { page: number; sort: SortKey; dir: SortDir }

export async function ReportsContent({ page, sort, dir }: Readonly<Props>) {
  const result = await getSessionReports({ page, sort, dir })

  if (!result.ok) {
    return (
      <Alert tone="danger">
        <AlertDescription>Failed to load reports. Please try again.</AlertDescription>
      </Alert>
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
