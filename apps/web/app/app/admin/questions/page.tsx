import { Suspense } from 'react'
import { z } from 'zod'
import { PageHeader } from '@/components/ui/heading'
import { requireAdmin } from '@/lib/auth/require-admin'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { QuestionsContent } from './_components/questions-content'
import { QuestionsContentFallback } from './_components/questions-content-fallback'
import type { QuestionFilters } from './types'

const STATUS_VALUES = ['active', 'draft'] as const

export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): QuestionFilters {
  return {
    subjectId:
      typeof params.subjectId === 'string' && z.uuid().safeParse(params.subjectId).success
        ? params.subjectId
        : undefined,
    topicId:
      typeof params.topicId === 'string' && z.uuid().safeParse(params.topicId).success
        ? params.topicId
        : undefined,
    subtopicId:
      typeof params.subtopicId === 'string' && z.uuid().safeParse(params.subtopicId).success
        ? params.subtopicId
        : undefined,
    status:
      typeof params.status === 'string' &&
      (STATUS_VALUES as readonly string[]).includes(params.status)
        ? (params.status as QuestionFilters['status'])
        : undefined,
    hasCalculations:
      params.hasCalculations === 'true'
        ? true
        : params.hasCalculations === 'false'
          ? false
          : undefined,
    search:
      typeof params.search === 'string'
        ? params.search.trim().slice(0, 200) || undefined
        : undefined,
    page: parsePageParam(params.page),
  }
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function QuestionsPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const filters = parseFilters(await searchParams)

  return (
    <div className="space-y-section">
      <PageHeader
        title="Question Editor"
        description="Manage questions in the EASA PPL question bank."
      />
      <Suspense fallback={<QuestionsContentFallback />}>
        <QuestionsContent filters={filters} />
      </Suspense>
    </div>
  )
}
