import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import type { SortDir, SortKey } from '@/lib/queries/reports'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { ReportsContent } from './_components/reports-content'
import { ReportsContentFallback } from './_components/reports-content-fallback'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function parseSortKey(value: string | string[] | undefined): SortKey {
  if (value === 'score' || value === 'subject') return value
  return 'date'
}

function parseSortDir(value: string | string[] | undefined): SortDir {
  if (value === 'asc') return 'asc'
  return 'desc'
}

export default async function ReportsPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const params = await searchParams
  const page = parsePageParam(params.page)
  const sort = parseSortKey(params.sort)
  const dir = parseSortDir(params.dir)

  return (
    <main className="space-y-section">
      <PageHeader title="Reports" />
      <Suspense fallback={<ReportsContentFallback />}>
        <ReportsContent page={page} sort={sort} dir={dir} />
      </Suspense>
    </main>
  )
}
