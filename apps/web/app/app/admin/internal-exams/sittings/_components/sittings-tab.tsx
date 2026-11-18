'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { FilterSelect } from '@/app/app/_components/filter-select'
import { PaginationBar } from '@/app/app/_components/pagination-bar'
import { ListCard } from '@/components/admin/list-card'
import { EmptyDescription } from '@/components/ui/empty'
import { plural } from '../_utils/plural'
import { readScopeParam, scopeUrl } from '../_utils/scope-url'
import { SITTING_SCOPES, SITTINGS_PAGE_SIZE, type SittingRow, type SittingScope } from '../types'
import { SittingsTable } from './sittings-table'

type Props = {
  rows: SittingRow[]
  totalCount: number
  scope: SittingScope
  page?: number
}

const SCOPE_LABEL: Record<SittingScope, string> = {
  upcoming: 'Upcoming',
  open: 'Open now',
  past: 'Past',
  cancelled: 'Cancelled',
}
const EMPTY_COPY: Record<SittingScope, string> = {
  upcoming: 'No upcoming sittings.',
  open: 'No sittings open now.',
  past: 'No past sittings.',
  cancelled: 'No cancelled sittings.',
}
const SCOPE_ITEMS = SITTING_SCOPES.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))

export function SittingsTab({ rows, totalCount, scope, page = 1 }: Readonly<Props>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const setScope = (value: string | null) =>
    startTransition(() =>
      router.replace(
        scopeUrl(pathname, searchParams ?? new URLSearchParams(), readScopeParam(value)),
      ),
    )
  return (
    <ListCard
      filters={
        <FilterSelect
          value={scope}
          items={SCOPE_ITEMS}
          ariaLabel="Status"
          placeholder="Status"
          triggerClassName="w-col-md"
          onValueChange={setScope}
        />
      }
      summary={plural(totalCount, 'sitting')}
      footer={
        totalCount > SITTINGS_PAGE_SIZE ? (
          <PaginationBar
            page={page}
            pageSize={SITTINGS_PAGE_SIZE}
            totalCount={totalCount}
            entityLabel="sittings"
          />
        ) : undefined
      }
    >
      <div aria-busy={isPending}>
        {rows.length === 0 ? (
          <EmptyDescription className="p-card">{EMPTY_COPY[scope]}</EmptyDescription>
        ) : (
          <SittingsTable rows={rows} />
        )}
      </div>
    </ListCard>
  )
}
