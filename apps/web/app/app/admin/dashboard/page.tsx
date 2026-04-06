import { parsePageParam } from '@/lib/utils/parse-page-param'
import type { DashboardFilters, TimeRange } from './types'

type SortKey = DashboardFilters['sort']

const TIME_RANGE_VALUES = ['7d', '30d', '90d', 'all'] as const
const SORT_VALUES = ['name', 'lastActive', 'sessions', 'avgScore', 'mastery'] as const
const DIR_VALUES = ['asc', 'desc'] as const
const STATUS_VALUES = ['active', 'inactive'] as const

export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): DashboardFilters {
  return {
    range:
      typeof params.range === 'string' &&
      (TIME_RANGE_VALUES as readonly string[]).includes(params.range)
        ? (params.range as TimeRange)
        : '30d',
    page: parsePageParam(params.page),
    sort:
      typeof params.sort === 'string' && (SORT_VALUES as readonly string[]).includes(params.sort)
        ? (params.sort as SortKey)
        : 'name',
    dir:
      typeof params.dir === 'string' && (DIR_VALUES as readonly string[]).includes(params.dir)
        ? (params.dir as 'asc' | 'desc')
        : 'asc',
    status:
      typeof params.status === 'string' &&
      (STATUS_VALUES as readonly string[]).includes(params.status)
        ? (params.status as 'active' | 'inactive')
        : undefined,
  }
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function AdminDashboardPage({ searchParams }: Readonly<PageProps>) {
  const _filters = parseFilters(await searchParams)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Instructor overview of your cohort</p>
      </div>
      {/* KPI cards, student table, weak topics, and recent activity */}
      {/* will be composed here in task 8 with Suspense boundaries */}
    </div>
  )
}
