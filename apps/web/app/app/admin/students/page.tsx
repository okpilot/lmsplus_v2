import { Suspense } from 'react'
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Student Management</h1>
        <p className="text-sm text-muted-foreground">
          Register and manage students on the platform.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-muted" />}>
        <StudentsContent filters={filters} />
      </Suspense>
    </div>
  )
}
