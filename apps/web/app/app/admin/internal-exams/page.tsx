import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { InternalExamsContent } from './_components/internal-exams-content'
import { InternalExamsFallback } from './_components/internal-exams-fallback'
import type { ListCodesFilters } from './types'

const CODE_STATUS_VALUES = ['active', 'consumed', 'expired', 'voided', 'finished'] as const

function parseCodeStatus(value: string | string[] | undefined): ListCodesFilters['status'] {
  return typeof value === 'string' && (CODE_STATUS_VALUES as readonly string[]).includes(value)
    ? (value as ListCodesFilters['status'])
    : undefined
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function InternalExamsPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const sp = await searchParams

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Internal Exams</h1>
        <p className="text-sm text-muted-foreground">
          Issue one-time exam codes to students and review past attempts.
        </p>
      </div>
      <Suspense fallback={<InternalExamsFallback />}>
        <InternalExamsContent
          status={parseCodeStatus(sp.status)}
          codesPage={parsePageParam(sp.codesPage)}
          attemptsPage={parsePageParam(sp.attemptsPage)}
        />
      </Suspense>
    </div>
  )
}
