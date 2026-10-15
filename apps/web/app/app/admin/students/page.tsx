import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { Skeleton } from '@/components/ui/skeleton'
import { StudentsContent } from './_components/students-content'
import type { StudentFilters } from './types'

const STATUS_VALUES = ['active', 'inactive'] as const
const ROLE_VALUES = ['admin', 'instructor', 'student'] as const

function parseFilters(params: Record<string, string | string[] | undefined>): StudentFilters {
  return {
    status:
      typeof params.status === 'string' &&
      (STATUS_VALUES as readonly string[]).includes(params.status)
        ? (params.status as StudentFilters['status'])
        : undefined,
    role:
      typeof params.role === 'string' && (ROLE_VALUES as readonly string[]).includes(params.role)
        ? (params.role as StudentFilters['role'])
        : undefined,
    search: typeof params.search === 'string' ? params.search.trim() || undefined : undefined,
  }
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function StudentsPage({ searchParams }: Readonly<PageProps>) {
  const filters = parseFilters(await searchParams)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Management"
        description="Register and manage students on the platform."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <StudentsContent filters={filters} />
      </Suspense>
    </div>
  )
}
