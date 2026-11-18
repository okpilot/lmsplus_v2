import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { requireAdmin } from '@/lib/auth/require-admin'
import { InternalExamsContent } from './_components/internal-exams-content'
import { InternalExamsFallback } from './_components/internal-exams-fallback'
import { InternalExamsHeaderAction } from './_components/internal-exams-header-action'
import { parseInternalExamsSearchParams } from './_search-params'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function InternalExamsPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const params = parseInternalExamsSearchParams(await searchParams)

  return (
    <div className="space-y-section">
      <PageHeader title="Internal Exams" actions={<InternalExamsHeaderAction />} />
      <Suspense fallback={<InternalExamsFallback />}>
        <InternalExamsContent {...params} />
      </Suspense>
    </div>
  )
}
