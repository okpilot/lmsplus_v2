import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'
import { InternalExamsContent } from './_components/internal-exams-content'
import { InternalExamsFallback } from './_components/internal-exams-fallback'
import { parseInternalExamsSearchParams } from './_search-params'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function InternalExamsPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const { status, codesPage, attemptsPage } = parseInternalExamsSearchParams(await searchParams)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Internal Exams</h1>
        <p className="text-sm text-muted-foreground">
          Issue one-time exam codes to students and review past attempts.
        </p>
      </div>
      <Suspense fallback={<InternalExamsFallback />}>
        <InternalExamsContent status={status} codesPage={codesPage} attemptsPage={attemptsPage} />
      </Suspense>
    </div>
  )
}
